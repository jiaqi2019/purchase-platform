import Router from '@koa/router';
import type { Context } from 'koa';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';
import { createPurchase, deletePurchase } from '../services/purchase-service';
import type { CreatePurchaseInput, PurchaseItemInput } from '../types/purchase';
import type { Prisma } from '@prisma/client';

const router = new Router({ prefix: '/purchases' });

function queryText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDateBoundary(value: unknown, endOfDay: boolean): Date | null {
  const text = queryText(value);
  if (!text) return null;
  const d = new Date(text.includes('T') ? text : `${text}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

router.get('/', async (ctx: Context) => {
  const buyerName = queryText(ctx.query.buyerName) || queryText(ctx.query.name);
  const brand = queryText(ctx.query.brand);
  const productName = queryText(ctx.query.productName) || queryText(ctx.query.phoneName);
  const startDate = parseDateBoundary(ctx.query.startDate, false);
  const endDate = parseDateBoundary(ctx.query.endDate, true);

  const where: Prisma.PurchaseWhereInput = {};

  if (startDate || endDate) {
    where.purchasedAt = {};
    if (startDate) where.purchasedAt.gte = startDate;
    if (endDate) where.purchasedAt.lte = endDate;
  }

  if (buyerName) {
    where.buyer = { name: { contains: buyerName } };
  }

  const itemFilters: Prisma.PurchaseItemWhereInput[] = [];
  if (brand) {
    itemFilters.push({
      product: { brand: { name: brand } },
    });
  }
  if (productName) {
    itemFilters.push({ name: { contains: productName } });
  }
  if (itemFilters.length === 1) {
    where.items = { some: itemFilters[0] };
  } else if (itemFilters.length > 1) {
    where.items = { some: { AND: itemFilters } };
  }

  const purchases = await prisma.purchase.findMany({
    where,
    orderBy: { purchasedAt: 'desc' },
    include: {
      buyer: true,
      items: {
        include: { product: { include: { brand: true } } },
      },
    },
  });

  const buyerMap = new Map<string, { id: bigint; name: string }>();
  let grandTotal = 0;
  for (const p of purchases) {
    if (p.buyer) {
      buyerMap.set(p.buyer.id.toString(), { id: p.buyer.id, name: p.buyer.name });
    }
    for (const item of p.items) {
      grandTotal += Number(item.price) * item.quantity;
    }
  }

  ctx.body = {
    data: serialize({
      buyers: [...buyerMap.values()],
      purchases,
      grandTotal,
    }),
  };
});

router.post('/', async (ctx: Context) => {
  const { buyerId, purchasedAt, note, items } = ctx.request.body as CreatePurchaseInput;
  if (!buyerId) throw new AppError(400, 'VALIDATION_ERROR', 'buyerId 必填');
  if (note != null && String(note).length > 500) {
    throw new AppError(400, 'VALIDATION_ERROR', '备注最多 500 个字符');
  }
  for (const item of items || []) {
    if (!item.name?.trim()) throw new AppError(400, 'VALIDATION_ERROR', '明细名称必填');
    if (item.price === undefined || item.price === null || item.price === '') {
      throw new AppError(400, 'VALIDATION_ERROR', '明细购买价必填');
    }
  }
  const purchase = await createPurchase({
    buyerId,
    purchasedAt,
    note,
    items: items as PurchaseItemInput[],
  });
  const full = await prisma.purchase.findUnique({
    where: { id: purchase.id },
    include: { items: true, buyer: true },
  });
  ctx.status = 201;
  ctx.body = { data: serialize(full) };
});

router.delete('/:id', async (ctx: Context) => {
  await deletePurchase(ctx.params.id);
  ctx.status = 204;
});

export default router;
