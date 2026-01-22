// app/debug/Council/logic.ts
import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../../firebase"; 
import { 
  collection, 
  onSnapshot, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  runTransaction, 
  serverTimestamp, 
  Timestamp, 
  query, 
  orderBy 
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

// --- 2. 共通設定 (Constants) ---
export const LIMIT_TIME_MINUTES = 30;

// --- 型定義 ---
export type OrderStatus = 'ordered' | 'paying' | 'completed' | 'cancelled' | 'force_cancelled';

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  stock: number;
  limit: number; // 1人あたりの購入制限
  displayOrder: number;
  isSoldOut: boolean;
}

export interface CartItem {
  menuId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  ticketId: string; // 表示用チケット番号
  items: CartItem[];
  totalAmount: number;
  status: OrderStatus;
  createdAt: Timestamp;
  userId: string;
}

// --- Module 1 & 2: Admin Logic [設定・管理・監視] ---
export const useAdminLogic = () => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [systemMode, setSystemMode] = useState<string>("open"); // preparation, open, closed
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // 初期化・認証
  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));

    // タイマー更新 (遅延判定用)
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Menu監視
  useEffect(() => {
    const q = query(collection(db, "menu"), orderBy("displayOrder", "asc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setMenuItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem)));
    });
    return () => unsub();
  }, []);

  // Orders監視 (subscribeToOrders)
  useEffect(() => {
    // 完了済み以外または直近のもの取得が望ましいが、ここでは全件取得してJS側でフィルタリング
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
    });
    return () => unsub();
  }, []);

  // --- Module 1: メニュー管理機能 ---
  const updateSystemMode = async (mode: string) => {
    // システム設定ドキュメントがあると仮定、なければローカルステートのみ
    setSystemMode(mode); 
  };

  const addMenuItem = async (item: Omit<MenuItem, "id">) => {
    await addDoc(collection(db, "menu"), item);
  };

  const updateMenuItem = async (id: string, data: Partial<MenuItem>) => {
    await updateDoc(doc(db, "menu", id), data);
  };

  const deleteMenuItem = async (id: string) => {
    if(!confirm("商品を削除しますか？")) return;
    await deleteDoc(doc(db, "menu", id));
  };

  // --- Module 2: オーダー処理機能 ---
  
  // ソート・レンダリングロジック (sortAndRenderOrders)
  const processedOrders = useMemo(() => {
    const activeOrders = orders.filter(o => !['cancelled', 'force_cancelled'].includes(o.status));
    
    return activeOrders.sort((a, b) => {
      // 1. Status: paying (最優先)
      if (a.status === 'paying' && b.status !== 'paying') return -1;
      if (a.status !== 'paying' && b.status === 'paying') return 1;

      // 2. Status: ordered (古い順 = createdAt昇順)
      if (a.status === 'ordered' && b.status === 'ordered') {
        return a.createdAt.toMillis() - b.createdAt.toMillis();
      }

      // 3. Status: completed (新しい順 = createdAt降順)
      if (a.status === 'completed' && b.status === 'completed') {
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      }
      
      return 0;
    }).map(order => {
      // 遅延判定ロジック
      const elapsedMinutes = (currentTime.getTime() - order.createdAt.toDate().getTime()) / (1000 * 60);
      const isDelayed = order.status === 'ordered' && elapsedMinutes > LIMIT_TIME_MINUTES;
      
      return {
        ...order,
        isDelayed,
        delayedMinutes: Math.floor(elapsedMinutes - LIMIT_TIME_MINUTES)
      };
    });
  }, [orders, currentTime]);

  // 支払い完了処理 (completePayment)
  const completePayment = async (orderId: string) => {
    await updateDoc(doc(db, "orders", orderId), { status: "completed" });
  };

  // 通常キャンセル (cancelOrder) - 在庫戻し付き
  const cancelOrder = async (orderId: string, items: CartItem[]) => {
    if(!confirm("注文をキャンセルし、在庫を戻しますか？")) return;
    await performCancelTransaction(orderId, items, "cancelled");
  };

  // 強制キャンセル (forceCancelOrder) - 在庫戻し付き
  const forceCancelOrder = async (orderId: string, items: CartItem[]) => {
    if(!confirm("期限切れのため強制キャンセルしますか？")) return;
    await performCancelTransaction(orderId, items, "force_cancelled");
  };

  // 共通トランザクション処理 (在庫復元)
  const performCancelTransaction = async (orderId: string, items: CartItem[], newStatus: OrderStatus) => {
    try {
      await runTransaction(db, async (transaction) => {
        // オーダー状態更新
        const orderRef = doc(db, "orders", orderId);
        transaction.update(orderRef, { status: newStatus });

        // 在庫復元 (Atomic Increment)
        for (const item of items) {
          const menuRef = doc(db, "menu", item.menuId);
          const menuDoc = await transaction.get(menuRef);
          if (menuDoc.exists()) {
            const currentStock = menuDoc.data().stock || 0;
            transaction.update(menuRef, { stock: currentStock + item.quantity });
          }
        }
      });
      alert("キャンセル処理が完了しました。");
    } catch (e) {
      console.error("Cancel Transaction Failed", e);
      alert("キャンセル処理に失敗しました。");
    }
  };

  return {
    menuItems,
    orders: processedOrders, // UI側ではこれを使用
    systemMode,
    updateSystemMode,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    completePayment,
    cancelOrder,
    forceCancelOrder,
    LIMIT_TIME_MINUTES
  };
};

