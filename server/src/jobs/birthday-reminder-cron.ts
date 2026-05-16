import cron from 'node-cron';
import { runBirthdayReminderJob } from '../services/birthday-reminder-service';

const TZ = process.env.TZ || 'Asia/Shanghai';

async function runJob(): Promise<void> {
  try {
    const result = await runBirthdayReminderJob();
    console.log('[cron] birthday reminder job:', result);
  } catch (err) {
    console.error('[cron] birthday reminder job failed:', err);
  }
}

export function startBirthdayCron(): void {
  // 每天 0:00（Asia/Shanghai）自动生成待办
  cron.schedule('0 0 * * *', runJob, { timezone: TZ });
  console.log('[cron] birthday reminder scheduled at 00:00 daily (TZ=%s)', TZ);
}
