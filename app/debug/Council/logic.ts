//app/debug/Council/logic.ts
import { useState, useEffect, useMemo } from "react";
// 階層に合わせてパスを調整してください
import { db, auth } from "../../../firebase"; 
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  runTransaction,
  Timestamp,
  getDoc
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

// --- Constants ---
export const LIMIT_TIME_MINUTES = 30;

// --- Interfaces ---
export interface MenuItem {
  id: string;
  name: string;
  price: number;
  stock: number;
  limit: number;
  createdAt: Timestamp;
}

export interface OrderItem {
    menuId: string;
    name: string;
    price: number;
    quantity: number;
}

export interface Order {
  id: string;
  ticketId: string; // 6桁連番 "000001"
  items: OrderItem[];
  totalAmount: number;
  status: 'ordered' | 'paying' | 'completed' | 'cancelled' | 'force_cancelled';
  createdAt: Timestamp;
  userId: string;
  isDelayed?: boolean;     // フロントエンド計算用
  delayedMinutes?: number; // フロントエンド表示用
}

// GoogleドライブのURLを自動変換する関数
export const convertGoogleDriveLink = (url: string) => {
  if (!url) return "";
  if (!url.includes("drive.google.com") || url.includes("export=view")) {
    return url;
  }
  try {
    const id = url.split("/d/")[1].split("/")[0];
    return `https://drive.google.com/uc?export=view&id=${id}`;
  } catch (e) {
    return url;
  }
};

