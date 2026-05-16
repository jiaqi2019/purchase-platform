import Router from '@koa/router';
import type { Context } from 'koa';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';
import { parsePhone } from '../utils/phone';

const router = new Router({ prefix: '/buyers' });

interface BuyerBody {
  name?: string;
  address?: string | null;
  permanentAddress?: string | null;
  birthday?: string | null;
  phone?: string | null;
}

router.get('/', async (ctx: Context) => {
  const q = typeof ctx.query.q === 'string' ? ctx.query.q.trim() : '';
  const buyers = await prisma.buyer.findMany({
    where: q ? { name: { contains: q } } : undefined,
    orderBy: { id: 'desc' },
  });
  ctx.body = { data: serialize(buyers) };
});

router.post('/', async (ctx: Context) => {
  const { name, address, permanentAddress, birthday, phone } = ctx.request.body as BuyerBody;
  if (!name?.trim()) throw new AppError(400, 'VALIDATION_ERROR', '姓名必填');
  const buyer = await prisma.buyer.create({
    data: {
      name: name.trim(),
      address: address || null,
      permanentAddress: permanentAddress || null,
      birthday: birthday ? new Date(birthday) : null,
      phone: parsePhone(phone, false),
    },
  });
  ctx.status = 201;
  ctx.body = { data: serialize(buyer) };
});

router.get('/:id', async (ctx: Context) => {
  const buyer = await prisma.buyer.findUnique({
    where: { id: BigInt(ctx.params.id) },
  });
  if (!buyer) throw new AppError(404, 'NOT_FOUND', '购买者不存在');
  ctx.body = { data: serialize(buyer) };
});

router.patch('/:id', async (ctx: Context) => {
  const id = BigInt(ctx.params.id);
  const { name, address, permanentAddress, birthday, phone } = ctx.request.body as BuyerBody;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name.trim();
  if (address !== undefined) data.address = address || null;
  if (permanentAddress !== undefined) data.permanentAddress = permanentAddress || null;
  if (birthday !== undefined) data.birthday = birthday ? new Date(birthday) : null;
  if (phone !== undefined) data.phone = parsePhone(phone, false);
  try {
    const buyer = await prisma.buyer.update({ where: { id }, data });
    ctx.body = { data: serialize(buyer) };
  } catch {
    throw new AppError(404, 'NOT_FOUND', '购买者不存在');
  }
});

router.delete('/:id', async (ctx: Context) => {
  const id = BigInt(ctx.params.id);
  const count = await prisma.purchase.count({ where: { buyerId: id } });
  if (count > 0) throw new AppError(409, 'CONFLICT', '该购买者已有订单，无法删除');
  try {
    await prisma.buyer.delete({ where: { id } });
    ctx.status = 204;
  } catch {
    throw new AppError(404, 'NOT_FOUND', '购买者不存在');
  }
});

export default router;
