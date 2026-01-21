// app/types.ts

// ★仕様書: 受取期限の分数（定数）
export const LIMIT_TIME_MINUTES = 30;

export type Ticket = {
  uniqueKey: string;
  shopId: string;
  shopName: string;
  shopDepartment?: string;
  time: string;
  timestamp: number; // ユーザー側はnumber (Date.now()) で保持している想定
  // ★仕様書: force_cancelled 追加
  status: "reserved" | "waiting" | "ready" | "used" | "done" | "ordered" | "paying" | "completed" | "canceled" | "force_cancelled";
  count: number;
  isQueue?: boolean;
  ticketId?: string;
  peopleAhead?: number;
  // オーダー情報
  isOrder?: boolean;
  totalPrice?: number;
  items?: { id: string; name: string; price: number; count: number }[];
};

export type AdminOrder = {
    id: string;
    ticketId: string;
    userId: string;
    items: { menuId: string; name: string; price: number; count: number }[];
    totalAmount: number;
    status: string;
    createdAt: any; // Firestore Timestamp
};

// (その他の型定義は省略可能ですが、整合性のため記載)
export type Shop = {
  id: string;
  name: string;
  department?: string;
  isOrderSystem?: boolean;
  orders?: AdminOrder[];
  menu?: any[];
  // ...他プロパティ
};
