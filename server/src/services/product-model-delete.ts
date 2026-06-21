import type { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors';

type Tx = Prisma.TransactionClient;

export async function assertProductModelUnused(tx: Tx, modelId: bigint): Promise<void> {
  const [stockInItems, inventoryItems, inventoryBatches, salesItems, repairItems, serviceItems] =
    await Promise.all([
      tx.stockInItem.count({ where: { modelId } }),
      tx.inventoryItem.count({ where: { modelId } }),
      tx.inventoryBatch.count({ where: { modelId } }),
      tx.salesOrderItem.count({ where: { modelId } }),
      tx.repairOrderItem.count({ where: { modelId } }),
      tx.serviceOrderItem.count({ where: { modelId } }),
    ]);
  if (
    stockInItems ||
    inventoryItems ||
    inventoryBatches ||
    salesItems ||
    repairItems ||
    serviceItems
  ) {
    throw new AppError(409, 'CONFLICT', '该型号已有入库或订单记录，无法删除');
  }
}

export async function deleteUnusedProductModels(
  tx: Tx,
  where: Prisma.ProductModelWhereInput,
): Promise<void> {
  const models = await tx.productModel.findMany({ where, select: { id: true } });
  for (const model of models) {
    await assertProductModelUnused(tx, model.id);
    await tx.productModel.delete({ where: { id: model.id } });
  }
}

export async function assertLegacyProductsUnused(
  tx: Tx,
  where: Prisma.ProductWhereInput,
): Promise<void> {
  const products = await tx.product.findMany({ where, select: { id: true, stock: true, name: true } });
  for (const product of products) {
    const purchaseItems = await tx.purchaseItem.count({ where: { productId: product.id } });
    if (product.stock > 0 || purchaseItems > 0) {
      throw new AppError(409, 'CONFLICT', `商品 ${product.name} 已有库存或订单记录，无法删除`);
    }
  }
}
