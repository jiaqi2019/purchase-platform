import Router from '@koa/router';
import type { Context } from 'koa';
import { Prisma, ProductTrackingMode, SpecValueType } from '@prisma/client';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';
import { parsePageQuery, toPaginatedResult } from '../utils/pagination';
import { assertProductModelUnused } from '../services/product-model-delete';

const router = new Router({ prefix: '/product-models' });

interface SpecBody {
  id?: string | number;
  name?: string;
  code?: string;
  valueType?: SpecValueType;
  required?: boolean;
  uniqueValue?: boolean;
  options?: unknown;
  sortOrder?: number;
}

interface ModelBody {
  categoryId?: string | number;
  brandId?: string | number;
  name?: string;
  trackingMode?: ProductTrackingMode;
  active?: boolean;
  specs?: SpecBody[];
}

function normalizeCode(value: string): string {
  const text = value.trim();
  const knownSpecs: Record<string, string> = {
    颜色: 'color',
    色号: 'color',
    运行内存: 'memory',
    内存: 'memory',
    运存: 'memory',
    存储容量: 'storage',
    硬盘存储容量: 'storage',
    硬盘容量: 'storage',
    存储: 'storage',
    容量: 'storage',
    imei: 'imei',
    ime: 'imei',
    imei1: 'imei',
    ime1: 'imei',
    imei2: 'imei2',
    ime2: 'imei2',
    sn: 'sn',
    序列号: 'sn',
  };
  const normalizedText = text.toLowerCase().replace(/\s+/g, '');
  return knownSpecs[text] ?? knownSpecs[normalizedText] ?? text.toLowerCase().replace(/\s+/g, '_');
}

async function withStockSummary<T extends { id: bigint }>(rows: T[]) {
  return Promise.all(
    rows.map(async (row) => {
      const [serializedCount, batches] = await Promise.all([
        prisma.inventoryItem.count({
          where: { modelId: row.id, status: { in: ['IN_STOCK', 'RETURNED_IN_STOCK'] } },
        }),
        prisma.inventoryBatch.findMany({
          where: { modelId: row.id },
          select: { quantityOnHand: true },
        }),
      ]);
      const quantityCount = batches.reduce((sum, b) => sum + b.quantityOnHand, 0);
      return { ...row, stock: serializedCount + quantityCount };
    }),
  );
}

router.get('/', async (ctx: Context) => {
  const { categoryId, brandId, q, active } = ctx.query;
  const where: Prisma.ProductModelWhereInput = {};
  if (categoryId) where.categoryId = BigInt(String(categoryId));
  if (brandId) where.brandId = BigInt(String(brandId));
  if (active === 'true') where.active = true;
  if (typeof q === 'string' && q.trim()) {
    const keyword = q.trim();
    where.OR = [{ name: { contains: keyword } }, { brand: { name: { contains: keyword } } }];
  }
  const { pageSize, skip, take } = parsePageQuery(ctx);
  const rows = await prisma.productModel.findMany({
    where,
    orderBy: { id: 'desc' },
    skip,
    take,
    include: {
      category: true,
      brand: true,
      specDefinitions: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
    },
  });
  const items = await withStockSummary(rows);
  ctx.body = { data: serialize(toPaginatedResult(items, pageSize)) };
});

router.post('/', async (ctx: Context) => {
  const body = ctx.request.body as ModelBody;
  if (!body.categoryId || !body.brandId || !body.name?.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', '品类、品牌、型号名称必填');
  }
  const specs = body.specs ?? [];
  const trackingMode = body.trackingMode ?? ProductTrackingMode.QUANTITY;
  if (trackingMode === ProductTrackingMode.SERIALIZED && !specs.some((s) => s.uniqueValue)) {
    throw new AppError(400, 'VALIDATION_ERROR', '单品追踪型号至少需要一个唯一标识规格');
  }
  try {
    const row = await prisma.productModel.create({
      data: {
        categoryId: BigInt(body.categoryId),
        brandId: BigInt(body.brandId),
        name: body.name.trim(),
        trackingMode,
        active: body.active ?? true,
        specDefinitions: {
          create: specs
            .filter((s) => s.name?.trim())
            .map((s, index) => ({
              name: s.name!.trim(),
              code: normalizeCode(s.code || s.name!),
              valueType: s.valueType ?? SpecValueType.TEXT,
              required: s.required ?? false,
              uniqueValue: s.uniqueValue ?? false,
              options: (s.options as Prisma.InputJsonValue) ?? undefined,
              sortOrder: s.sortOrder ?? index,
            })),
        },
      },
      include: { category: true, brand: true, specDefinitions: true },
    });
    ctx.status = 201;
    ctx.body = { data: serialize(row) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', '同一品类和品牌下型号已存在，或规格名称重复');
    }
    throw e;
  }
});

