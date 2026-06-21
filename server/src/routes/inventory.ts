import Router from '@koa/router';
import type { Context } from 'koa';
import type { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { parsePageQuery, toPaginatedResult } from '../utils/pagination';

const router = new Router({ prefix: '/inventory' });

router.get('/items', async (ctx: Context) => {
  const { modelId, brandId, categoryId, status, q } = ctx.query;
  const where: Prisma.InventoryItemWhereInput = {};
  if (modelId) where.modelId = BigInt(String(modelId));
  if (status && typeof status === 'string') where.status = status as Prisma.EnumInventoryStatusFilter['equals'];
  if (brandId || categoryId || (typeof q === 'string' && q.trim())) {
    where.model = {};
    if (brandId) where.model.brandId = BigInt(String(brandId));
    if (categoryId) where.model.categoryId = BigInt(String(categoryId));
    if (typeof q === 'string' && q.trim()) {
      const keyword = q.trim();
      where.OR = [
        { imei: { contains: keyword } },
        { imei2: { contains: keyword } },
        { sn: { contains: keyword } },
        { model: { name: { contains: keyword } } },
      ];
    }
  }
  const { pageSize, skip, take } = parsePageQuery(ctx);
  const rows = await prisma.inventoryItem.findMany({
    where,
    orderBy: { id: 'desc' },
    skip,
    take,
    include: { model: { include: { category: true, brand: true } } },
  });
  ctx.body = { data: serialize(toPaginatedResult(rows, pageSize)) };
});

router.get('/batches', async (ctx: Context) => {
  const { modelId, brandId, categoryId, q } = ctx.query;
  const where: Prisma.InventoryBatchWhereInput = {};
  if (modelId) where.modelId = BigInt(String(modelId));
  if (brandId || categoryId || (typeof q === 'string' && q.trim())) {
    where.model = {};
    if (brandId) where.model.brandId = BigInt(String(brandId));
    if (categoryId) where.model.categoryId = BigInt(String(categoryId));
    if (typeof q === 'string' && q.trim()) {
      const keyword = q.trim();
      where.OR = [{ model: { name: { contains: keyword } } }];
    }
  }
  const { pageSize, skip, take } = parsePageQuery(ctx);
  const rows = await prisma.inventoryBatch.findMany({
    where,
    orderBy: { id: 'desc' },
    skip,
    take,
    include: { model: { include: { category: true, brand: true } } },
  });
  ctx.body = { data: serialize(toPaginatedResult(rows, pageSize)) };
});

router.get('/ledgers', async (ctx: Context) => {
  const { modelId, inventoryItemId } = ctx.query;
  const rows = await prisma.inventoryLedger.findMany({
    where: {
      ...(modelId ? { modelId: BigInt(String(modelId)) } : {}),
      ...(inventoryItemId ? { inventoryItemId: BigInt(String(inventoryItemId)) } : {}),
    },
    orderBy: { id: 'desc' },
    take: 200,
  });
  ctx.body = { data: serialize(rows) };
});

export default router;