// --- Module 3 & 4: User Logic [注文・チケット] ---
export const useUserLogic = () => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [myOrder, setMyOrder] = useState<Order | null>(null);
  const [remainingTime, setRemainingTime] = useState<string>("");
  const [isExpired, setIsExpired] = useState(false);

  // ユーザーID管理
  const myUserId = useMemo(() => {
    let stored = localStorage.getItem("order_system_user_id");
    if (!stored) {
      stored = "U_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("order_system_user_id", stored);
    }
    return stored;
  }, []);

  // 初期データロード
  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    
    // Menu購読
    const unsubMenu = onSnapshot(query(collection(db, "menu"), orderBy("displayOrder")), (snap) => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem)));
    });

    return () => unsubMenu();
  }, []);

  // 自分のオーダー監視 (monitorOrderStatus)
  useEffect(() => {
    if (!myOrder && !localStorage.getItem("current_order_id")) return;
    
    const orderId = myOrder?.id || localStorage.getItem("current_order_id");
    if (!orderId) return;

    const unsubOrder = onSnapshot(doc(db, "orders", orderId), (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as Order;
        setMyOrder(data);
        localStorage.setItem("current_order_id", data.id); // 永続化

        // 完了またはキャンセル時の処理
        if (data.status === 'completed') {
            // UI側で「購入ありがとうございます」へ遷移
        }
      } else {
        // ドキュメントが消えた場合など
        setMyOrder(null);
        localStorage.removeItem("current_order_id");
      }
    });
    
    return () => unsubOrder();
  }, [myOrder?.id]);

  // チケットタイマー制御 (displayTicket UI logic)
  useEffect(() => {
    if (!myOrder || myOrder.status === 'completed' || myOrder.status === 'cancelled') return;

    const interval = setInterval(() => {
      const createdTime = myOrder.createdAt.toDate().getTime();
      const now = new Date().getTime();
      const limitMs = LIMIT_TIME_MINUTES * 60 * 1000;
      const elapsed = now - createdTime;
      const remaining = limitMs - elapsed;

      if (remaining <= 0) {
        setIsExpired(true);
        setRemainingTime("00:00");
      } else {
        setIsExpired(false);
        const m = Math.floor(remaining / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        setRemainingTime(`${m}:${s.toString().padStart(2, '0')}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [myOrder]);

  // --- Module 3: 注文・在庫確保トランザクション (submitOrder) ---
  const submitOrder = async () => {
    if (cart.length === 0) return;

    try {
      await runTransaction(db, async (transaction) => {
        const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        // 1. 最新在庫確認
        for (const item of cart) {
          const menuRef = doc(db, "menu", item.menuId);
          const menuDoc = await transaction.get(menuRef);
          
          if (!menuDoc.exists()) throw new Error("商品が存在しません");
          
          const currentStock = menuDoc.data().stock;
          if (currentStock < item.quantity) {
            throw new Error(`「${item.name}」がタッチの差で売り切れました`);
          }
          
          // 2. 在庫減算
          transaction.update(menuRef, { stock: currentStock - item.quantity });
        }

        // 3. 注文作成
        const newOrderRef = doc(collection(db, "orders"));
        const newOrderData = {
          ticketId: Math.floor(1000 + Math.random() * 9000).toString(), // 簡易チケット番号
          items: cart,
          totalAmount: totalAmount,
          status: "ordered",
          createdAt: serverTimestamp(),
          userId: myUserId
        };
        transaction.set(newOrderRef, newOrderData);
        
        // ローカルステート更新用にIDを保存 (Snapshotが拾うまでの繋ぎ)
        localStorage.setItem("current_order_id", newOrderRef.id);
      });
      
      // 成功後、カートクリア
      setCart([]);
      return true; // 画面遷移用
    } catch (e: any) {
      alert(e.message || "注文処理中にエラーが発生しました");
      return false;
    }
  };

  // --- Module 4: 支払いフロー (enterPaymentMode) ---
  const enterPaymentMode = async () => {
    if (!myOrder) return;
    try {
      await updateDoc(doc(db, "orders", myOrder.id), { status: "paying" });
    } catch (e) {
      console.error(e);
      alert("通信エラーが発生しました");
    }
  };

  // カート操作ヘルパー
  const addToCart = (menuItem: MenuItem, quantity: number) => {
    // limitチェックなどはUI側で行う前提だが、ここでもガード可能
    setCart(prev => {
      const existing = prev.find(p => p.menuId === menuItem.id);
      if (existing) {
        return prev.map(p => p.menuId === menuItem.id ? { ...p, quantity } : p);
      }
      return [...prev, { menuId: menuItem.id, name: menuItem.name, price: menuItem.price, quantity }];
    });
  };

  return {
    menuItems,
    cart,
    setCart,
    addToCart,
    myOrder,
    submitOrder,
    enterPaymentMode,
    remainingTime,
    isExpired
  };
};
