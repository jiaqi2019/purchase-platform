import Router from '@koa/router';
import type { Context } from 'koa';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';
import { generateCategoryCode } from '../utils/category-code';

const router = new Router({ prefix: '/product-categories' });

interface CategoryBody {
  name?: string;
  sortOrder?: number;
}

router.get('/', async (ctx: Context) => {
  const list = await prisma.productCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  ctx.body = { data: serialize(list) };
});

router.post('/', async (ctx: Context) => {
  const { name, sortOrder } = ctx.request.body as CategoryBody;
  if (!name?.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', '名称必填');
  }

  const existing = await prisma.productCategory.findMany({ select: { code: true } });
  const code = generateCategoryCode(
    name.trim(),
    existing.map((r) => r.code),
  );

  try {
    const row = await prisma.productCategory.create({
      data: {
        name: name.trim(),
        code,
        sortOrder: sortOrder ?? 0,
      },
    });
    ctx.status = 201;
    ctx.body = { data: serialize(row) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', '分类标识冲突，请换一个名称');
    }
    throw e;
  }
});

router.get('/:id', async (ctx: Context) => {
  const row = await prisma.productCategory.findUnique({
    where: { id: BigInt(ctx.params.id) },
  });
  if (!row) throw new AppError(404, 'NOT_FOUND', '分类不存在');
  ctx.body = { data: serialize(row) };
});

router.patch('/:id', async (ctx: Context) => {
  const id = BigInt(ctx.params.id);
  const { name, sortOrder } = ctx.request.body as CategoryBody;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name.trim();
  if (sortOrder !== undefined) data.sortOrder = sortOrder;
  try {
    const row = await prisma.productCategory.update({ where: { id }, data });
    ctx.body = { data: serialize(row) };
  } catch {
    throw new AppError(404, 'NOT_FOUND', '分类不存在');
  }
});

router.delete('/:id', async (ctx: Context) => {
  const id = BigInt(ctx.params.id);
  const [pc, pb] = await Promise.all([
    prisma.product.count({ where: { categoryId: id } }),
    prisma.brand.count({ where: { categoryId: id } }),
  ]);
  if (pc > 0 || pb > 0) {
    throw new AppError(409, 'CONFLICT', '分类下仍有商品或品牌，无法删除');
  }
  try {
    await prisma.productCategory.delete({ where: { id } });
    ctx.status = 204;
  } catch {
    throw new AppError(404, 'NOT_FOUND', '分类不存在');
  }
});

export default router;
