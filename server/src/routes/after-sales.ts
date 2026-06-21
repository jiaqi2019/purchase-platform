import Router from '@koa/router';
import type { Context } from 'koa';
import { AfterSaleStatus, AfterSaleType, InventoryLedgerType, InventoryStatus, Prisma } from '@prisma/client';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';
import { restockSalesItem } from '../services/inventory-service';

const router = new Router({ prefix: '/after-sales' });

interface AfterSaleItemInput {
  salesOrderItemId?: string | number;
  quantity?: number;
  newAttributes?: Record<string, unknown>;
}

interface AfterSaleBody {
  salesOrderId?: string | number;
  type?: AfterSaleType;
  note?: string | null;
  items?: AfterSaleItemInput[];
}

function attr(attributes: Record<string, unknown> | undefined, code: string): string | null {
  const value = attributes?.[code] ?? attributes?.[code.toUpperCase()] ?? attributes?.[code.toLowerCase()];
  return value == null || value === '' ? null : String(value);
}

router.get('/', async (ctx: Context) => {
  const rows = await prisma.afterSaleOrder.findMany({
    orderBy: { id: 'desc' },
    take: 100,
    include: {
      salesOrder: { include: { buyer: true } },
      items: { include: { salesOrderItem: { include: { model: { include: { brand: true, category: true } } } } } },
    },
  });
  ctx.body = { data: serialize(rows) };
});

router.post('/', async (ctx: Context) => {
  const body = ctx.request.body as AfterSaleBody;
  if (!body.salesOrderId || !body.type || !body.items?.length) {
    throw new AppError(400, 'VALIDATION_ERROR', '原订单、售后类型和明细必填');
  }
  const row = await prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({ where: { id: BigInt(body.salesOrderId!) } });
    if (!order) throw new AppError(404, 'NOT_FOUND', '销售订单不存在');
    const created = await tx.afterSaleOrder.create({
      data: {
        salesOrderId: order.id,
        type: body.type!,
        status: body.type === AfterSaleType.RETURN ? AfterSaleStatus.COMPLETED : AfterSaleStatus.PROCESSING,
        note: body.note || null,
        completedAt: body.type === AfterSaleType.RETURN ? new Date() : null,
      },
    });
    for (const line of body.items!) {
      if (!line.salesOrderItemId) throw new AppError(400, 'VALIDATION_ERROR', '销售明细必填');
      const salesItem = await tx.salesOrderItem.findUnique({
        where: { id: BigInt(line.salesOrderItemId) },
      });
      if (!salesItem || salesItem.orderId !== order.id) {
        throw new AppError(404, 'NOT_FOUND', '销售明细不存在');
      }
      if (salesItem.status !== 'SOLD') {
        throw new AppError(409, 'INVALID_STATE', '该明细已售后，不能重复发起售后');
      }
      await tx.afterSaleItem.create({
        data: {
          afterSaleOrderId: created.id,
          salesOrderItemId: salesItem.id,
          quantity: Number(line.quantity) || salesItem.quantity,
          newAttributes: (line.newAttributes as Prisma.InputJsonValue) ?? undefined,
        },
      });
      if (body.type === AfterSaleType.RETURN) {
        await restockSalesItem(tx, salesItem.id, Number(line.quantity) || salesItem.quantity, 'after_sale_order', created.id);
        await tx.salesOrderItem.update({ where: { id: salesItem.id }, data: { status: 'RETURNED' } });
      } else {
        await tx.salesOrderItem.update({ where: { id: salesItem.id }, data: { status: 'EXCHANGING' } });
        if (salesItem.inventoryItemId) {
          await tx.inventoryItem.update({
            where: { id: salesItem.inventoryItemId },
            data: { status: InventoryStatus.EXCHANGING },
          });
        }
      }
    }
    await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        status:
          body.type === AfterSaleType.RETURN
            ? (await tx.salesOrderItem.count({
                where: { orderId: order.id, status: 'SOLD' },
              })) === 0
              ? 'RETURNED'
              : 'PARTIALLY_RETURNED'
            : 'COMPLETED',
      },
    });
    return tx.afterSaleOrder.findUnique({ where: { id: created.id }, include: { items: true } });
  });
  ctx.status = 201;
  ctx.body = { data: serialize(row) };
});

router.post('/:id/complete-exchange', async (ctx: Context) => {
  const id = BigInt(ctx.params.id);
  const body = ctx.request.body as { items?: AfterSaleItemInput[] };
  const row = await prisma.$transaction(async (tx) => {
    const order = await tx.afterSaleOrder.findUnique({
      where: { id },
      include: { items: { include: { salesOrderItem: true } } },
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', '售后单不存在');
    if (order.type !== AfterSaleType.EXCHANGE) throw new AppError(400, 'VALIDATION_ERROR', '只有换货单可完成换货');

    for (const item of order.items) {
      const override = body.items?.find((x) => String(x.salesOrderItemId) === String(item.salesOrderItemId));
      const attributes = override?.newAttributes ?? (item.newAttributes as Record<string, unknown> | undefined);
      if (item.salesOrderItem.modelId) {
        const inventoryItem = await tx.inventoryItem.create({
          data: {
            modelId: item.salesOrderItem.modelId,
            attributes: (attributes as Prisma.InputJsonValue) ?? undefined,
            imei: attr(attributes, 'imei'),
            imei2: attr(attributes, 'imei2'),
            sn: attr(attributes, 'sn'),
          },
        });
        await tx.afterSaleItem.update({
          where: { id: item.id },
          data: { newInventoryItemId: inventoryItem.id, newAttributes: (attributes as Prisma.InputJsonValue) ?? undefined },
        });
        await tx.inventoryLedger.create({
          data: {
            type: InventoryLedgerType.EXCHANGE_IN,
            modelId: item.salesOrderItem.modelId,
            inventoryItemId: inventoryItem.id,
            quantity: 1,
            refType: 'after_sale_order',
            refId: order.id,
          },
        });
      }
      await tx.salesOrderItem.update({ where: { id: item.salesOrderItemId }, data: { status: 'EXCHANGED' } });
    }

    return tx.afterSaleOrder.update({
      where: { id },
      data: { status: AfterSaleStatus.COMPLETED, completedAt: new Date() },
      include: { items: true },
    });
  });
  ctx.body = { data: serialize(row) };
});

export default router;
