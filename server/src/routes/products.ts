import Router from '@koa/router';
import type { Context } from 'koa';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';
import { parseOptionalDecimal } from '../utils/decimal';
import type { Prisma } from '@prisma/client';

const router = new Router({ prefix: '/products' });

interface ProductBody {
  categoryId?: string | number;
  brandId?: string | number | null;
  name?: string;
  costPrice?: string | number | null;
  sellPrice?: string | number | null;
  stock?: number;
}

function assertBrandRequired(brandId: string | number | bigint | null | undefined): void {
  if (!brandId) {
    throw new AppError(400, 'VALIDATION_ERROR', '所有商品必须选择品牌');
  }
}

router.get('/', async (ctx: Context) => {
  const { categoryId, q } = ctx.query;
  const where: Prisma.ProductWhereInput = {};
  if (categoryId) where.categoryId = BigInt(String(categoryId));
  if (typeof q === 'string' && q.trim()) {
    where.OR = [
      { name: { contains: q.trim() } },
      { brand: { name: { contains: q.trim() } } },
    ];
  }
  const list = await prisma.product.findMany({
    where,
    orderBy: { id: 'desc' },
    include: { category: true, brand: true },
  });
  ctx.body = { data: serialize(list) };
});

router.post('/', async (ctx: Context) => {
  const { categoryId, brandId, name, costPrice, sellPrice, stock } = ctx.request.body as ProductBody;
  if (!categoryId || !name?.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', '分类与商品名称必填');
  }
  assertBrandRequired(brandId);
  const row = await prisma.product.create({
    data: {
      categoryId: BigInt(categoryId),
      brandId: BigInt(brandId!),
      model: null,
      name: name.trim(),
      costPrice: parseOptionalDecimal(costPrice) ?? null,
      sellPrice: parseOptionalDecimal(sellPrice) ?? null,
      stock: stock ?? 0,
    },
    include: { category: true, brand: true },
  });
  ctx.status = 201;
  ctx.body = { data: serialize(row) };
});

router.get('/:id', async (ctx: Context) => {
  const row = await prisma.product.findUnique({
    where: { id: BigInt(ctx.params.id) },
    include: { category: true, brand: true },
  });
  if (!row) throw new AppError(404, 'NOT_FOUND', '商品不存在');
  ctx.body = { data: serialize(row) };
});

router.patch('/:id', async (ctx: Context) => {
  const id = BigInt(ctx.params.id);
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'NOT_FOUND', '商品不存在');

  const { categoryId, brandId, name, costPrice, sellPrice, stock } = ctx.request.body as ProductBody;
  const nextBrandId = brandId !== undefined ? brandId : existing.brandId;
  assertBrandRequired(nextBrandId);

  const data: Prisma.ProductUncheckedUpdateInput = {};
  if (categoryId !== undefined) data.categoryId = BigInt(categoryId);
  if (brandId !== undefined && brandId !== null) data.brandId = BigInt(brandId);
  if (name !== undefined) data.name = name.trim();
  if (costPrice !== undefined) data.costPrice = parseOptionalDecimal(costPrice) ?? null;
  if (sellPrice !== undefined) data.sellPrice = parseOptionalDecimal(sellPrice) ?? null;
  if (stock !== undefined) data.stock = stock;

  const row = await prisma.product.update({
    where: { id },
    data,
    include: { category: true, brand: true },
  });
  ctx.body = { data: serialize(row) };
});

router.delete('/:id', async (ctx: Context) => {
  const id = BigInt(ctx.params.id);
  const count = await prisma.purchaseItem.count({ where: { productId: id } });
  if (count > 0) throw new AppError(409, 'CONFLICT', '该商品已有订单记录，无法删除');
  try {
    await prisma.product.delete({ where: { id } });
    ctx.status = 204;
  } catch {
    throw new AppError(404, 'NOT_FOUND', '商品不存在');
  }
});

export default router;
