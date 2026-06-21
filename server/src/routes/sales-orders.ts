import Router from '@koa/router';
import type { Context } from 'koa';
import { InventoryLedgerType, Prisma } from '@prisma/client';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';
import { stockOut } from '../services/inventory-service';
import { parsePageQuery, toPaginatedResult } from '../utils/pagination';

const router = new Router({ prefix: '/sales-orders' });

interface SalesItemInput {
  modelId?: string | number | null;
  inventoryItemId?: string | number | null;
  name?: string;
  price?: string | number;
  quantity?: number;
  attributes?: unknown;
}

interface SalesOrderBody {
  buyerId?: string | number;
  purchasedAt?: string;
  note?: string | null;
  items?: SalesItemInput[];
}

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

router.get('/', async (ctx: Context) => {
  const buyerName = queryText(ctx.query.buyerName);
  const brandId = queryText(ctx.query.brandId);
  const brand = queryText(ctx.query.brand);
  const modelId = queryText(ctx.query.modelId);
  const productName = queryText(ctx.query.productName);
  const categoryId = queryText(ctx.query.categoryId);
  const startDate = parseDate(ctx.query.startDate, false);
  const endDate = parseDate(ctx.query.endDate, true);

  const where: Prisma.SalesOrderWhereInput = {};
  if (buyerName) where.buyer = { name: { contains: buyerName } };
  if (startDate || endDate) {
    where.purchasedAt = {};
    if (startDate) where.purchasedAt.gte = startDate;
    if (endDate) where.purchasedAt.lte = endDate;
  }
  const itemFilters: Prisma.SalesOrderItemWhereInput[] = [];
  if (brandId) itemFilters.push({ model: { brandId: BigInt(brandId) } });
  if (brand) itemFilters.push({ model: { brand: { name: brand } } });
  if (modelId) itemFilters.push({ modelId: BigInt(modelId) });
  if (categoryId) itemFilters.push({ model: { categoryId: BigInt(categoryId) } });
  if (productName) itemFilters.push({ OR: [{ name: { contains: productName } }, { model: { name: { contains: productName } } }] });
  if (itemFilters.length === 1) where.items = { some: itemFilters[0] };
  if (itemFilters.length > 1) where.items = { some: { AND: itemFilters } };

  const { pageSize, skip, take } = parsePageQuery(ctx);
  const [rows, count, statItems] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      orderBy: { purchasedAt: 'desc' },
      skip,
      take,
      include: {
        buyer: true,
        items: { include: { model: { include: { category: true, brand: true } }, inventoryItem: true } },
        afterSales: true,
      },
    }),
    prisma.salesOrder.count({ where }),
    prisma.salesOrderItem.findMany({
      where: { order: where, status: { not: 'RETURNED' } },
      select: { price: true, quantity: true },
    }),
  ]);
  const grandTotal = statItems.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  ctx.body = {
    data: serialize({
      ...toPaginatedResult(rows, pageSize),
      purchaseCount: count,
      itemCount: statItems.length,
      grandTotal,
    }),
  };
});

