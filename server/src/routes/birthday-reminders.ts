import Router from '@koa/router';
import type { Context } from 'koa';
import { ReminderStatus } from '@prisma/client';
import prisma from '../prisma';
import { getBuyerPurchaseStatsMap } from '../services/buyer-purchase-stats';
import { serialize } from '../utils/serialize';
import { AppError } from '../utils/errors';

const router = new Router({ prefix: '/birthday-reminders' });

interface ReminderPatchBody {
  status?: ReminderStatus;
}

router.get('/', async (ctx: Context) => {
  const status =
    typeof ctx.query.status === 'string' ? (ctx.query.status as ReminderStatus) : 'PENDING';
  const list = await prisma.birthdayReminder.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    include: { buyer: true },
  });

  const buyerIds = [...new Set(list.map((r) => r.buyerId))];
  const statsMap = await getBuyerPurchaseStatsMap(buyerIds);
  const enriched = list.map((r) => {
    const stats = statsMap.get(r.buyerId.toString()) ?? { hasPurchases: false, totalSpent: 0 };
    return { ...r, ...stats };
  });

  ctx.body = { data: serialize(enriched) };
});

router.patch('/:id', async (ctx: Context) => {
  const { status } = ctx.request.body as ReminderPatchBody;
  if (!status || !['PENDING', 'DONE', 'SKIPPED'].includes(status)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'status 无效');
  }
  const data = {
    status,
    resolvedAt: status === 'PENDING' ? null : new Date(),
  };
  try {
    const row = await prisma.birthdayReminder.update({
      where: { id: BigInt(ctx.params.id) },
      data,
      include: { buyer: true },
    });
    ctx.body = { data: serialize(row) };
  } catch {
    throw new AppError(404, 'NOT_FOUND', '提醒不存在');
  }
});

export default router;
