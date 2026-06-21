import Router from '@koa/router';
import type { Context } from 'koa';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';
import {
  assertLegacyProductsUnused,
  deleteUnusedProductModels,
} from '../services/product-model-delete';

const router = new Router({ prefix: '/brands' });

interface BrandBody {
  name?: string;
  categoryId?: string | number | null;
}

router.get('/', async (ctx: Context) => {
  const categoryId = ctx.query.categoryId;
  const where: Prisma.BrandWhereInput = {};
  if (categoryId !== undefined && categoryId !== '') {
    where.OR = [{ categoryId: BigInt(String(categoryId)) }, { categoryId: null }];
  }
  const list = await prisma.brand.findMany({
    where,
    orderBy: { id: 'desc' },
    include: { category: true },
  });
  ctx.body = { data: serialize(list) };
});

router.post('/', async (ctx: Context) => {
  const { name, categoryId } = ctx.request.body as BrandBody;
  if (!name?.trim()) throw new AppError(400, 'VALIDATION_ERROR', '品牌名称必填');
  try {
    const row = await prisma.brand.create({
      data: {
        name: name.trim(),
        categoryId: categoryId ? BigInt(categoryId) : null,
      },
    });
    ctx.status = 201;
    ctx.body = { data: serialize(row) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', '品牌名称已存在');
    }
    throw e;
  }
});

router.get('/:id', async (ctx: Context) => {
  const row = await prisma.brand.findUnique({
    where: { id: BigInt(ctx.params.id) },
    include: { category: true },
  });
  if (!row) throw new AppError(404, 'NOT_FOUND', '品牌不存在');
  ctx.body = { data: serialize(row) };
});

router.patch('/:id', async (ctx: Context) => {
  const id = BigInt(ctx.params.id);
  const { name, categoryId } = ctx.request.body as BrandBody;
  const data: Prisma.BrandUncheckedUpdateInput = {};
  if (name !== undefined) data.name = name.trim();
  if (categoryId !== undefined) data.categoryId = categoryId ? BigInt(categoryId) : null;
  try {
    const row = await prisma.brand.update({ where: { id }, data });
    ctx.body = { data: serialize(row) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') throw new AppError(409, 'CONFLICT', '品牌名称已存在');
      if (e.code === 'P2025') throw new AppError(404, 'NOT_FOUND', '品牌不存在');
    }
    throw e;
  }
});

router.delete('/:id', async (ctx: Context) => {
  const id = BigInt(ctx.params.id);
  try {
    await prisma.$transaction(async (tx) => {
      await assertLegacyProductsUnused(tx, { brandId: id });
      await tx.product.deleteMany({ where: { brandId: id } });
      await deleteUnusedProductModels(tx, { brandId: id });
      await tx.brand.delete({ where: { id } });
    });
    ctx.status = 204;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(404, 'NOT_FOUND', '品牌不存在');
  }
});

export default router;
