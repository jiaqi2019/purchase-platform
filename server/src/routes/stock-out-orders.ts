import Router from '@koa/router';
import type { Context } from 'koa';
import { InventoryLedgerType, InventoryStatus } from '@prisma/client';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';
import { stockOut } from '../services/inventory-service';

const router = new Router({ prefix: '/stock-out-orders' });

interface StockOutItemInput {
  modelId?: string | number | null;
  inventoryItemId?: string | number | null;
  quantity?: number;
}

interface StockOutBody {
  reason?: string | null;
  note?: string | null;
  items?: StockOutItemInput[];
}

router.get('/', async (ctx: Context) => {
  const rows = await prisma.stockOutOrder.findMany({
    orderBy: { id: 'desc' },
    take: 100,
    include: {
      items: {
        include: {
          model: { include: { category: true, brand: true } },
          inventoryItem: true,
        },
      },
    },
  });
  ctx.body = { data: serialize(rows) };
});

router.get('/:id', async (ctx: Context) => {
  const row = await prisma.stockOutOrder.findUnique({
    where: { id: BigInt(ctx.params.id) },
    include: {
      items: {
        include: {
          model: { include: { category: true, brand: true, specDefinitions: true } },
          inventoryItem: true,
        },
      },
    },
  });
  if (!row) throw new AppError(404, 'NOT_FOUND', '出库单不存在');
  ctx.body = { data: serialize(row) };
});

router.post('/', async (ctx: Context) => {
  const body = ctx.request.body as StockOutBody;
  if (!body.items?.length) throw new AppError(400, 'VALIDATION_ERROR', '至少一条出库明细');

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.stockOutOrder.create({
      data: { sourceType: 'MANUAL', reason: body.reason || null, note: body.note || null },
    });

    for (const line of body.items!) {
      if (!line.modelId && !line.inventoryItemId) {
        throw new AppError(400, 'VALIDATION_ERROR', '型号或库存单品必填');
      }
      let modelId = line.modelId ? BigInt(line.modelId) : null;
      if (line.inventoryItemId) {
        const inventoryItem = await tx.inventoryItem.findUnique({
          where: { id: BigInt(line.inventoryItemId) },
          select: { modelId: true },
        });
        if (!inventoryItem) throw new AppError(404, 'NOT_FOUND', '库存单品不存在');
        modelId = inventoryItem.modelId;
      }
      if (!modelId) throw new AppError(400, 'VALIDATION_ERROR', '型号必填');
      const item = await tx.stockOutItem.create({
        data: {
          orderId: created.id,
          modelId,
          inventoryItemId: line.inventoryItemId ? BigInt(line.inventoryItemId) : null,
          quantity: Number(line.quantity) || 1,
        },
      });
      await stockOut(tx, {
        modelId,
        inventoryItemId: line.inventoryItemId,
        quantity: item.quantity,
        ledgerType: InventoryLedgerType.STOCK_OUT,
        refType: 'stock_out_item',
        refId: item.id,
        nextStatus: InventoryStatus.OUT_OF_STOCK,
        note: body.reason || body.note || null,
      });
    }

    return tx.stockOutOrder.findUnique({
      where: { id: created.id },
      include: { items: { include: { model: { include: { category: true, brand: true } }, inventoryItem: true } } },
    });
  });

  ctx.status = 201;
  ctx.body = { data: serialize(order) };
});

export default router;
