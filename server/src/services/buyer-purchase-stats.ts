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
      p.buyer_id AS buyerId,
      COUNT(DISTINCT p.id) AS purchaseCount,
      COALESCE(SUM(CAST(pi.price AS DECIMAL(12, 2)) * pi.quantity), 0) AS totalSpent
    FROM purchases p
    LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
    WHERE p.buyer_id IN (${Prisma.join(buyerIds)})
    GROUP BY p.buyer_id
  `;

  for (const row of rows) {
    map.set(row.buyerId.toString(), {
      hasPurchases: Number(row.purchaseCount) > 0,
      totalSpent: Number(row.totalSpent),
    });
  }
  return map;
}
