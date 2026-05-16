export interface PurchaseItemInput {
  productId?: string | number | null;
  name: string;
  /** 购买价（排行与累计消费按此计算） */
  price: string | number;
  /** 售卖价快照，可与购买价不同 */
  sellPrice?: string | number | null;
  quantity?: number;
}

export interface CreatePurchaseInput {
  buyerId: string | number;
  purchasedAt?: string;
  note?: string | null;
  items: PurchaseItemInput[];
}
