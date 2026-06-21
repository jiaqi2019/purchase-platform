import Router from '@koa/router';
import type { Context } from 'koa';
import { InventoryLedgerType, Prisma, ProductTrackingMode } from '@prisma/client';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';
import { parseOptionalDecimal } from '../utils/decimal';

const router = new Router({ prefix: '/stock-in-orders' });

interface SerializedItemInput {
  costPrice?: string | number | null;
  attributes?: Record<string, unknown>;
}

interface StockInItemInput {
  modelId?: string | number;
  quantity?: number;
  costPrice?: string | number | null;
  attributes?: Record<string, unknown>;
  serializedItems?: SerializedItemInput[];
}

interface StockInBody {
  source?: string | null;
  note?: string | null;
  items?: StockInItemInput[];
}

function attr(attributes: Record<string, unknown> | undefined, code: string): string | null {
  const value = attributes?.[code] ?? attributes?.[code.toUpperCase()] ?? attributes?.[code.toLowerCase()];
  return value == null || value === '' ? null : String(value);
}

function assertRequiredSpecs(
  specs: Array<{ name: string; code: string; required: boolean; uniqueValue: boolean }>,
  attributes: Record<string, unknown> | undefined,
) {
  for (const spec of specs) {
    if (!spec.required && !spec.uniqueValue) continue;
    const value = attributes?.[spec.code] ?? attributes?.[spec.name];
    if (value == null || value === '') {
      throw new AppError(400, 'VALIDATION_ERROR', `${spec.name} 必填`);
    }
  }
}

function attrValue(attributes: Record<string, unknown> | undefined, code: string, name: string): string | null {
  const value = attributes?.[code] ?? attributes?.[name];
  if (Array.isArray(value)) return value.length ? value.join(',') : null;
  return value == null || value === '' ? null : String(value);
}

router.get('/', async (ctx: Context) => {
  const rows = await prisma.stockInOrder.findMany({
    orderBy: { id: 'desc' },
    take: 100,
    include: { items: { include: { model: { include: { category: true, brand: true } } } } },
  });
  ctx.body = { data: serialize(rows) };
});

router.get('/:id', async (ctx: Context) => {
  const row = await prisma.stockInOrder.findUnique({
    where: { id: BigInt(ctx.params.id) },
    include: {
      items: {
        include: {
          model: { include: { category: true, brand: true, specDefinitions: true } },
          inventoryItems: { orderBy: { id: 'asc' } },
        },
      },
    },
  });
  if (!row) throw new AppError(404, 'NOT_FOUND', '入库单不存在');
  ctx.body = { data: serialize(row) };
});

router.post('/', async (ctx: Context) => {
  const body = ctx.request.body as StockInBody;
  if (!body.items?.length) throw new AppError(400, 'VALIDATION_ERROR', '至少一条入库明细');

  try {
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.stockInOrder.create({
        data: { source: body.source || null, note: body.note || null },
      });

      for (const line of body.items!) {
        if (!line.modelId) throw new AppError(400, 'VALIDATION_ERROR', '型号必填');
        const model = await tx.productModel.findUnique({
          where: { id: BigInt(line.modelId) },
          include: { specDefinitions: true },
        });
        if (!model) throw new AppError(404, 'NOT_FOUND', '型号不存在');
        const costPrice = parseOptionalDecimal(line.costPrice);
        if (costPrice == null) {
          throw new AppError(400, 'VALIDATION_ERROR', '成本价必填');
        }

        if (model.trackingMode === ProductTrackingMode.SERIALIZED) {
          const uniqueSpecs = model.specDefinitions.filter((spec) => spec.uniqueValue);
          if (!uniqueSpecs.length) {
            throw new AppError(400, 'VALIDATION_ERROR', '单品追踪型号至少需要一个唯一标识规格');
          }
          const serializedItems = line.serializedItems?.length
            ? line.serializedItems
            : [{ attributes: line.attributes, costPrice: costPrice }];
          const stockLine = await tx.stockInItem.create({
            data: {
              orderId: created.id,
              modelId: model.id,
              quantity: serializedItems.length,
              costPrice,
              attributes: (line.attributes as Prisma.InputJsonValue) ?? undefined,
            },
          });
          for (const item of serializedItems) {
            assertRequiredSpecs(model.specDefinitions, item.attributes);
            const inventoryItem = await tx.inventoryItem.create({
              data: {
                modelId: model.id,
                stockInItemId: stockLine.id,
                costPrice:
                  parseOptionalDecimal(item.costPrice) ??
                  costPrice,
                attributes: (item.attributes as Prisma.InputJsonValue) ?? undefined,
                imei: attr(item.attributes, 'imei'),
                imei2: attr(item.attributes, 'imei2'),
                sn: attr(item.attributes, 'sn'),
              },
            });
            for (const spec of uniqueSpecs) {
              const value = attrValue(item.attributes, spec.code, spec.name);
              if (!value) {
                throw new AppError(400, 'VALIDATION_ERROR', `${spec.name} 必填`);
              }
              await tx.inventoryUniqueValue.create({
                data: {
                  modelId: model.id,
                  inventoryItemId: inventoryItem.id,
                  specCode: spec.code,
                  value,
                },
              });
            }
            await tx.inventoryLedger.create({
              data: {
                type: InventoryLedgerType.STOCK_IN,
                modelId: model.id,
                inventoryItemId: inventoryItem.id,
                quantity: 1,
                refType: 'stock_in_order',
                refId: created.id,
              },
            });
          }
        } else {
          const qty = Number(line.quantity) || 1;
          assertRequiredSpecs(model.specDefinitions, line.attributes);
          await tx.stockInItem.create({
            data: {
              orderId: created.id,
              modelId: model.id,
              quantity: qty,
              costPrice,
              attributes: (line.attributes as Prisma.InputJsonValue) ?? undefined,
            },
          });
          await tx.inventoryBatch.create({
            data: {
              modelId: model.id,
              quantityOnHand: qty,
              costPrice,
              attributes: (line.attributes as Prisma.InputJsonValue) ?? undefined,
            },
          });
          await tx.inventoryLedger.create({
            data: {
              type: InventoryLedgerType.STOCK_IN,
              modelId: model.id,
              quantity: qty,
              refType: 'stock_in_order',
              refId: created.id,
            },
          });
        }
      }

      return tx.stockInOrder.findUnique({
        where: { id: created.id },
        include: { items: { include: { model: { include: { category: true, brand: true } } } } },
      });
    });
    ctx.status = 201;
    ctx.body = { data: serialize(order) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', '唯一标识已存在');
    }
    throw e;
  }
});

export default router;
