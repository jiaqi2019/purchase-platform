import Router from '@koa/router';
import type { Context } from 'koa';
import type { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';

const router = new Router({ prefix: '/birthday-reminder-settings' });

interface SettingsBody {
  leadDays?: number;
  enabled?: boolean;
}

router.get('/', async (ctx: Context) => {
  let settings = await prisma.birthdayReminderSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    settings = await prisma.birthdayReminderSettings.create({ data: { id: 1 } });
  }
  ctx.body = { data: serialize(settings) };
});

router.patch('/', async (ctx: Context) => {
  const { leadDays, enabled } = ctx.request.body as SettingsBody;
  const data: Prisma.BirthdayReminderSettingsUpdateInput = {};
  if (leadDays !== undefined) data.leadDays = Number(leadDays);
  if (enabled !== undefined) data.enabled = Boolean(enabled);

  const settings = await prisma.birthdayReminderSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      leadDays: leadDays !== undefined ? Number(leadDays) : 3,
      enabled: enabled !== undefined ? Boolean(enabled) : true,
    },
    update: data,
  });
  ctx.body = { data: serialize(settings) };
});

export default router;
