import prisma from '../prisma';
import { AppError } from '../utils/errors';
import { parseOptionalDecimal } from '../utils/decimal';
import type { CreatePurchaseInput } from '../types/purchase';

export async function createPurchase({ buyerId, purchasedAt, note, items }: CreatePurchaseInput) {
  if (!items?.length) {
    throw new AppError(400, 'VALIDATION_ERROR', '至少一条购买明细');
  }

  return prisma.$transaction(async (tx) => {
    const buyer = await tx.buyer.findUnique({ where: { id: BigInt(buyerId) } });
    if (!buyer) throw new AppError(404, 'NOT_FOUND', '购买者不存在');

    const purchase = await tx.purchase.create({
      data: {
        buyerId: BigInt(buyerId),
        purchasedAt: purchasedAt ? new Date(purchasedAt) : new Date(),
        note: note || null,
      },
    });

    for (const item of items) {
      const qty = Number(item.quantity) || 1;
      const price = item.price;

      if (item.productId) {
        const product = await tx.product.findUnique({
          where: { id: BigInt(item.productId) },
        });
        if (!product) throw new AppError(404, 'NOT_FOUND', `商品 ${item.productId} 不存在`);
        if (product.stock < qty) {
          throw new AppError(409, 'INSUFFICIENT_STOCK', `库存不足: ${product.name}`);
        }
        await tx.product.update({
          where: { id: product.id },
          data: { stock: { decrement: qty } },
        });
      }

      await tx.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          productId: item.productId ? BigInt(item.productId) : null,
          name: item.name,
          price,
          sellPrice: parseOptionalDecimal(item.sellPrice) ?? null,
          quantity: qty,
        },
      });
    }

    return purchase;
  });
}

export async function deletePurchase(purchaseId: string | number) {
  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({
      where: { id: BigInt(purchaseId) },
      include: { items: true },
    });
    if (!purchase) throw new AppError(404, 'NOT_FOUND', '消费记录不存在');

    for (const item of purchase.items) {
      if (item.productId) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }

    await tx.purchase.delete({ where: { id: purchase.id } });
    return purchase;
  });
}
