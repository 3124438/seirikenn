import { useState, useEffect } from 'react';
import { 
  collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc, setDoc,
  serverTimestamp, query, orderBy, increment 
} from 'firebase/firestore';
import { db } from '@/lib/firebase'; // プロジェクトの設定に合わせて変更してください

// --- Constants ---
const LIMIT_TIME_MINUTES = 30;

// --- Helpers ---
export const convertGoogleDriveLink = (url: string) => {
  if (!url) return '';
  const fileIdMatch = url.match(/\/d\/(.+?)\//);
  if (fileIdMatch) {
    return `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`;
  }
  return url;
};

// --- Custom Hook ---
export const useAdminLogic = () => {
  // Global State
  const [attractions, setAttractions] = useState<any[]>([]);
  const [myUserId, setMyUserId] = useState('ADMIN_USER'); // 実際はAuthから取得
  const [expandedShopId, setExpandedShopId] = useState<string | null>(null);
  const [searchUserId, setSearchUserId] = useState('');

  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [originalId, setOriginalId] = useState('');
  const [manualId, setManualId] = useState('');
  const [newName, setNewName] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [groupLimit, setGroupLimit] = useState(4);
  const [openTime, setOpenTime] = useState('10:00');
  const [closeTime, setCloseTime] = useState('16:00');
  const [duration, setDuration] = useState(20);
  const [capacity, setCapacity] = useState(5);
  const [isPaused, setIsPaused] = useState(false);
  const [isQueueMode, setIsQueueMode] = useState(false);

  // Sub-collection State (Only valid when expandedShopId is set)
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  // 1. Fetch Attractions (Global)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'attractions'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // ID順にソート
      data.sort((a: any, b: any) => a.id.localeCompare(b.id));
      setAttractions(data);
    });
    return () => unsub();
  }, []);

  // 2. Fetch Sub-collections (Menu & Orders) when expanded
  useEffect(() => {
    if (!expandedShopId) {
      setMenuItems([]);
      setOrders([]);
      return;
    }

    const menuRef = collection(db, `attractions/${expandedShopId}/menu`);
    const ordersRef = collection(db, `attractions/${expandedShopId}/orders`);

    const unsubMenu = onSnapshot(query(menuRef, orderBy('createdAt', 'asc')), (snap) => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubOrders = onSnapshot(ordersRef, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubMenu();
      unsubOrders();
    };
  }, [expandedShopId]);

  // --- Computed Values ---
  const targetShop = attractions.find((s: any) => s.id === expandedShopId);

  const stats = {
    totalVenues: attractions.length,
    pausedVenues: attractions.filter((s: any) => s.isPaused).length,
    totalReservations: attractions.reduce((acc: number, cur: any) => acc + (cur.reservations?.length || 0), 0) + 
                       attractions.reduce((acc: number, cur: any) => acc + (cur.queue?.filter((q:any) => ['waiting','ready'].includes(q.status)).length || 0), 0)
  };

  const sortedOrders = {
    active: (() => {
      const list = orders.filter((o: any) => ['paying', 'ordered'].includes(o.status));
      return list.map((o: any) => {
          const createdAt = o.createdAt?.toDate ? o.createdAt.toDate() : new Date();
          const diffMins = (Date.now() - createdAt.getTime()) / (1000 * 60);
          return { ...o, isDelayed: diffMins > LIMIT_TIME_MINUTES, delayedMinutes: Math.floor(diffMins) };
      }).sort((a: any, b: any) => {
          if (a.status === 'paying' && b.status !== 'paying') return -1;
          if (a.status !== 'paying' && b.status === 'paying') return 1;
          return (a.ticketId || "").localeCompare(b.ticketId || "");
      });
    })()
  };

  // --- Actions: Global / Shop Settings ---

  const resetForm = () => {
    setIsEditing(false);
    setOriginalId('');
    setManualId('');
    setNewName('');
    setPassword('');
    setDepartment('');
    setImageUrl('');
    setDescription('');
    setIsPaused(false);
    setIsQueueMode(false);
  };

  const startEdit = (shop: any) => {
    setIsEditing(true);
    setOriginalId(shop.id);
    setManualId(shop.id);
    setNewName(shop.name);
    setPassword(shop.password || '');
    setDepartment(shop.department || '');
    setImageUrl(shop.image || '');
    setDescription(shop.description || '');
    setGroupLimit(shop.groupLimit || 4);
    setOpenTime(shop.openTime || '10:00');
    setCloseTime(shop.closeTime || '16:00');
    setDuration(shop.duration || 20);
    setCapacity(shop.capacity || 5);
    setIsPaused(shop.isPaused || false);
    setIsQueueMode(shop.isQueueMode || false);
  };

  const handleSave = async () => {
    if (!manualId || !newName) return alert('IDと会場名は必須です');
    
    const data = {
      name: newName,
      password,
      department,
      image: imageUrl,
      description,
      groupLimit,
      openTime,
      closeTime,
      duration,
      capacity,
      isPaused,
      isQueueMode,
      updatedAt: serverTimestamp()
    };

    try {
      if (isEditing && manualId !== originalId) {
        // ID変更: 新規作成して旧削除（実際はサブコレクションの移行が必要だがここでは省略）
        await setDoc(doc(db, 'attractions', manualId), { ...data, createdAt: serverTimestamp() });
        await deleteDoc(doc(db, 'attractions', originalId));
      } else if (isEditing) {
        await updateDoc(doc(db, 'attractions', originalId), data);
      } else {
        await setDoc(doc(db, 'attractions', manualId), { ...data, createdAt: serverTimestamp(), queue: [], reservations: [] });
      }
      resetForm();
    } catch (e) {
      console.error(e);
      alert('保存に失敗しました');
    }
  };

  const handleDeleteVenue = async (id: string) => {
    if(!confirm('本当にこの会場を削除しますか？')) return;
    await deleteDoc(doc(db, 'attractions', id));
  };

  const handleBulkPause = async (pause: boolean) => {
    if(!confirm(`全ての会場を${pause ? '停止' : '再開'}しますか？`)) return;
    await Promise.all(attractions.map((s: any) => updateDoc(doc(db, 'attractions', s.id), { isPaused: pause })));
  };

  const handleBulkDeleteReservations = async () => {
    if(!confirm('全会場の予約・待ち行列データを削除しますか？')) return;
    await Promise.all(attractions.map((s: any) => updateDoc(doc(db, 'attractions', s.id), { reservations: [], queue: [] })));
  };

  const handleBulkDeleteVenues = async () => {
    if(!confirm('【危険】全ての会場データを削除しますか？この操作は取り消せません。')) return;
    await Promise.all(attractions.map((s: any) => deleteDoc(doc(db, 'attractions', s.id))));
  };

  // --- Actions: Queue / Reservation ---

  const toggleReservationStatus = async (shop: any, res: any, status: string) => {
    const newReservations = shop.reservations.map((r: any) => 
      (r.userId === res.userId && r.time === res.time) ? { ...r, status } : r
    );
    await updateDoc(doc(db, 'attractions', shop.id), { reservations: newReservations });
  };

  const cancelReservation = async (shop: any, res: any) => {
    const newReservations = shop.reservations.filter((r: any) => !(r.userId === res.userId && r.time === res.time));
    await updateDoc(doc(db, 'attractions', shop.id), { reservations: newReservations });
  };

  const updateQueueStatus = async (shop: any, ticket: any, status: string) => {
    const newQueue = shop.queue.map((t: any) => 
      t.ticketId === ticket.ticketId ? { ...t, status } : t
    );
    await updateDoc(doc(db, 'attractions', shop.id), { queue: newQueue });
  };

  // --- Actions: Menu Management ---

  const addMenuItem = async (item: any) => {
    if (!expandedShopId) return;
    await addDoc(collection(db, `attractions/${expandedShopId}/menu`), {
      ...item,
      createdAt: serverTimestamp()
    });
  };

  const updateMenuStock = async (itemId: string, stock: number) => {
    if (!expandedShopId) return;
    await updateDoc(doc(db, `attractions/${expandedShopId}/menu`, itemId), { stock });
  };

  const deleteMenuItem = async (itemId: string) => {
    if (!expandedShopId) return;
    if(!confirm('メニューを削除しますか？')) return;
    await deleteDoc(doc(db, `attractions/${expandedShopId}/menu`, itemId));
  };

  // --- Actions: Order Management ---

  const completePayment = async (orderId: string) => {
    if (!expandedShopId) return;
    await updateDoc(doc(db, `attractions/${expandedShopId}/orders`, orderId), {
      status: 'completed',
      completedAt: serverTimestamp()
    });
  };

  const cancelOrder = async (order: any) => {
    if (!expandedShopId) return;
    if(!confirm('注文をキャンセルして在庫を戻しますか？')) return;
    
    // 1. Update Order Status
    await updateDoc(doc(db, `attractions/${expandedShopId}/orders`, order.id), {
      status: 'cancelled',
      cancelledAt: serverTimestamp()
    });

    // 2. Restore Stock (Simplified)
    // 実際の実装ではトランザクション処理が推奨されます
    console.log("在庫復元処理スキップ（必要に応じて実装）", order.items);
  };

  return {
    attractions, myUserId,
    expandedShopId, setExpandedShopId,
    isEditing, setIsEditing, originalId, setOriginalId,
    manualId, setManualId, newName, setNewName, password, setPassword,
    department, setDepartment, imageUrl, setImageUrl, description, setDescription,
    groupLimit, setGroupLimit, openTime, setOpenTime, closeTime, setCloseTime,
    duration, setDuration, capacity, setCapacity, isPaused, setIsPaused,
    isQueueMode, setIsQueueMode,
    searchUserId, setSearchUserId,
    stats,
    handleBulkPause, handleBulkDeleteReservations, handleBulkDeleteVenues,
    resetForm, startEdit, handleSave, handleDeleteVenue,
    toggleReservationStatus, cancelReservation, updateQueueStatus,
    targetShop,
    // New Order System
    menuItems, orders, sortedOrders,
    addMenuItem, updateMenuStock, deleteMenuItem,
    completePayment, cancelOrder
  };
};
