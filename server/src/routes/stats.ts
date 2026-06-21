import Router from '@koa/router';
import type { Context } from 'koa';
import prisma from '../prisma';
import { serialize } from '../utils/serialize';
import { parsePageQuery, toPaginatedResult } from '../utils/pagination';

const router = new Router({ prefix: '/stats' });

interface LeaderboardRow {
  buyerId: bigint;
  name: string;
  totalSpent: unknown;
}

router.get('/leaderboard', async (ctx: Context) => {
  const { pageSize, skip, take } = parsePageQuery(ctx);

  const rows = await prisma.$queryRaw<LeaderboardRow[]>`
    SELECT b.id AS buyerId, b.name AS name,
      COALESCE(sales.total, 0)
        + COALESCE(repairs.total, 0)
        + COALESCE(cards.total, 0) AS totalSpent
    FROM buyers b
    LEFT JOIN (
      SELECT so.buyer_id,
        SUM(CASE WHEN soi.status = 'RETURNED' THEN 0 ELSE CAST(soi.price AS DECIMAL(12,2)) * soi.quantity END) AS total
      FROM sales_orders so
      JOIN sales_order_items soi ON soi.order_id = so.id
      GROUP BY so.buyer_id
    ) sales ON sales.buyer_id = b.id
    LEFT JOIN (
      SELECT ro.buyer_id, SUM(CAST(roi.price AS DECIMAL(12,2)) * roi.quantity) AS total
      FROM repair_orders ro
      JOIN repair_order_items roi ON roi.repair_order_id = ro.id
      WHERE ro.buyer_id IS NOT NULL
      GROUP BY ro.buyer_id
    ) repairs ON repairs.buyer_id = b.id
    LEFT JOIN (
      SELECT buyer_id, SUM(CAST(recharge_amount AS DECIMAL(12,2))) AS total
      FROM service_cards
      GROUP BY buyer_id
    ) cards ON cards.buyer_id = b.id
    HAVING totalSpent > 0
    ORDER BY totalSpent DESC
    LIMIT ${take} OFFSET ${skip}
  `;

  const mapped = rows.map((r) => ({
    buyerId: r.buyerId.toString(),
    name: r.name,
    totalSpent: Number(r.totalSpent),
  }));

  ctx.body = { data: serialize(toPaginatedResult(mapped, pageSize)) };
});

export default router;
