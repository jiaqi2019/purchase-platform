import Router from '@koa/router';
import type { Context } from 'koa';
import { InventoryLedgerType } from '@prisma/client';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';
import { stockOut } from '../services/inventory-service';

const router = new Router({ prefix: '/repair-orders' });

interface RepairItemInput {
  modelId?: string | number | null;
  inventoryItemId?: string | number | null;
  name?: string;
  price?: string | number;
  quantity?: number;
}

interface RepairBody {
  buyerId?: string | number | null;
  salesOrderItemId?: string | number | null;
  externalDevice?: string | null;
  fault?: string | null;
  repairFee?: string | number | null;
  repairedAt?: string;
  note?: string | null;
  items?: RepairItemInput[];
}

router.get('/', async (ctx: Context) => {
  const rows = await prisma.repairOrder.findMany({
    orderBy: { id: 'desc' },
    take: 100,
    include: { buyer: true, items: { include: { model: { include: { brand: true, category: true } } } } },
  });
  ctx.body = { data: serialize(rows) };
});

router.post('/', async (ctx: Context) => {
  const body = ctx.request.body as RepairBody;
  if (!body.items?.length) throw new AppError(400, 'VALIDATION_ERROR', '至少一条维修配件明细');
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.repairOrder.create({
      data: {
        buyerId: body.buyerId ? BigInt(body.buyerId) : null,
        salesOrderItemId: body.salesOrderItemId ? BigInt(body.salesOrderItemId) : null,
        externalDevice: body.externalDevice || null,
        fault: body.fault || null,
        repairFee:
          body.repairFee === undefined || body.repairFee === null || body.repairFee === ''
            ? 0
            : body.repairFee,
        repairedAt: body.repairedAt ? new Date(body.repairedAt) : new Date(),
        note: body.note || null,
      },
    });
    let stockOutOrderId: bigint | null = null;
    for (const line of body.items!) {
      if (line.price === undefined || line.price === null || line.price === '') {
        throw new AppError(400, 'VALIDATION_ERROR', '维修明细卖价必填');
      }
      let name = line.name?.trim();
      let modelId = line.modelId ? BigInt(line.modelId) : null;
      if (modelId && !name) {
        const model = await tx.productModel.findUnique({ where: { id: modelId } });
        if (!model) throw new AppError(404, 'NOT_FOUND', '型号不存在');
        name = model.name;
      }
      if (line.inventoryItemId) {
        const inventoryItem = await tx.inventoryItem.findUnique({
          where: { id: BigInt(line.inventoryItemId) },
          include: { model: true },
        });
        if (!inventoryItem) throw new AppError(404, 'NOT_FOUND', '库存单品不存在');
        if (!modelId) modelId = inventoryItem.modelId;
        if (!name) name = inventoryItem.model.name;
      }
      if (!name) throw new AppError(400, 'VALIDATION_ERROR', '维修明细名称必填');
      const item = await tx.repairOrderItem.create({
        data: {
          repairOrderId: created.id,
          modelId,
          inventoryItemId: line.inventoryItemId ? BigInt(line.inventoryItemId) : null,
          name,
          price: line.price,
          costPrice: 0,
          quantity: Number(line.quantity) || 1,
        },
      });
      if (modelId || line.inventoryItemId) {
        if (!stockOutOrderId) {
          const stockOutOrder = await tx.stockOutOrder.create({
            data: {
              sourceType: 'REPAIR_ORDER',
              sourceRefId: created.id,
              reason: '维修出库',
              note: body.note || `维修单 ${created.id}`,
            },
          });
          stockOutOrderId = stockOutOrder.id;
        }
        const cost = await stockOut(tx, {
          modelId,
          inventoryItemId: line.inventoryItemId,
          quantity: item.quantity,
          ledgerType: InventoryLedgerType.REPAIR_OUT,
          refType: 'repair_order_item',
          refId: item.id,
        });
        await tx.repairOrderItem.update({
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
    return tx.repairOrder.findUnique({ where: { id: created.id }, include: { buyer: true, items: true } });
  });
  ctx.status = 201;
  ctx.body = { data: serialize(row) };
});

router.post('/:id/complete', async (ctx: Context) => {
  const row = await prisma.repairOrder.update({
    where: { id: BigInt(ctx.params.id) },
    data: { status: 'COMPLETED' },
    include: { buyer: true, items: true },
  });
  ctx.body = { data: serialize(row) };
});

export default router;
