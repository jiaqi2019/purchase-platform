import Router from '@koa/router';
import type { Context } from 'koa';
import type { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';

const router = new Router({ prefix: '/service-cards' });

router.get('/plans', async (ctx: Context) => {
  const rows = await prisma.serviceCardPlan.findMany({ orderBy: { id: 'desc' } });
  ctx.body = { data: serialize(rows) };
});

router.post('/plans', async (ctx: Context) => {
  const body = ctx.request.body as {
    name?: string;
    rechargeAmount?: string | number;
    serviceName?: string;
    totalTimes?: number;
  };
  if (!body.name?.trim() || !body.serviceName?.trim() || !body.rechargeAmount || !body.totalTimes) {
    throw new AppError(400, 'VALIDATION_ERROR', '套餐名称、充值金额、服务名称和次数必填');
  }
  const row = await prisma.serviceCardPlan.create({
    data: {
      name: body.name.trim(),
      rechargeAmount: body.rechargeAmount,
      serviceName: body.serviceName.trim(),
      totalTimes: Number(body.totalTimes),
    },
  });
  ctx.status = 201;
  ctx.body = { data: serialize(row) };
});

router.get('/', async (ctx: Context) => {
  const buyerId = typeof ctx.query.buyerId === 'string' ? ctx.query.buyerId : '';
  const rows = await prisma.serviceCard.findMany({
    where: buyerId ? { buyerId: BigInt(buyerId) } : undefined,
    orderBy: { id: 'desc' },
    include: { buyer: true, plan: true },
  });
  ctx.body = { data: serialize(rows) };
});

router.post('/', async (ctx: Context) => {
  const body = ctx.request.body as {
    buyerId?: string | number;
    planId?: string | number | null;
    serviceName?: string;
    rechargeAmount?: string | number;
    totalTimes?: number;
  };
  if (!body.buyerId) throw new AppError(400, 'VALIDATION_ERROR', '消费者必填');
  let serviceName = body.serviceName;
  let rechargeAmount: string | number | Prisma.Decimal | undefined = body.rechargeAmount;
  let totalTimes = body.totalTimes;
  if (body.planId) {
    const plan = await prisma.serviceCardPlan.findUnique({ where: { id: BigInt(body.planId) } });
    if (!plan) throw new AppError(404, 'NOT_FOUND', '次卡套餐不存在');
    serviceName = plan.serviceName;
    rechargeAmount = plan.rechargeAmount;
    totalTimes = plan.totalTimes;
  }
  if (!serviceName?.trim() || !rechargeAmount || !totalTimes) {
    throw new AppError(400, 'VALIDATION_ERROR', '服务名称、充值金额和次数必填');
  }
  const row = await prisma.serviceCard.create({
    data: {
      buyerId: BigInt(body.buyerId),
      planId: body.planId ? BigInt(body.planId) : null,
      serviceName: serviceName.trim(),
      rechargeAmount,
      totalTimes: Number(totalTimes),
      remainingTimes: Number(totalTimes),
    },
    include: { buyer: true, plan: true },
  });
  ctx.status = 201;
  ctx.body = { data: serialize(row) };
});

export default router;
