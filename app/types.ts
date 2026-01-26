// app/types.ts

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

// ショップデータの型（anyを減らすために定義）
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

// --- 以下、仕様書に基づき追加された型定義 ---

// Module 1: メニュー管理用
export type MenuItem = {
  id: string;         // Firestore Document ID
  name: string;       // 商品名
  price: number;      // 価格
  stock: number;      // 現在の在庫数
  limit: number;      // 1注文あたりの個数制限
  createdAt?: number; // 作成日時
};

// 注文内の各アイテム
export type OrderItem = {
  menuId: string;
  name: string;
  count: number;
  price: number;
};

// Module 2: 注文ステータス
// ordered: 在庫確保・調理待ち
// paying: 会計待ち（視認性強調）
// completed: 受渡完了
// cancelled: キャンセル（在庫復元）
export type OrderStatus = 'ordered' | 'paying' | 'completed' | 'cancelled';

// Module 2: 注文データ (Firestore: orders collection)
export type Order = {
  id: string;             // Firestore Document ID
  ticketId: string;       // 6桁連番 "000001"
  items: OrderItem[];     // 注文商品の配列
  totalAmount: number;    // 合計金額
  status: OrderStatus;    // ステータス
  createdAt: number;      // 注文日時 (Timestamp millis) - 30分遅延判定に使用
};
