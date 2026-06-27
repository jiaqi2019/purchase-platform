import Router from '@koa/router';
import type { Context } from 'koa';
import type { Prisma } from '@prisma/client';
import { Prisma as PrismaClient } from '@prisma/client';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';
import { parsePageQuery, toPaginatedResult } from '../utils/pagination';
import { parsePhone } from '../utils/phone';

const router = new Router({ prefix: '/purchase-channels' });

interface PurchaseChannelBody {
  name?: string;
  contact?: string | null;
  phone?: string | null;
  note?: string | null;
}

function channelSearchWhere(q: string): Prisma.PurchaseChannelWhereInput | undefined {
  if (!q) return undefined;
  return {
    OR: [
      { name: { contains: q } },
      { contact: { contains: q } },
      { phone: { contains: q } },
    ],
  };
}

router.get('/', async (ctx: Context) => {
  const q = typeof ctx.query.q === 'string' ? ctx.query.q.trim() : '';
  const { pageSize, skip, take } = parsePageQuery(ctx);

  const rows = await prisma.purchaseChannel.findMany({
    where: channelSearchWhere(q),
    orderBy: { id: 'desc' },
    skip,
    take,
  });

  ctx.body = { data: serialize(toPaginatedResult(rows, pageSize)) };
});

router.post('/', async (ctx: Context) => {
  const { name, contact, phone, note } = ctx.request.body as PurchaseChannelBody;
  if (!name?.trim()) throw new AppError(400, 'VALIDATION_ERROR', '渠道名称必填');

  try {
    const row = await prisma.purchaseChannel.create({
      data: {
        name: name.trim(),
        contact: contact?.trim() || null,
        phone: parsePhone(phone, false),
        note: note || null,
      },
    });
    ctx.status = 201;
    ctx.body = { data: serialize(row) };
  } catch (e) {
    if (e instanceof PrismaClient.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', '采购渠道已存在');
    }
    throw e;
  }
});

router.get('/:id', async (ctx: Context) => {
  const row = await prisma.purchaseChannel.findUnique({ where: { id: BigInt(ctx.params.id) } });
  if (!row) throw new AppError(404, 'NOT_FOUND', '采购渠道不存在');
  ctx.body = { data: serialize(row) };
});

router.patch('/:id', async (ctx: Context) => {
  const id = BigInt(ctx.params.id);
  const { name, contact, phone, note } = ctx.request.body as PurchaseChannelBody;
  const data: Prisma.PurchaseChannelUpdateInput = {};
  if (name !== undefined) data.name = name.trim();
  if (contact !== undefined) data.contact = contact?.trim() || null;
  if (phone !== undefined) data.phone = parsePhone(phone, false);
  if (note !== undefined) data.note = note || null;

  try {
    const row = await prisma.purchaseChannel.update({ where: { id }, data });
    ctx.body = { data: serialize(row) };
  } catch (e) {
    if (e instanceof PrismaClient.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') throw new AppError(409, 'CONFLICT', '采购渠道已存在');
      if (e.code === 'P2025') throw new AppError(404, 'NOT_FOUND', '采购渠道不存在');
    }
    throw e;
  }
});

router.delete('/:id', async (ctx: Context) => {
  try {
    await prisma.purchaseChannel.delete({ where: { id: BigInt(ctx.params.id) } });
    ctx.status = 204;
  } catch {
    throw new AppError(404, 'NOT_FOUND', '采购渠道不存在');
  }
});

export default router;
