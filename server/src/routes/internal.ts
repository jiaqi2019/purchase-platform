import Router from '@koa/router';
import type { Context } from 'koa';
import prisma from '../prisma';
import { runBirthdayReminderJob } from '../services/birthday-reminder-service';
import { AppError } from '../utils/errors';
import { serialize } from '../utils/serialize';

const router = new Router({ prefix: '/internal' });

router.post('/run-birthday-job', async (ctx: Context) => {
  const token = ctx.get('x-internal-token') || ctx.query.token;
  const expected = process.env.INTERNAL_JOB_TOKEN || 'dev-token';
  if (token !== expected) {
    throw new AppError(403, 'FORBIDDEN', '无效的内部任务令牌');
  }
  const result = await runBirthdayReminderJob();
  ctx.body = { data: serialize(result) };
});

router.post('/reset-all-data', async (ctx: Context) => {
  const { confirm } = ctx.request.body as { confirm?: string };
  if (confirm !== 'RESET_ALL_DATA') {
    throw new AppError(400, 'VALIDATION_ERROR', '确认码错误');
  }

  await prisma.$transaction(async (tx) => {
    await tx.afterSaleItem.deleteMany({});
    await tx.afterSaleOrder.deleteMany({});
    await tx.salesOrderItem.deleteMany({});
    await tx.salesOrder.deleteMany({});

    await tx.repairOrderItem.deleteMany({});
    await tx.repairOrder.deleteMany({});

    await tx.serviceOrderItem.deleteMany({});
    await tx.serviceOrder.deleteMany({});
    await tx.serviceCard.deleteMany({});
    await tx.serviceCardPlan.deleteMany({});

    await tx.stockOutItem.deleteMany({});
    await tx.stockOutOrder.deleteMany({});

    await tx.stockInItem.deleteMany({});
    await tx.stockInOrder.deleteMany({});

    await tx.inventoryUniqueValue.deleteMany({});
    await tx.inventoryItem.deleteMany({});
    await tx.inventoryBatch.deleteMany({});
    await tx.inventoryLedger.deleteMany({});

    await tx.purchaseItem.deleteMany({});
    await tx.purchase.deleteMany({});

    await tx.modelSpecDefinition.deleteMany({});
    await tx.productModel.deleteMany({});
    await tx.brandCategory.deleteMany({});
    await tx.brand.deleteMany({});
    await tx.productCategory.deleteMany({});
    await tx.product.deleteMany({});

    await tx.buyerPhoto.deleteMany({});
    await tx.birthdayReminder.deleteMany({});
    await tx.birthdayReminderSettings.deleteMany({});
    await tx.buyer.deleteMany({});
    await tx.purchaseChannel.deleteMany({});
  });

  ctx.body = { data: { ok: true } };
});

export default router;
