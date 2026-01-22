// app/types.ts

// --- 既存システム用型定義 (Legacy Support) ---
export type Ticket = {
  uniqueKey: string;
  shopId: string;
  shopName: string;
  shopDepartment?: string;
  time: string;
  timestamp: number;
  status: "reserved" | "waiting" | "ready" | "used" | "done";
  count: number;
  isQueue?: boolean;
  ticketId?: string;
  peopleAhead?: number;
};

export type Shop = {
  id: string;
  name: string;
  department?: string;
  description?: string;
  imageUrl?: string;
  isPaused?: boolean;
  isQueueMode?: boolean;
  capacity?: number;
  groupLimit?: number;
  slots?: { [time: string]: number };
  queue?: any[];
  reservations?: any[];
  password?: string;
};

export type DraftBooking = {
  time: string;
  remaining: number;
  mode: "slot" | "queue";
  maxPeople: number;
};

// --- 新オーダーシステム用型定義 (Specification Sec.3 & Modules) ---

// ステータス定義 (Sec 3)
export type OrderStatus = 'ordered' | 'paying' | 'completed' | 'cancelled' | 'force_cancelled';

// メニュー商品 (menu collection)
export interface MenuItem {
  id: string;
  name: string;
  price: number;
  stock: number;      // 現在在庫数
  limit: number;      // 1人あたりの購入制限数
  imageUrl?: string;
  description?: string;
  soldOut?: boolean;  // UI制御用
  order?: number;     // 表示順
}

// カート/注文商品詳細
export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

// 注文データ (orders collection)
export interface Order {
  id: string;         // 注文ID (Document ID)
  ticketId: string;   // ユーザー提示用チケットID (例: 4桁数字)
  userId: string;     // ユーザー識別子
  items: CartItem[];  // 購入商品リスト
  totalPrice: number; // 合計金額
  status: OrderStatus;
  createdAt: any;     // Firestore Timestamp (or Millis for logic handling)
}
