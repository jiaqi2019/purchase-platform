import Router from '@koa/router';
import type { Context } from 'koa';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import type { Prisma } from '@prisma/client';

const router = new Router({ prefix: '/settings' });

interface SettingsBody {
  birthdayLeadDays?: number;
  birthdayReminderEnabled?: boolean;
  reminderHour?: number;
  reminderMinute?: number;
}

router.get('/', async (ctx: Context) => {
  let settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    settings = await prisma.appSettings.create({
      data: { id: 1 },
    });
  }
  ctx.body = { data: serialize(settings) };
});

router.patch('/', async (ctx: Context) => {
  const { birthdayLeadDays, birthdayReminderEnabled, reminderHour, reminderMinute } =
    ctx.request.body as SettingsBody;
  const data: Prisma.AppSettingsUpdateInput = {};
  if (birthdayLeadDays !== undefined) data.birthdayLeadDays = Number(birthdayLeadDays);
  if (birthdayReminderEnabled !== undefined) {
    data.birthdayReminderEnabled = Boolean(birthdayReminderEnabled);
  }
  if (reminderHour !== undefined) data.reminderHour = Number(reminderHour);
  if (reminderMinute !== undefined) data.reminderMinute = Number(reminderMinute);

  const settings = await prisma.appSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      birthdayLeadDays: birthdayLeadDays !== undefined ? Number(birthdayLeadDays) : 3,
      birthdayReminderEnabled:
        birthdayReminderEnabled !== undefined ? Boolean(birthdayReminderEnabled) : true,
      reminderHour: reminderHour !== undefined ? Number(reminderHour) : 9,
      reminderMinute: reminderMinute !== undefined ? Number(reminderMinute) : 0,
    },
    update: data,
  });
  ctx.body = { data: serialize(settings) };
});

export default router;