export const useAdminLogic = () => {
  const [attractions, setAttractions] = useState<any[]>([]);
  const [myUserId, setMyUserId] = useState("");

  // --- UI State ---
  const [expandedShopId, setExpandedShopId] = useState<string | null>(null); 
  const [isEditing, setIsEditing] = useState(false);
  const [originalId, setOriginalId] = useState<string | null>(null);
  
  // --- New Order System Data ---
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // --- Shop Form State (Venue CRUD) ---
  const [manualId, setManualId] = useState("");
  const [newName, setNewName] = useState("");
  const [password, setPassword] = useState("");
  const [department, setDepartment] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  
  // Legacy or Basic Settings
  const [groupLimit, setGroupLimit] = useState(4);
  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("15:00");
  const [duration, setDuration] = useState(20);
  const [capacity, setCapacity] = useState(3);
  const [isPaused, setIsPaused] = useState(false);
  
  // フラグ: 注文システムを利用するかどうか
  const [isQueueMode, setIsQueueMode] = useState(true); 

  // Initial Setup
  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));
    
    // Admin ID generation / retrieval
    let stored = localStorage.getItem("bunkasai_user_id");
    if (!stored) {
        stored = "ADMIN_" + Math.random().toString(36).substring(2, 9).toUpperCase();
        localStorage.setItem("bunkasai_user_id", stored);
    }
    setMyUserId(stored);

    // Fetch Attractions (Shops)
    const unsub = onSnapshot(collection(db, "attractions"), (snapshot) => {
      const newData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttractions(newData);
    });

    // Clock for delay check
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);

    return () => {
        unsub();
        clearInterval(timer);
    };
  }, []);

  // --- Sub-collection Listeners (Menu & Orders) ---
  // 店舗が選択されたときのみ購読を開始する
  useEffect(() => {
    if (!expandedShopId) {
        setMenuItems([]);
        setOrders([]);
        return;
    }

    // 1. Menu Listener
    const menuRef = collection(db, "attractions", expandedShopId, "menu");
    const qMenu = query(menuRef, orderBy("createdAt", "asc"));
    const unsubMenu = onSnapshot(qMenu, (snap) => {
        setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem)));
    });

    // 2. Orders Listener
    const ordersRef = collection(db, "attractions", expandedShopId, "orders");
    const qOrders = query(ordersRef, orderBy("createdAt", "asc")); // 基本は古い順で取得し、メモリ内でソート
    const unsubOrders = onSnapshot(qOrders, (snap) => {
        const now = new Date();
        const fetchedOrders = snap.docs.map(d => {
            const data = d.data();
            // 遅延判定ロジック
            const created = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
            const elapsedMinutes = Math.floor((now.getTime() - created.getTime()) / (1000 * 60));
            
            return {
                id: d.id,
                ...data,
                isDelayed: data.status === 'ordered' && elapsedMinutes > LIMIT_TIME_MINUTES,
                delayedMinutes: Math.max(0, elapsedMinutes - LIMIT_TIME_MINUTES)
            } as Order;
        });
        setOrders(fetchedOrders);
    });

    return () => {
        unsubMenu();
        unsubOrders();
    };
  }, [expandedShopId]);

  // --- Sorting Logic (Order Dashboard) ---
  const sortedOrders = useMemo(() => {
      // 完了・キャンセル済みは基本的に除外、またはリストの下部に配置する運用を想定
      // ここでは仕様に基づき「Status: completed / cancelled は基本非表示」とするが、
      // 履歴確認用に別リストが必要な場合はUI側で制御可能にするため、全データを返す形にする
      // ただし、アクティブなオーダーのソート順は仕様通りにする。

      const activeOrders = orders.filter(o => ['ordered', 'paying'].includes(o.status));
      const historyOrders = orders.filter(o => !['ordered', 'paying'].includes(o.status));

      const sortedActive = activeOrders.sort((a, b) => {
          // 1. Priority: Status 'paying' (Top)
          if (a.status === 'paying' && b.status !== 'paying') return -1;
          if (a.status !== 'paying' && b.status === 'paying') return 1;
          
          // 2. Priority: Ordered (FIFO / Ticket ID ASC)
          return (a.ticketId || "").localeCompare(b.ticketId || "");
      });

      return { active: sortedActive, history: historyOrders };
  }, [orders, currentTime]); // currentTimeが変わると遅延判定は変わらないが、再レンダリングのトリガーとして

  // --- Module 1: Menu Management Functions ---

  const addMenuItem = async (itemData: Omit<MenuItem, "id" | "createdAt">) => {
      if (!expandedShopId) return;
      try {
          await addDoc(collection(db, "attractions", expandedShopId, "menu"), {
              ...itemData,
              createdAt: serverTimestamp()
          });
      } catch (e) {
          console.error(e);
          alert("メニュー追加に失敗しました");
      }
  };

  const updateMenuStock = async (menuId: string, newStock: number) => {
      if (!expandedShopId) return;
      try {
          await updateDoc(doc(db, "attractions", expandedShopId, "menu", menuId), {
              stock: Number(newStock)
          });
      } catch (e) {
          console.error(e);
      }
  };

  const deleteMenuItem = async (menuId: string) => {
      if (!expandedShopId || !confirm("このメニューを削除しますか？")) return;
      try {
          await deleteDoc(doc(db, "attractions", expandedShopId, "menu", menuId));
      } catch (e) {
          console.error(e);
          alert("削除に失敗しました");
      }
  };

  // --- Module 2: Order Status Management Functions ---

  const completePayment = async (orderId: string) => {
      if (!expandedShopId) return;
      if (!confirm("支払いを完了し、商品を引き渡しますか？")) return;
      
      try {
          await updateDoc(doc(db, "attractions", expandedShopId, "orders", orderId), {
              status: "completed"
          });
      } catch (e) {
          console.error("Payment Error:", e);
          alert("処理に失敗しました");
      }
  };

  const cancelOrder = async (order: Order, isForce: boolean = false) => {
      if (!expandedShopId) return;
      const msg = isForce 
        ? "【強制キャンセル】\n在庫を戻し、注文を強制的に取り消しますか？"
        : "注文をキャンセルし、在庫を戻しますか？";
        
      if (!confirm(msg)) return;

      try {
          await runTransaction(db, async (transaction) => {
              // 1. Order Check
              const orderRef = doc(db, "attractions", expandedShopId, "orders", order.id);
              const orderSnap = await transaction.get(orderRef);
              if (!orderSnap.exists()) throw "Order does not exist!";

              // 2. Update Order Status
              const newStatus = isForce ? "force_cancelled" : "cancelled";
              transaction.update(orderRef, { status: newStatus });

              // 3. Restore Stock (Atomic Increment)
              for (const item of order.items) {
                  const menuRef = doc(db, "attractions", expandedShopId, "menu", item.menuId);
                  const menuDoc = await transaction.get(menuRef);
                  if (menuDoc.exists()) {
                      const currentStock = menuDoc.data().stock || 0;
                      transaction.update(menuRef, { stock: currentStock + item.quantity });
                  }
              }
          });
      } catch (e) {
          console.error("Cancel Error:", e);
          alert("キャンセル処理（在庫復元）に失敗しました");
      }
  };

  // --- Venue Management (CRUD) ---

  const resetForm = () => {
    setIsEditing(false);
    setOriginalId(null);
    setManualId(""); setNewName(""); setPassword("");
    setDepartment(""); setImageUrl(""); setDescription("");
    setGroupLimit(4); setOpenTime("10:00"); setCloseTime("15:00");
    setDuration(20); setCapacity(3); setIsPaused(false);
    setIsQueueMode(true); 
  };

  const startEdit = (shop: any) => {
    setIsEditing(true);
    setOriginalId(shop.id);
    setExpandedShopId(shop.id); // 編集開始と同時に詳細展開
    
    // Form Set
    setManualId(shop.id); setNewName(shop.name); setPassword(shop.password);
    setDepartment(shop.department || "");
    setImageUrl(shop.imageUrl || "");
    setDescription(shop.description || "");
    setGroupLimit(shop.groupLimit || 4); setOpenTime(shop.openTime);
    setCloseTime(shop.closeTime); setDuration(shop.duration);
    setCapacity(shop.capacity); setIsPaused(shop.isPaused || false);
    setIsQueueMode(shop.isQueueMode !== undefined ? shop.isQueueMode : true);
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async () => {
    if (!manualId || !newName || !password) return alert("必須項目(ID, 会場名, Pass)を入力してください");
    if (password.length !== 5) return alert("パスワードは5桁です");

    if (isEditing && originalId !== manualId) {
        if (attractions.some(s => s.id === manualId)) return alert(`ID「${manualId}」は既に存在します。`);
    }

    const data: any = {
      name: newName, password, groupLimit,
      department, imageUrl, description,
      openTime, closeTime, duration, capacity, isPaused, 
      isQueueMode
    };

    try {
        if (isEditing && originalId && manualId !== originalId) {
            if(!confirm(`会場IDを「${originalId}」から「${manualId}」に変更しますか？`)) return;
            // Note: ID変更はサブコレクションの移動が必要になるため本来複雑ですが、
            // ここでは簡易的にドキュメントの再作成としています（サブコレクションは失われるリスクがあります）
            alert("IDを変更すると、以前のIDに関連付けられた注文データやメニューは見えなくなります。");
            await setDoc(doc(db, "attractions", manualId), data);
            await deleteDoc(doc(db, "attractions", originalId));
            setExpandedShopId(manualId);
        } else {
            await setDoc(doc(db, "attractions", manualId), data, { merge: true });
            if(isEditing) setExpandedShopId(manualId);
        }
        alert(isEditing ? "更新しました" : "作成しました");
        if (!isEditing) resetForm();
    } catch(e) { console.error(e); alert("エラーが発生しました"); }
  };

  const handleDeleteVenue = async (id: string) => {
    if (!confirm("本当に会場を削除しますか？\n(注意: サブコレクションのデータは手動で削除されるまで残る場合があります)")) return;
    await deleteDoc(doc(db, "attractions", id));
    setExpandedShopId(null);
  };

  const handleBulkPause = async (shouldPause: boolean) => {
      const actionName = shouldPause ? "一斉停止" : "一斉再開";
      if(!confirm(`全ての会場を「${actionName}」しますか？`)) return;
      try {
          const promises = attractions.map(shop => 
              updateDoc(doc(db, "attractions", shop.id), { isPaused: shouldPause })
          );
          await Promise.all(promises);
          alert(`${actionName}が完了しました。`);
      } catch(e) { console.error(e); alert("エラーが発生しました。"); }
  };

  const targetShop = attractions.find(s => s.id === expandedShopId);

  return {
    attractions, myUserId,
    expandedShopId, setExpandedShopId,
    isEditing, setIsEditing, originalId,
    
    // Forms
    manualId, setManualId, newName, setNewName, password, setPassword,
    department, setDepartment, imageUrl, setImageUrl, description, setDescription,
    groupLimit, setGroupLimit, openTime, setOpenTime, closeTime, setCloseTime,
    duration, setDuration, capacity, setCapacity, isPaused, setIsPaused,
    isQueueMode, setIsQueueMode,
    
    // Actions
    handleBulkPause,
    resetForm, startEdit, handleSave, handleDeleteVenue,
    targetShop,

    // --- New System Exports ---
    menuItems,
    orders, 
    sortedOrders,
    addMenuItem,
    updateMenuStock,
    deleteMenuItem,
    completePayment,
    cancelOrder
  };
};
