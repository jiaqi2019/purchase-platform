import prisma from '../prisma';
import { daysUntilNextBirthday, nextBirthdayOccurrence } from '../utils/birthday';

export interface BirthdayJobResult {
  skipped: boolean;
  reason?: string;
  created: number;
  leadDays?: number;
}

export async function runBirthdayReminderJob(): Promise<BirthdayJobResult> {
  const settings = await prisma.birthdayReminderSettings.findUnique({ where: { id: 1 } });
  if (!settings?.enabled) {
    return { skipped: true, reason: 'disabled', created: 0 };
  }

  const leadDays = settings.leadDays;
  const buyers = await prisma.buyer.findMany({
    where: { birthday: { not: null } },
  });

  let created = 0;
  const today = new Date();

  for (const buyer of buyers) {
    if (!buyer.birthday) continue;

    const days = daysUntilNextBirthday(buyer.birthday, today);
    if (days !== leadDays) continue;

    const occurrence = nextBirthdayOccurrence(buyer.birthday, today);
    const existing = await prisma.birthdayReminder.findUnique({
      where: {
        buyerId_birthday: {
          buyerId: buyer.id,
          birthday: occurrence,
        },
      },
    });

    if (existing) continue;

    await prisma.birthdayReminder.create({
      data: {
        buyerId: buyer.id,
        birthday: occurrence,
        leadDays,
        status: 'PENDING',
      },
    });
    created += 1;
  }

  return { skipped: false, created, leadDays };
}
