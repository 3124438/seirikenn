"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../firebase";
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc,
  deleteDoc,
  runTransaction, 
  increment,
  Timestamp,
  query,
  orderBy
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

// --- Constants & Types ---

const LIMIT_TIME_MINUTES = 30;

type MenuItem = {
  id: string;
  name: string;
  price: number;
  stock: number;
  limit: number;
  order?: number;
};

type OrderItem = {
  id: string; // menuId
  name: string;
  price: number;
  quantity: number;
};

type Order = {
  id: string;
  ticketId: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'ordered' | 'paying' | 'completed' | 'cancelled' | 'force_cancelled';
  createdAt: Timestamp;
};

// --- Admin Component ---

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'menu'>('dashboard');
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuList, setMenuList] = useState<MenuItem[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // --- 1. Initialization & Listeners ---

  useEffect(() => {
    // 匿名認証（または適切な管理者認証）
    signInAnonymously(auth).catch(console.error);

    // 遅延判定用のタイマー (10秒ごとに現在時刻更新)
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);

    // 注文のリアルタイム監視
    const qOrders = query(collection(db, "orders"));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setOrders(fetchedOrders);
    });

    // メニューのリアルタイム監視
    const qMenu = query(collection(db, "menu"), orderBy("order", "asc"));
    const unsubMenu = onSnapshot(qMenu, (snapshot) => {
      const fetchedMenu = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem));
      setMenuList(fetchedMenu);
    });

    return () => {
      clearInterval(timer);
      unsubOrders();
      unsubMenu();
    };
  }, []);

  // --- 2. Logic: Module 2 (Dashboard) ---

  // キャンセル処理（通常キャンセル / 強制キャンセル共通）
  // Transactionを使用して在庫を確実に復元する
  const processCancellation = async (order: Order, newStatus: 'cancelled' | 'force_cancelled') => {
    const isForce = newStatus === 'force_cancelled';
    const message = isForce 
      ? "【重要】期限切れのため強制キャンセルを実行し、在庫を戻しますか？" 
      : "注文をキャンセルして在庫を戻しますか？";

    if (!confirm(message)) return;

    try {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, "orders", order.id);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) throw "Order not found";
        
        // 1. ステータス更新
        transaction.update(orderRef, { status: newStatus });

        // 2. 在庫復元 (Atomic Increment)
        for (const item of order.items) {
          const menuRef = doc(db, "menu", item.id);
          transaction.update(menuRef, { 
             stock: increment(item.quantity) 
          });
        }
      });
      alert(`注文を${isForce ? '強制' : ''}キャンセルしました`);
    } catch (e) {
      console.error(e);
      alert("キャンセル処理に失敗しました");
    }
  };

  // 支払い完了処理
  const completePayment = async (orderId: string) => {
    if (!confirm("支払いを完了とし、商品を引き渡しますか？")) return;
    try {
      await updateDoc(doc(db, "orders", orderId), {
        status: 'completed'
      });
    } catch (e) {
      alert("更新失敗");
    }
  };

  // ソート & フィルタリングロジック
  const getSortedOrders = () => {
    // アクティブな注文のみ対象 (完了・キャンセル済みは除外)
    const activeOrders = orders.filter(o => ['ordered', 'paying'].includes(o.status));
    
    return activeOrders.sort((a, b) => {
      // 優先度1: 'paying' (支払い提示中) が最上位
      if (a.status === 'paying' && b.status !== 'paying') return -1;
      if (a.status !== 'paying' && b.status === 'paying') return 1;

      // 優先度2: 注文時刻が古い順
      const timeA = a.createdAt?.toMillis() || 0;
      const timeB = b.createdAt?.toMillis() || 0;
      return timeA - timeB;
    });
  };

  // 完了・キャンセル履歴の取得（直近20件）
  const getCompletedOrders = () => {
      return orders
        .filter(o => ['completed', 'cancelled', 'force_cancelled'].includes(o.status))
        .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
        .slice(0, 20);
  };

  // 遅延判定ヘルパー
  const getDelayInfo = (order: Order) => {
    if (!order.createdAt) return { isDelayed: false, diffMinutes: 0 };
    const createdMs = order.createdAt.toMillis();
    const diffMinutes = Math.floor((currentTime - createdMs) / 60000);
    return {
      isDelayed: diffMinutes >= LIMIT_TIME_MINUTES,
      diffMinutes,
      overMinutes: diffMinutes - LIMIT_TIME_MINUTES
    };
  };

  // --- 3. Logic: Module 1 (Menu Management) ---

  const [editItem, setEditItem] = useState<Partial<MenuItem>>({});

  const handleUpdateMenu = async () => {
    if (!editItem.name || !editItem.price) return;
    try {
      if (editItem.id) {
        // 更新
        const ref = doc(db, "menu", editItem.id);
        await updateDoc(ref, { 
            name: editItem.name, 
            price: Number(editItem.price), 
            stock: Number(editItem.stock),
            limit: Number(editItem.limit) 
        });
      } else {
        // 新規作成
        await addDoc(collection(db, "menu"), {
          name: editItem.name,
          price: Number(editItem.price),
          stock: Number(editItem.stock || 0),
          limit: Number(editItem.limit || 5), // デフォルト制限数
          order: menuList.length + 1
        });
      }
      setEditItem({});
      alert("メニュー情報を更新しました");
    } catch (e) {
      console.error(e);
      alert("エラーが発生しました");
    }
  };

  const handleDeleteMenu = async (id: string) => {
      if(!confirm("本当に削除しますか？")) return;
      await deleteDoc(doc(db, "menu", id));
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-gray-100 p-4 pb-20">
      <header className="mb-6 flex justify-between items-center bg-white p-4 shadow rounded">
        <h1 className="text-xl font-bold text-gray-800">運営管理ダッシュボード</h1>
        <div className="flex gap-2">
            <button 
                onClick={() => setActiveTab('dashboard')} 
                className={`px-4 py-2 rounded font-bold ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            >
                オーダー監視
            </button>
            <button 
                onClick={() => setActiveTab('menu')} 
                className={`px-4 py-2 rounded font-bold ${activeTab === 'menu' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            >
                メニュー管理
            </button>
        </div>
      </header>

      {/* --- Tab: Dashboard (Module 2) --- */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          
          {/* Active Orders List */}
          <div className="space-y-4">
             {getSortedOrders().map(order => {
                 const { isDelayed, diffMinutes, overMinutes } = getDelayInfo(order);
                 const isPaying = order.status === 'paying';
                 
                 return (
                     <div 
                        key={order.id} 
                        className={`
                            relative p-4 rounded-xl shadow-md border-4 transition-all
                            ${isPaying ? 'bg-yellow-50 border-yellow-400 animate-pulse' : 'bg-white'}
                            ${isDelayed && !isPaying ? 'border-red-600 bg-red-50' : 'border-white'}
                            ${!isPaying && !isDelayed ? 'border-blue-100' : ''}
                        `}
                     >
                         <div className="flex justify-between items-start mb-2">
                             <div>
                                 <span className="text-3xl font-bold mr-2">#{order.ticketId}</span>
                                 <span className={`px-2 py-1 rounded text-sm font-bold ${isPaying ? 'bg-yellow-500 text-white' : 'bg-gray-200'}`}>
                                     {isPaying ? '支払い提示中' : '準備完了'}
                                 </span>
                                 <div className="text-xs text-gray-500 mt-1">
                                    経過: {diffMinutes}分 
                                    {isDelayed && <span className="text-red-600 font-bold ml-2">(+{overMinutes}分超過・期限切れ)</span>}
                                 </div>
                             </div>
                             <div className="text-right">
                                 <div className="text-2xl font-bold text-blue-900">¥{order.totalAmount.toLocaleString()}</div>
                                 <div className="text-xs text-gray-400">ID: {order.id.slice(0,6)}</div>
                             </div>
                         </div>

                         <div className="bg-gray-50 p-2 rounded mb-3 text-sm">
                             {order.items.map((item, i) => (
                                 <div key={i} className="flex justify-between border-b border-dashed last:border-0 py-1">
                                     <span>{item.name} × {item.quantity}</span>
                                     <span>¥{(item.price * item.quantity).toLocaleString()}</span>
                                 </div>
                             ))}
                         </div>

                         <div className="flex gap-2 justify-end">
                             {/* Action Buttons Logic */}
                             {isPaying ? (
                                 <button 
                                    onClick={() => completePayment(order.id)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg text-lg flex-1"
                                 >
                                     会計完了 (受渡)
                                 </button>
                             ) : (
                                 <>
                                    <button 
                                        onClick={() => processCancellation(order, 'cancelled')}
                                        className="bg-gray-400 text-white px-3 py-2 rounded hover:bg-gray-500 text-sm"
                                    >
                                        キャンセル
                                    </button>
                                    
                                    {isDelayed && (
                                        <button 
                                            onClick={() => processCancellation(order, 'force_cancelled')}
                                            className="bg-red-600 text-white px-4 py-2 rounded font-bold hover:bg-red-700 shadow-lg border-2 border-red-800"
                                        >
                                            強制キャンセル (在庫戻し)
                                        </button>
                                    )}

                                    {/* 現金即決などの手動完了用 */}
                                    <button 
                                        onClick={() => completePayment(order.id)}
                                        className="bg-green-600 text-white px-4 py-2 rounded font-bold hover:bg-green-700"
                                    >
                                        完了
                                    </button>
                                 </>
                             )}
                         </div>
                     </div>
                 );
             })}
             {getSortedOrders().length === 0 && <div className="text-center py-10 text-gray-500">現在のアクティブな注文はありません</div>}
          </div>

          <hr className="border-gray-300" />

          {/* History Section */}
          <div>
              <h3 className="font-bold text-gray-600 mb-2">完了・キャンセル履歴 (直近20件)</h3>
              <div className="bg-white rounded shadow overflow-hidden">
                  <table className="w-full text-sm text-left">
                      <thead className="bg-gray-100">
                          <tr>
                              <th className="p-2">Time</th>
                              <th className="p-2">No.</th>
                              <th className="p-2">Status</th>
                              <th className="p-2">Total</th>
                          </tr>
                      </thead>
                      <tbody>
                          {getCompletedOrders().map(order => (
                              <tr key={order.id} className="border-t">
                                  <td className="p-2 text-gray-600">
                                      {order.createdAt?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </td>
                                  <td className="p-2 font-mono font-bold">#{order.ticketId}</td>
                                  <td className="p-2">
                                      <span className={`
                                        px-2 py-0.5 rounded text-xs font-bold
                                        ${order.status === 'completed' ? 'bg-green-100 text-green-800' : ''}
                                        ${order.status === 'cancelled' ? 'bg-gray-200 text-gray-800' : ''}
                                        ${order.status === 'force_cancelled' ? 'bg-red-100 text-red-800' : ''}
                                      `}>
                                          {order.status === 'force_cancelled' ? '強制キャンセル' : order.status}
                                      </span>
                                  </td>
                                  <td className="p-2">¥{order.totalAmount.toLocaleString()}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
        </div>
      )}

      {/* --- Tab: Menu Management (Module 1) --- */}
      {activeTab === 'menu' && (
        <div className="bg-white p-6 rounded shadow-lg">
           <h2 className="font-bold text-lg mb-4">メニュー編集・在庫管理</h2>
           
           {/* Edit Form */}
           <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 rounded">
               <div className="col-span-2 sm:col-span-1">
                   <label className="text-xs text-gray-500">商品名</label>
                   <input 
                     placeholder="例: 焼きそば" 
                     className="border p-2 rounded w-full"
                     value={editItem.name || ""} 
                     onChange={e => setEditItem({...editItem, name: e.target.value})}
                   />
               </div>
               <div className="col-span-2 sm:col-span-1">
                   <label className="text-xs text-gray-500">単価 (¥)</label>
                   <input 
                     placeholder="500" 
                     type="number" 
                     className="border p-2 rounded w-full"
                     value={editItem.price || ""} 
                     onChange={e => setEditItem({...editItem, price: Number(e.target.value)})}
                   />
               </div>
               <div className="flex flex-col">
                   <label className="text-xs text-gray-500">現在在庫数 (Stock)</label>
                   <input 
                     placeholder="100" 
                     type="number" 
                     className="border p-2 rounded"
                     value={editItem.stock !== undefined ? editItem.stock : ""} 
                     onChange={e => setEditItem({...editItem, stock: Number(e.target.value)})}
                   />
               </div>
               <div className="flex flex-col">
                   <label className="text-xs text-gray-500">1人あたり購入制限 (Limit)</label>
                   <input 
                     placeholder="5" 
                     type="number" 
                     className="border p-2 rounded"
                     value={editItem.limit !== undefined ? editItem.limit : 5} 
                     onChange={e => setEditItem({...editItem, limit: Number(e.target.value)})}
                   />
               </div>
           </div>
           
           <button 
             onClick={handleUpdateMenu} 
             className="w-full bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700 mb-6 transition-colors"
           >
             {editItem.id ? "情報を更新する" : "新規メニューを追加"}
           </button>

           {/* Menu List */}
           <div className="space-y-2">
               {menuList.map(item => (
                   <div key={item.id} className="flex justify-between items-center border-b pb-2">
                       <div>
                           <div className="font-bold text-lg">{item.name}</div>
                           <div className="text-sm text-gray-600">
                               単価: ¥{item.price.toLocaleString()} | 
                               在庫: <span className={`font-bold ${item.stock < 5 ? 'text-red-600' : 'text-blue-600'}`}>{item.stock}</span> | 
                               制限: {item.limit}
                           </div>
                       </div>
                       <div className="flex gap-2">
                           <button 
                                onClick={() => setEditItem(item)} 
                                className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm text-blue-800"
                           >
                               編集
                           </button>
                           <button 
                                onClick={() => handleDeleteMenu(item.id)} 
                                className="bg-red-50 hover:bg-red-100 px-3 py-1 rounded text-sm text-red-600"
                           >
                               削除
                           </button>
                       </div>
                   </div>
               ))}
               {menuList.length === 0 && <p className="text-gray-500 text-center">メニューが登録されていません</p>}
           </div>
        </div>
      )}
    </div>
  );
}
