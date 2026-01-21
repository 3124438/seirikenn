// app/types.ts

// ★追加: 共通設定
export const LIMIT_TIME_MINUTES = 30;

export type Ticket = {
  uniqueKey: string;
  shopId: string;
  shopName: string;
  shopDepartment?: string;
  time: string;
  timestamp: number; // ユーザー側はnumber (Date.now()) で保持している想定
  status: "reserved" | "waiting" | "ready" | "used" | "done" | "ordered" | "paying" | "completed" | "canceled" | "force_cancelled"; // ★ force_cancelled 追加
  count: number;
  isQueue?: boolean;
  ticketId?: string;
  peopleAhead?: number;
  // オーダー情報
  isOrder?: boolean;
  totalPrice?: number;
  items?: { id: string; name: string; price: number; count: number }[];
};

// Admin側で使うオーダー型（Firestoreのtimestampオブジェクトを持つ場合があるため調整）
export type AdminOrder = {
    id: string;
    ticketId: string;
    userId: string;
    items: { menuId: string; name: string; price: number; count: number }[];
    totalAmount: number; // または totalPrice
    status: string;
    createdAt: any; // Firestore Timestamp
};

export type Shop = {
  id: string;
  name: string;
  department?: string;
  description?: string;
  imageUrl?: string;
  isPaused?: boolean;
  isQueueMode?: boolean;
  isOrderSystem?: boolean; // ★追加
  capacity?: number;
  groupLimit?: number;
  slots?: { [time: string]: number };
  queue?: any[];
  reservations?: any[];
  orders?: AdminOrder[]; // ★追加
  menu?: any[]; // ★追加
  password?: string;
};

export type DraftBooking = {
  time: string;
  remaining: number;
  mode: "slot" | "queue";
  maxPeople: number;
};
