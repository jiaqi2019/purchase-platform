import Router from '@koa/router';
import type { Context } from 'koa';
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

export default router;
