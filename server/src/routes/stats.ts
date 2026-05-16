import Router from '@koa/router';
import type { Context } from 'koa';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';

const router = new Router({ prefix: '/stats' });

interface LeaderboardRow {
  buyerId: bigint;
  name: string;
  totalSpent: unknown;
}

router.get('/leaderboard', async (ctx: Context) => {
  const limit = Math.min(Number(ctx.query.limit) || 20, 100);

  const rows = await prisma.$queryRaw<LeaderboardRow[]>`
    SELECT b.id AS buyerId, b.name AS name,
      COALESCE(SUM(CAST(pi.price AS DECIMAL(12,2)) * pi.quantity), 0) AS totalSpent
    FROM buyers b
    LEFT JOIN purchases p ON p.buyer_id = b.id
    LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
    GROUP BY b.id, b.name
    HAVING totalSpent > 0
    ORDER BY totalSpent DESC
    LIMIT ${limit}
  `;

  const data = rows.map((r) => ({
    buyerId: r.buyerId.toString(),
    name: r.name,
    totalSpent: Number(r.totalSpent),
  }));

  ctx.body = { data: serialize(data) };
});

export default router;