router.post('/', async (ctx: Context) => {
  const body = ctx.request.body as SalesOrderBody;
  if (!body.buyerId) throw new AppError(400, 'VALIDATION_ERROR', '消费者必填');
  if (!body.items?.length) throw new AppError(400, 'VALIDATION_ERROR', '至少一条商品明细');

  const order = await prisma.$transaction(async (tx) => {
    const buyer = await tx.buyer.findUnique({ where: { id: BigInt(body.buyerId!) } });
    if (!buyer) throw new AppError(404, 'NOT_FOUND', '消费者不存在');
    const created = await tx.salesOrder.create({
      data: {
        buyerId: buyer.id,
        purchasedAt: body.purchasedAt ? new Date(body.purchasedAt) : new Date(),
        note: body.note || null,
      },
    });
    let stockOutOrderId: bigint | null = null;

    for (const line of body.items!) {
      if (line.price === undefined || line.price === null || line.price === '') {
        throw new AppError(400, 'VALIDATION_ERROR', '卖价必填');
      }
      let name = line.name?.trim();
      let modelId = line.modelId ? BigInt(line.modelId) : null;
      if (line.inventoryItemId) {
        const inv = await tx.inventoryItem.findUnique({
          where: { id: BigInt(line.inventoryItemId) },
          include: { model: true },
        });
        if (!inv) throw new AppError(404, 'NOT_FOUND', '库存单品不存在');
        modelId = inv.modelId;
        name ||= inv.model.name;
      } else if (modelId) {
        const model = await tx.productModel.findUnique({ where: { id: modelId } });
        if (!model) throw new AppError(404, 'NOT_FOUND', '型号不存在');
        name ||= model.name;
      }
      if (!name) throw new AppError(400, 'VALIDATION_ERROR', '商品名称必填');
      const quantity = Number(line.quantity) || 1;
      const item = await tx.salesOrderItem.create({
        data: {
          orderId: created.id,
          modelId,
          inventoryItemId: line.inventoryItemId ? BigInt(line.inventoryItemId) : null,
          name,
          price: line.price,
          costPrice: 0,
          quantity,
          attributes: (line.attributes as Prisma.InputJsonValue) ?? undefined,
        },
      });
      if (modelId || line.inventoryItemId) {
        if (!stockOutOrderId) {
          const stockOutOrder = await tx.stockOutOrder.create({
            data: {
              sourceType: 'SALES_ORDER',
              sourceRefId: created.id,
              reason: '订单出库',
              note: body.note || `销售订单 ${created.id}`,
            },
          });
          stockOutOrderId = stockOutOrder.id;
        }
        const cost = await stockOut(tx, {
          modelId,
          inventoryItemId: line.inventoryItemId,
          quantity,
          ledgerType: InventoryLedgerType.SALE_OUT,
          refType: 'sales_order_item',
          refId: item.id,
        });
        await tx.salesOrderItem.update({
          where: { id: item.id },
          data: { costPrice: cost.unitCost },
        });
        await tx.stockOutItem.create({
          data: {
            orderId: stockOutOrderId!,
            modelId: modelId!,
            inventoryItemId: line.inventoryItemId ? BigInt(line.inventoryItemId) : null,
            quantity,
          },
        });
      }
    }

    return tx.salesOrder.findUnique({
      where: { id: created.id },
      include: { buyer: true, items: { include: { model: { include: { category: true, brand: true } }, inventoryItem: true } } },
    });
  });

  ctx.status = 201;
  ctx.body = { data: serialize(order) };
});

router.get('/:id', async (ctx: Context) => {
  const row = await prisma.salesOrder.findUnique({
    where: { id: BigInt(ctx.params.id) },
    include: {
      buyer: true,
      items: { include: { model: { include: { category: true, brand: true } }, inventoryItem: true, afterSaleItems: true } },
      afterSales: { include: { items: true } },
    },
  });
  if (!row) throw new AppError(404, 'NOT_FOUND', '销售订单不存在');
  ctx.body = { data: serialize(row) };
});

router.delete('/:id', async (ctx: Context) => {
  const id = BigInt(ctx.params.id);
  await prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', '销售订单不存在');
    for (const item of order.items) {
      if (item.inventoryItemId) {
        await tx.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: { status: 'IN_STOCK' },
        });
      } else if (item.modelId) {
        let batch = await tx.inventoryBatch.findFirst({ where: { modelId: item.modelId } });
        if (!batch) {
          batch = await tx.inventoryBatch.create({
            data: { modelId: item.modelId, quantityOnHand: 0 },
          });
        }
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: { quantityOnHand: { increment: item.quantity } },
        });
      }
    }
    const stockOutOrders = await tx.stockOutOrder.findMany({
      where: { sourceType: 'SALES_ORDER', sourceRefId: id },
      select: { id: true },
    });
    if (stockOutOrders.length) {
      await tx.stockOutItem.deleteMany({
        where: { orderId: { in: stockOutOrders.map((item) => item.id) } },
      });
      await tx.stockOutOrder.deleteMany({
        where: { id: { in: stockOutOrders.map((item) => item.id) } },
      });
    }
    await tx.salesOrder.delete({ where: { id } });
  });
  ctx.status = 204;
});

export default router;
