import type { Prisma } from '@prisma/client';
import { InventoryLedgerType, InventoryStatus, ProductTrackingMode } from '@prisma/client';
import { AppError } from '../utils/errors';

type Tx = Prisma.TransactionClient;

export interface StockOutInput {
  modelId?: string | number | bigint | null;
  inventoryItemId?: string | number | bigint | null;
  quantity: number;
  refType: string;
  refId: bigint;
  ledgerType: InventoryLedgerType;
  nextStatus?: InventoryStatus;
  note?: string | null;
}

export interface StockOutResult {
  unitCost: number;
  totalCost: number;
}

function positiveMoney(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function stockOut(tx: Tx, input: StockOutInput): Promise<StockOutResult> {
  const qty = Number(input.quantity) || 1;
  if (qty <= 0) throw new AppError(400, 'VALIDATION_ERROR', '出库数量必须大于 0');

  if (input.inventoryItemId) {
    const item = await tx.inventoryItem.findUnique({
      where: { id: BigInt(input.inventoryItemId) },
      include: { model: true, stockInItem: { select: { costPrice: true } } },
    });
    if (!item) throw new AppError(404, 'NOT_FOUND', '库存单品不存在');
    const availableStatuses: InventoryStatus[] = [
      InventoryStatus.IN_STOCK,
      InventoryStatus.RETURNED_IN_STOCK,
    ];
    if (!availableStatuses.includes(item.status)) {
      throw new AppError(409, 'INVALID_INVENTORY_STATUS', '库存单品不是可出库状态');
    }
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { status: input.nextStatus ?? InventoryStatus.SOLD },
    });
    await tx.inventoryLedger.create({
      data: {
        type: input.ledgerType,
        modelId: item.modelId,
        inventoryItemId: item.id,
        quantity: -1,
        refType: input.refType,
        refId: input.refId,
        note: input.note || null,
      },
    });
    const unitCost = positiveMoney(item.costPrice) || positiveMoney(item.stockInItem?.costPrice);
    return { unitCost, totalCost: unitCost * qty };
  }

  if (!input.modelId) throw new AppError(400, 'VALIDATION_ERROR', 'modelId 必填');
  const model = await tx.productModel.findUnique({ where: { id: BigInt(input.modelId) } });
  if (!model) throw new AppError(404, 'NOT_FOUND', '型号不存在');
  if (model.trackingMode === ProductTrackingMode.SERIALIZED) {
    throw new AppError(400, 'VALIDATION_ERROR', '单品追踪商品必须选择具体库存单品');
  }

  const batches = await tx.inventoryBatch.findMany({
    where: { modelId: model.id, quantityOnHand: { gt: 0 } },
    orderBy: { id: 'asc' },
  });
  let remaining = qty;
  let totalCost = 0;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const used = Math.min(batch.quantityOnHand, remaining);
    totalCost += positiveMoney(batch.costPrice) * used;
    await tx.inventoryBatch.update({
      where: { id: batch.id },
      data: { quantityOnHand: { decrement: used } },
    });
    remaining -= used;
  }
  if (remaining > 0) {
    throw new AppError(409, 'INSUFFICIENT_STOCK', `${model.name} 库存不足`);
  }

  await tx.inventoryLedger.create({
    data: {
      type: input.ledgerType,
      modelId: model.id,
      quantity: -qty,
      refType: input.refType,
      refId: input.refId,
      note: input.note || null,
    },
  });

  return {
    unitCost: qty > 0 ? totalCost / qty : 0,
    totalCost,
  };
}

export async function restockSalesItem(
  tx: Tx,
  salesOrderItemId: string | number | bigint,
  quantity: number,
  refType: string,
  refId: bigint,
): Promise<void> {
  const item = await tx.salesOrderItem.findUnique({
    where: { id: BigInt(salesOrderItemId) },
    include: { model: true, inventoryItem: true },
  });
  if (!item) throw new AppError(404, 'NOT_FOUND', '销售明细不存在');
  const qty = Number(quantity) || item.quantity;

  if (item.inventoryItemId) {
    await tx.inventoryItem.update({
      where: { id: item.inventoryItemId },
      data: { status: InventoryStatus.RETURNED_IN_STOCK },
    });
    await tx.inventoryLedger.create({
      data: {
        type: InventoryLedgerType.RETURN_IN,
        modelId: item.modelId,
        inventoryItemId: item.inventoryItemId,
        quantity: 1,
        refType,
        refId,
      },
    });
    return;
  }

  if (!item.modelId) return;
  let batch = await tx.inventoryBatch.findFirst({ where: { modelId: item.modelId } });
  if (!batch) {
    batch = await tx.inventoryBatch.create({
      data: { modelId: item.modelId, quantityOnHand: 0 },
    });
  }
  await tx.inventoryBatch.update({
    where: { id: batch.id },
    data: { quantityOnHand: { increment: qty } },
  });
  await tx.inventoryLedger.create({
    data: {
      type: InventoryLedgerType.RETURN_IN,
      modelId: item.modelId,
      quantity: qty,
      refType,
      refId,
    },
  });
}
