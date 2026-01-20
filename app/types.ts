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
