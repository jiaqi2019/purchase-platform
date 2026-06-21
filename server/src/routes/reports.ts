import Router from '@koa/router';
import type { Context } from 'koa';
import dayjs from 'dayjs';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';

const router = new Router({ prefix: '/reports' });

type Period = 'week' | 'month' | 'year' | 'custom';

function queryText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDate(value: unknown, endOfDay: boolean): Date | undefined {
  const text = queryText(value);
  if (!text) return undefined;
  const d = new Date(text.includes('T') ? text : `${text}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return d;
}

function resolveRange(period: Period, startDate?: string, endDate?: string) {
  const now = dayjs();
  if (period === 'custom') {
    const start = parseDate(startDate, false);
    const end = parseDate(endDate, true);
    if (!start || !end) {
      throw new AppError(400, 'VALIDATION_ERROR', '自定义范围需要开始日期和结束日期');
    }
    return { startDate: start, endDate: end };
  }

  if (period === 'week') {
    const day = now.day();
    const offset = (day + 6) % 7;
    return {
      startDate: now.subtract(offset, 'day').startOf('day').toDate(),
      endDate: now.toDate(),
    };
  }
  if (period === 'year') {
    return { startDate: now.startOf('year').toDate(), endDate: now.toDate() };
  }
  return { startDate: now.startOf('month').toDate(), endDate: now.toDate() };
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function positiveMoney(value: unknown): number | null {
  const n = toNumber(value);
  return n > 0 ? n : null;
}

function itemRevenue<T extends { price: unknown; quantity: number }>(items: T[]): number {
  return items.reduce((sum, item) => sum + toNumber(item.price) * Number(item.quantity || 1), 0);
}

function resolveUnitCost<T extends {
  price?: unknown;
  costPrice?: unknown;
  quantity: number;
  model?: { id?: unknown } | null;
  inventoryItem?: { costPrice?: unknown | null } | null;
}>(item: T, batchCostByModelId: Map<string, number>): number {
  const direct = positiveMoney(item.costPrice);
  if (direct != null) return direct;
  const inventoryItemCost = positiveMoney(item.inventoryItem?.costPrice);
  if (inventoryItemCost != null) return inventoryItemCost;
  const modelId = item.model?.id == null ? null : String(item.model.id);
  if (modelId && batchCostByModelId.has(modelId)) return batchCostByModelId.get(modelId)!;
  return 0;
}

function returnedItemRevenue<T extends { price: unknown; quantity: number; status?: string }>(items: T[]): number {
  return items.reduce((sum, item) => {
    if (item.status !== 'RETURNED') return sum;
    return sum + toNumber(item.price) * Number(item.quantity || 1);
  }, 0);
}

function returnedItemCost<T extends {
  quantity: number;
  status?: string;
  costPrice?: unknown;
  model?: { id?: unknown } | null;
  inventoryItem?: { costPrice?: unknown | null } | null;
}>(items: T[], batchCostByModelId: Map<string, number>): number {
  return items.reduce((sum, item) => {
    if (item.status !== 'RETURNED') return sum;
    const unit = resolveUnitCost(item, batchCostByModelId);
    return sum + unit * Number(item.quantity || 1);
  }, 0);
}

router.get('/profit', async (ctx: Context) => {
  const period = (queryText(ctx.query.period) || 'month') as Period;
  const { startDate, endDate } = resolveRange(period, queryText(ctx.query.startDate), queryText(ctx.query.endDate));

  const [salesOrders, repairOrders, serviceOrders, serviceCardsInRange, allServiceCards] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { purchasedAt: { gte: startDate, lte: endDate } },
      include: {
        items: { include: { model: true, inventoryItem: true } },
      },
    }),
    prisma.repairOrder.findMany({
      where: { repairedAt: { gte: startDate, lte: endDate } },
      include: {
        items: { include: { model: true, inventoryItem: true } },
      },
    }),
    prisma.serviceOrder.findMany({
      where: { servedAt: { gte: startDate, lte: endDate } },
      include: {
        items: { include: { model: true, inventoryItem: true } },
      },
    }),
    prisma.serviceCard.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      select: { rechargeAmount: true },
    }),
    prisma.serviceCard.findMany({
      select: { rechargeAmount: true, totalTimes: true, remainingTimes: true },
    }),
  ]);

  const modelIds = Array.from(
    new Set(
      [...salesOrders, ...repairOrders, ...serviceOrders]
        .flatMap((order) => order.items.map((item) => item.model?.id))
        .filter((id): id is bigint => id != null),
    ),
  );
  const batchCostRows = modelIds.length
    ? await prisma.inventoryBatch.findMany({
        where: { modelId: { in: modelIds }, quantityOnHand: { gt: 0 }, costPrice: { not: null } },
        orderBy: [{ modelId: 'asc' }, { id: 'asc' }],
        select: { modelId: true, costPrice: true },
      })
    : [];
  const batchCostByModelId = new Map<string, number>();
  for (const row of batchCostRows) {
    const key = String(row.modelId);
    if (!batchCostByModelId.has(key)) {
      const cost = positiveMoney(row.costPrice);
      if (cost != null) batchCostByModelId.set(key, cost);
    }
  }

  const salesRevenueGross = salesOrders.reduce((sum, order) => sum + itemRevenue(order.items), 0);
  const salesCostGross = salesOrders.reduce(
    (sum, order) => sum + order.items.reduce((inner, item) => inner + resolveUnitCost(item, batchCostByModelId) * Number(item.quantity || 1), 0),
    0,
  );
  const salesRefundRevenue = salesOrders.reduce((sum, order) => sum + returnedItemRevenue(order.items), 0);
  const salesRefundCost = salesOrders.reduce((sum, order) => sum + returnedItemCost(order.items, batchCostByModelId), 0);
  const salesRevenue = salesRevenueGross - salesRefundRevenue;
  const salesCost = salesCostGross - salesRefundCost;
  const repairRevenue = repairOrders.reduce((sum, order) => sum + itemRevenue(order.items), 0);
  const repairCost = repairOrders.reduce(
    (sum, order) => sum + order.items.reduce((inner, item) => inner + resolveUnitCost(item, batchCostByModelId) * Number(item.quantity || 1), 0),
    0,
  );
  const serviceRevenue = serviceOrders.reduce((sum, order) => sum + itemRevenue(order.items), 0);
  const serviceCost = serviceOrders.reduce(
    (sum, order) => sum + order.items.reduce((inner, item) => inner + resolveUnitCost(item, batchCostByModelId) * Number(item.quantity || 1), 0),
    0,
  );
  const serviceCardRechargeAmount = serviceCardsInRange.reduce((sum, card) => sum + toNumber(card.rechargeAmount), 0);
  const serviceCardRemainingAmount = allServiceCards.reduce((sum, card) => {
    if (Number(card.totalTimes) <= 0) return sum;
    return sum + (toNumber(card.rechargeAmount) * Number(card.remainingTimes || 0)) / Number(card.totalTimes);
  }, 0);

  const totalRevenue = salesRevenue + repairRevenue + serviceRevenue;
  const totalCost = salesCost + repairCost + serviceCost;

  ctx.body = {
    data: serialize({
      period,
      startDate,
      endDate,
      salesRevenue,
      salesCost,
      salesProfit: salesRevenue - salesCost,
      salesRevenueGross,
      salesCostGross,
      salesRefundRevenue,
      salesRefundCost,
      repairRevenue,
      repairCost,
      repairProfit: repairRevenue - repairCost,
      serviceRevenue,
      serviceCost,
      serviceProfit: serviceRevenue - serviceCost,
      serviceCardRechargeAmount,
      serviceCardRemainingAmount,
      totalRevenue,
      totalCost,
      totalProfit: totalRevenue - totalCost,
      salesOrderCount: salesOrders.length,
      repairOrderCount: repairOrders.length,
      serviceOrderCount: serviceOrders.length,
      serviceCardCount: serviceCardsInRange.length,
    }),
  };
});

export default router;
