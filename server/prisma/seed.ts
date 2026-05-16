import { PrismaClient } from '@prisma/client';
import { generateCategoryCode } from '../src/utils/category-code.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.appSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      birthdayLeadDays: 3,
      birthdayReminderEnabled: true,
      reminderHour: 9,
      reminderMinute: 0,
    },
    update: {},
  });

  const categories = [
    { name: '手机', sortOrder: 1 },
    { name: '手机壳', sortOrder: 2 },
    { name: '数据线', sortOrder: 3 },
  ];

  const existingCodes: string[] = [];
  for (const c of categories) {
    const code = generateCategoryCode(c.name, existingCodes);
    existingCodes.push(code);
    await prisma.productCategory.upsert({
      where: { code },
      create: { ...c, code },
      update: { name: c.name, sortOrder: c.sortOrder },
    });
  }

  console.log('Seed completed.');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