router.get('/:id', async (ctx: Context) => {
  const row = await prisma.productModel.findUnique({
    where: { id: BigInt(ctx.params.id) },
    include: {
      category: true,
      brand: true,
      specDefinitions: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!row) throw new AppError(404, 'NOT_FOUND', '型号不存在');
  const [withStock] = await withStockSummary([row]);
  ctx.body = { data: serialize(withStock) };
});

router.patch('/:id', async (ctx: Context) => {
  const id = BigInt(ctx.params.id);
  const body = ctx.request.body as ModelBody;
  const data: Prisma.ProductModelUncheckedUpdateInput = {};
  if (body.categoryId !== undefined) data.categoryId = BigInt(body.categoryId);
  if (body.brandId !== undefined) data.brandId = BigInt(body.brandId);
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.trackingMode !== undefined) data.trackingMode = body.trackingMode;
  if (body.active !== undefined) data.active = body.active;

  try {
    const row = await prisma.productModel.update({
      where: { id },
      data,
      include: { category: true, brand: true, specDefinitions: true },
    });
    ctx.body = { data: serialize(row) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      throw new AppError(404, 'NOT_FOUND', '型号不存在');
    }
    throw e;
  }
});

router.post('/:id/specs', async (ctx: Context) => {
  const modelId = BigInt(ctx.params.id);
  const spec = ctx.request.body as SpecBody;
  if (!spec.name?.trim()) throw new AppError(400, 'VALIDATION_ERROR', '规格名称必填');
  const row = await prisma.modelSpecDefinition.create({
    data: {
      modelId,
      name: spec.name.trim(),
      code: normalizeCode(spec.code || spec.name),
      valueType: spec.valueType ?? SpecValueType.TEXT,
      required: spec.required ?? false,
      uniqueValue: spec.uniqueValue ?? false,
      options: (spec.options as Prisma.InputJsonValue) ?? undefined,
      sortOrder: spec.sortOrder ?? 0,
    },
  });
  ctx.status = 201;
  ctx.body = { data: serialize(row) };
});

router.patch('/:id/specs/:specId', async (ctx: Context) => {
  const modelId = BigInt(ctx.params.id);
  const specId = BigInt(ctx.params.specId);
  const spec = ctx.request.body as SpecBody;
  const current = await prisma.modelSpecDefinition.findUnique({ where: { id: specId } });
  if (!current || current.modelId !== modelId) {
    throw new AppError(404, 'NOT_FOUND', '规格不存在');
  }
  const nextOptions =
    spec.options === undefined ? current.options : ((spec.options as Prisma.InputJsonValue) ?? undefined);
  const row = await prisma.modelSpecDefinition.update({
    where: { id: specId },
    data: {
      name: spec.name?.trim() ?? current.name,
      code: spec.code ? normalizeCode(spec.code) : current.code,
      valueType: spec.valueType ?? current.valueType,
      required: spec.required ?? current.required,
      uniqueValue: spec.uniqueValue ?? current.uniqueValue,
      options: nextOptions === null ? undefined : nextOptions,
      sortOrder: spec.sortOrder ?? current.sortOrder,
    },
  });
  ctx.body = { data: serialize(row) };
});

router.delete('/:id', async (ctx: Context) => {
  const id = BigInt(ctx.params.id);
  await prisma.$transaction(async (tx) => {
    await assertProductModelUnused(tx, id);
    await tx.productModel.delete({ where: { id } });
  });
  ctx.status = 204;
});

export default router;
