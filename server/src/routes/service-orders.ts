import Router from '@koa/router';
import type { Context } from 'koa';
import { InventoryLedgerType } from '@prisma/client';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';
import { stockOut } from '../services/inventory-service';

const router = new Router({ prefix: '/service-orders' });

interface ServiceOrderItemInput {
  modelId?: string | number | null;
  inventoryItemId?: string | number | null;
  name?: string;
  price?: string | number;
  quantity?: number;
}

router.get('/', async (ctx: Context) => {
  const rows = await prisma.serviceOrder.findMany({
    orderBy: { id: 'desc' },
    include: {
      buyer: true,
      serviceCard: true,
      items: { include: { model: { include: { brand: true, category: true } }, inventoryItem: true } },
    },
  });
  ctx.body = { data: serialize(rows) };
});

router.post('/', async (ctx: Context) => {
  const body = ctx.request.body as {
    buyerId?: string | number;
    serviceCardId?: string | number | null;
    servedAt?: string;
    timesUsed?: number;
    note?: string | null;
    items?: ServiceOrderItemInput[];
  };
  if (!body.buyerId) throw new AppError(400, 'VALIDATION_ERROR', '消费者必填');
  const row = await prisma.$transaction(async (tx) => {
    const timesUsed = Number(body.timesUsed) || 1;
    if (body.serviceCardId) {
      const card = await tx.serviceCard.findUnique({ where: { id: BigInt(body.serviceCardId) } });
      if (!card) throw new AppError(404, 'NOT_FOUND', '次卡不存在');
      if (card.remainingTimes < timesUsed) throw new AppError(409, 'INSUFFICIENT_TIMES', '次卡剩余次数不足');
      await tx.serviceCard.update({
        where: { id: card.id },
        data: { remainingTimes: { decrement: timesUsed } },
      });
    }
    const created = await tx.serviceOrder.create({
      data: {
        buyerId: BigInt(body.buyerId!),
        serviceCardId: body.serviceCardId ? BigInt(body.serviceCardId) : null,
        servedAt: body.servedAt ? new Date(body.servedAt) : new Date(),
        timesUsed,
        note: body.note || null,
      },
    });
    let stockOutOrderId: bigint | null = null;
    for (const line of body.items ?? []) {
      let name = line.name?.trim();
      let modelId = line.modelId ? BigInt(line.modelId) : null;
      if (line.price === undefined || line.price === null || line.price === '') {
        throw new AppError(400, 'VALIDATION_ERROR', '卖价必填');
      }
      let unitPrice: string | number = line.price;
      if (modelId) {
        const model = await tx.productModel.findUnique({ where: { id: modelId } });
        if (!model) throw new AppError(404, 'NOT_FOUND', '型号不存在');
        if (!name) name = model.name;
      }
      if (line.inventoryItemId) {
        const inventoryItem = await tx.inventoryItem.findUnique({
          where: { id: BigInt(line.inventoryItemId) },
          include: { model: true },
        });
        if (!inventoryItem) throw new AppError(404, 'NOT_FOUND', '库存单品不存在');
        modelId = inventoryItem.modelId;
        if (!name) name = inventoryItem.model.name;
      }
      if (!name) throw new AppError(400, 'VALIDATION_ERROR', '服务商品名称必填');
      const item = await tx.serviceOrderItem.create({
        data: {
          serviceOrderId: created.id,
          modelId,
          inventoryItemId: line.inventoryItemId ? BigInt(line.inventoryItemId) : null,
          name,
          price: unitPrice,
          costPrice: 0,
          quantity: Number(line.quantity) || 1,
        },
      });
      if (modelId || line.inventoryItemId) {
        if (!stockOutOrderId) {
          const stockOutOrder = await tx.stockOutOrder.create({
            data: {
              sourceType: 'SERVICE_ORDER',
              sourceRefId: created.id,
              reason: '次卡核销出库',
              note: body.note || `服务核销 ${created.id}`,
            },
          });
          stockOutOrderId = stockOutOrder.id;
        }
        const cost = await stockOut(tx, {
          modelId,
          inventoryItemId: line.inventoryItemId,
          quantity: item.quantity,
          ledgerType: InventoryLedgerType.SERVICE_OUT,
          refType: 'service_order_item',
          refId: item.id,
        });
        await tx.serviceOrderItem.update({
          where: { id: item.id },
          data: { costPrice: cost.unitCost },
        });
        await tx.stockOutItem.create({
          data: {
            orderId: stockOutOrderId!,
            modelId: modelId!,
            inventoryItemId: line.inventoryItemId ? BigInt(line.inventoryItemId) : null,
            quantity: item.quantity,
          },
        });
      }
    }
    return tx.serviceOrder.findUnique({
      where: { id: created.id },
      include: { buyer: true, serviceCard: true, items: { include: { model: true, inventoryItem: true } } },
    });
  });
  ctx.status = 201;
  ctx.body = { data: serialize(row) };
});

export default router;
