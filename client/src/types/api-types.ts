export type Id = string;

export interface Buyer {
  id: Id;
  name: string;
  address: string | null;
  permanentAddress: string | null;
  birthday: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedList<T> {
  items: T[];
  hasMore: boolean;
}

export interface ProductCategory {
  id: Id;
  name: string;
  code: string;
  sortOrder: number;
  createdAt: string;
}

export interface Brand {
  id: Id;
  name: string;
  categoryId: Id | null;
  createdAt: string;
  category?: ProductCategory | null;
}

export interface Product {
  id: Id;
  categoryId: Id;
  brandId: Id | null;
  model: string | null;
  name: string;
  costPrice: string | number | null;
  sellPrice: string | number | null;
  stock: number;
  createdAt: string;
  updatedAt: string;
  category?: ProductCategory;
  brand?: Brand | null;
}

export interface PurchaseItem {
  id: Id;
  purchaseId: Id;
  productId: Id | null;
  name: string;
  /** 购买价 */
  price: string | number;
  /** 售卖价快照 */
  sellPrice: string | number | null;
  quantity: number;
  product?: Product | null;
}

export interface Purchase {
  id: Id;
  buyerId: Id;
  purchasedAt: string;
  note: string | null;
  createdAt: string;
  buyer?: Buyer;
  items: PurchaseItem[];
}

export interface PurchaseQueryResult {
  items: Purchase[];
  hasMore: boolean;
  grandTotal: number;
  purchaseCount: number;
  itemCount: number;
}

export interface LeaderboardEntry {
  buyerId: Id;
  name: string;
  totalSpent: number;
}

export interface BirthdayReminderSettings {
  id: number;
  leadDays: number;
  enabled: boolean;
  updatedAt: string;
}

export type ReminderStatus = 'PENDING' | 'DONE' | 'SKIPPED';

export interface BirthdayReminder {
  id: Id;
  buyerId: Id;
  birthday: string;
  leadDays: number;
  status: ReminderStatus;
  createdAt: string;
  resolvedAt: string | null;
  buyer?: Buyer;
  /** 是否有购买（消费）记录 */
  hasPurchases?: boolean;
  /** 累计消费金额（购买价） */
  totalSpent?: number;
}

export interface PurchaseItemInput {
  productId?: Id | null;
  name: string;
  price: string | number;
  sellPrice?: string | number | null;
  quantity: number;
}
