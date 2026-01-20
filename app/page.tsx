// app/admin/page.tsx
"use client";
import { useState, useEffect } from "react";
import { db } from "../firebase";
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  orderBy, 
  query 
} from "firebase/firestore";

// --- 型定義 (Admin用) ---
// User側と共通ですが、Admin専用のフィールド操作があるため再定義
type MenuItem = {
  id: string;
  name: string;
  price: number;
  stock: number;
  limit: number;
};

type Order = {
  id: string;
  ticketId: string;
  items: { name: string; count: number }[];
  totalPrice: number;
  status: "ordered" | "paying" | "completed";
  createdAt: any;
};

export default function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  
  // メニュー登録フォーム用
  const [newItem, setNewItem] = useState({ name: "", price: 0, stock: 0, limit: 2 });

  // 1. リアルタイム監視 (Module 2)
  useEffect(() => {
    // 注文監視
    const qOrders = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      
      // Module 2: sortAndRenderOrders (お支払い強調機能)
      // payingを最優先、次にcreatedAt順など
      const sorted = fetchedOrders.sort((a, b) => {
        if (a.status === 'paying' && b.status !== 'paying') return -1;
        if (a.status !== 'paying' && b.status === 'paying') return 1;
        // paying同士、またはそれ以外は新しい順(desc)のまま
        return 0;
      });
      setOrders(sorted);
    });

    // メニュー監視
    const unsubMenu = onSnapshot(collection(db, "menu"), (snapshot) => {
      setMenu(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem)));
    });

    return () => {
      unsubOrders();
      unsubMenu();
    };
  }, []);

  // --- Module 1: メニュー管理関数 ---
  const addMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name) return;
    try {
      await addDoc(collection(db, "menu"), newItem);
      setNewItem({ name: "", price: 0, stock: 0, limit: 2 }); // Reset
      alert("メニューを追加しました");
    } catch (err) {
      console.error(err);
    }
  };

  const deleteMenuItem = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    await deleteDoc(doc(db, "menu", id));
  };

  // --- Module 2: 在庫緊急修正 ---
  const manualUpdateStock = async (id: string, currentStock: number) => {
    const newStockStr = prompt("新しい在庫数を入力してください", String(currentStock));
    if (newStockStr === null) return;
    const newStock = parseInt(newStockStr);
    if (isNaN(newStock)) return;

    await updateDoc(doc(db, "menu", id), { stock: newStock });
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col gap-6">
      <header className="flex justify-between items-center bg-white p-4 rounded shadow">
        <h1 className="text-2xl font-bold text-gray-800">Admin 管理画面</h1>
        <div className="text-sm text-gray-500">
          モード: <span className="font-bold text-blue-600">オーダー制</span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 左カラム: 注文管理 (運営画面) */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-gray-700">注文リスト ({orders.filter(o => o.status !== 'completed').length})</h2>
          <div className="space-y-3">
            {orders.map(order => {
              // Module 2: お支払い強調機能 (スタイル定義)
              const isPaying = order.status === 'paying';
              const cardClass = isPaying 
                ? "bg-red-600 text-white transform scale-105 shadow-2xl border-4 border-yellow-400 z-10" // 強調スタイル
                : order.status === 'completed' ? "bg-gray-200 text-gray-400 opacity-60" : "bg-white text-gray-800";

              return (
                <div key={order.id} className={`p-4 rounded-lg shadow transition-all ${cardClass}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-mono opacity-80">{order.id.slice(0, 6)}...</span>
                      <div className="text-2xl font-bold font-mono tracking-wider">No. {order.ticketId}</div>
                    </div>
                    <div className={`px-2 py-1 rounded text-xs font-bold ${isPaying ? "bg-white text-red-600" : "bg-gray-100 text-gray-600"}`}>
                      {order.status === 'ordered' && "調理待ち"}
                      {order.status === 'paying' && "★支払い待ち★"}
                      {order.status === 'completed' && "完了"}
                    </div>
                  </div>
                  
                  <div className="mt-2 border-t border-white/20 pt-2">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm font-bold">
                        <span>{item.name} ×{item.count}</span>
                      </div>
                    ))}
                    <div className="text-right text-xl font-bold mt-2">
                      ¥{order.totalPrice}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 右カラム: メニュー & 設定 */}
        <section className="space-y-6">
          
          {/* メニュー登録 */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-lg font-bold mb-4">新規メニュー登録</h2>
            <form onSubmit={addMenuItem} className="flex flex-col gap-3">
              <input 
                placeholder="品名" 
                value={newItem.name} 
                onChange={e => setNewItem({...newItem, name: e.target.value})}
                className="border p-2 rounded" required
              />
              <div className="flex gap-2">
                <input 
                  type="number" placeholder="価格" 
                  value={newItem.price || ""} 
                  onChange={e => setNewItem({...newItem, price: Number(e.target.value)})}
                  className="border p-2 rounded flex-1" required
                />
                <input 
                  type="number" placeholder="在庫" 
                  value={newItem.stock || ""} 
                  onChange={e => setNewItem({...newItem, stock: Number(e.target.value)})}
                  className="border p-2 rounded flex-1" required
                />
                <input 
                  type="number" placeholder="制限数" 
                  value={newItem.limit || ""} 
                  onChange={e => setNewItem({...newItem, limit: Number(e.target.value)})}
                  className="border p-2 rounded w-20" required
                />
              </div>
              <button className="bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700">登録</button>
            </form>
          </div>

          {/* 在庫管理リスト */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-lg font-bold mb-4">在庫管理 (タップして修正)</h2>
            <div className="space-y-2">
              {menu.map(item => (
                <div key={item.id} className="flex justify-between items-center p-2 border-b">
                  <div>
                    <div className="font-bold">{item.name}</div>
                    <div className="text-xs text-gray-500">¥{item.price} / 限{item.limit}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => manualUpdateStock(item.id, item.stock)}
                      className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded text-lg font-bold min-w-[80px]"
                    >
                      {item.stock}
                    </button>
                    <button 
                      onClick={() => deleteMenuItem(item.id)}
                      className="text-red-500 hover:bg-red-50 px-2 py-2 rounded"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </section>
      </div>
    </div>
  );
}
