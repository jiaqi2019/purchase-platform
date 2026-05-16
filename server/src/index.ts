import 'dotenv/config';
import app from './app';
import prisma from './prisma';
import { startBirthdayCron } from './jobs/birthday-reminder-cron';

process.env.TZ = process.env.TZ || 'Asia/Shanghai';

const port = Number(process.env.PORT) || 3001;

startBirthdayCron();

const server = app.listen(port, () => {
  console.log(`API http://localhost:${port}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
