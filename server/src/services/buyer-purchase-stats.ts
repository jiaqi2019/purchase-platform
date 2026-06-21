import { Prisma } from '@prisma/client';
import prisma from '../prisma';

export interface BuyerPurchaseStats {
  hasPurchases: boolean;
  totalSpent: number;
}

export async function getBuyerPurchaseStatsMap(
  buyerIds: bigint[],
): Promise<Map<string, BuyerPurchaseStats>> {
  const map = new Map<string, BuyerPurchaseStats>();
  for (const id of buyerIds) {
    map.set(id.toString(), { hasPurchases: false, totalSpent: 0 });
  }
  if (!buyerIds.length) return map;

  const rows = await prisma.$queryRaw<
    Array<{ buyerId: bigint; purchaseCount: bigint; totalSpent: unknown }>
  >`
    SELECT
      b.id AS buyerId,
      COALESCE(sales.purchaseCount, 0) AS purchaseCount,
      COALESCE(sales.total, 0) + COALESCE(repairs.total, 0) + COALESCE(cards.total, 0) AS totalSpent
    FROM buyers b
    LEFT JOIN (
      SELECT
        so.buyer_id,
        COUNT(DISTINCT so.id) AS purchaseCount,
        SUM(CASE WHEN soi.status = 'RETURNED' THEN 0 ELSE CAST(soi.price AS DECIMAL(12, 2)) * soi.quantity END) AS total
      FROM sales_orders so
      JOIN sales_order_items soi ON soi.order_id = so.id
      WHERE so.buyer_id IN (${Prisma.join(buyerIds)})
      GROUP BY so.buyer_id
    ) sales ON sales.buyer_id = b.id
    LEFT JOIN (
      SELECT ro.buyer_id, SUM(CAST(roi.price AS DECIMAL(12, 2)) * roi.quantity) AS total
      FROM repair_orders ro
      JOIN repair_order_items roi ON roi.repair_order_id = ro.id
      WHERE ro.buyer_id IN (${Prisma.join(buyerIds)})
      GROUP BY ro.buyer_id
    ) repairs ON repairs.buyer_id = b.id
    LEFT JOIN (
      SELECT buyer_id, SUM(CAST(recharge_amount AS DECIMAL(12, 2))) AS total
      FROM service_cards
      WHERE buyer_id IN (${Prisma.join(buyerIds)})
      GROUP BY buyer_id
    ) cards ON cards.buyer_id = b.id
    WHERE b.id IN (${Prisma.join(buyerIds)})
  `;

  for (const row of rows) {
    map.set(row.buyerId.toString(), {
      hasPurchases: Number(row.purchaseCount) > 0,
      totalSpent: Number(row.totalSpent),
    });
  }
  return map;
}
