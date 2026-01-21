// app/page.tsx
"use client";
import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase"; // 既存のパスを維持
import { 
  collection, 
  onSnapshot, 
  doc, 
  runTransaction, 
  updateDoc, 
  serverTimestamp, 
  query, 
  where, 
  orderBy, 
  limit 
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

// --- 2. 共通設定 (Constants) ---
const LIMIT_TIME_MINUTES = 30;

// --- 型定義 ---
type OrderStatus = 'ordered' | 'paying' | 'completed' | 'cancelled' | 'force_cancelled';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  stock: number;
  limit: number; // 1人あたりの購入制限
  imageUrl?: string;
  soldOut?: boolean;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  ticketId: string;
  userId: string;
  items: CartItem[];
  totalPrice: number;
  status: OrderStatus;
  createdAt: any; // Firestore Timestamp
}

export default function Home() {
  const [userId, setUserId] = useState("");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<{ [key: string]: number }>({});
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  // --- 1. 初期化・認証・データ監視 ---
  useEffect(() => {
    // 匿名認証
    signInAnonymously(auth).catch((e) => console.error(e));
    
    // ユーザーID管理
    let storedId = localStorage.getItem("bunkasai_user_id");
    if (!storedId) {
      storedId = Math.random().toString(36).substring(2, 8).toUpperCase();
      localStorage.setItem("bunkasai_user_id", storedId);
    }
    setUserId(storedId);

    // タイマー更新 (1秒ごと)
    const timerInterval = setInterval(() => setNow(Date.now()), 1000);

    // Module 3: メニュー監視 (Realtime Menu)
    const unsubMenu = onSnapshot(collection(db, "menu"), (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem));
      setMenuItems(items);
    });

    // Module 4: 自分の注文監視 (Active Order)
    // 完了・キャンセル以外のステータス（ordered, paying）を監視
    const q = query(
      collection(db, "orders"),
      where("userId", "==", storedId),
      where("status", "in", ["ordered", "paying"]),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const unsubOrder = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const orderData = snapshot.docs[0].data();
        setActiveOrder({ id: snapshot.docs[0].id, ...orderData } as Order);
      } else {
        setActiveOrder(null);
      }
    });

    return () => {
      clearInterval(timerInterval);
      unsubMenu();
      unsubOrder();
    };
  }, []);

  // --- Module 3: カート操作 ---
  const handleQuantityChange = (item: MenuItem, delta: number) => {
    setCart(prev => {
      const currentQty = prev[item.id] || 0;
      const maxQty = Math.min(item.limit, item.stock); // 制限と在庫の小さい方
      const newQty = Math.max(0, Math.min(currentQty + delta, maxQty));
      
      if (newQty === 0) {
        const { [item.id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [item.id]: newQty };
    });
  };

  // --- Module 3: 注文確定 (Transaction) ---
  const submitOrder = async () => {
    if (Object.keys(cart).length === 0) return;
    if (!confirm("注文を確定しますか？")) return;

    try {
      await runTransaction(db, async (transaction) => {
        const orderItems: CartItem[] = [];
        let totalPrice = 0;

        // 在庫チェックとデータ構築
        for (const [itemId, quantity] of Object.entries(cart)) {
          const itemRef = doc(db, "menu", itemId);
          const itemDoc = await transaction.get(itemRef);
          
          if (!itemDoc.exists()) throw "商品が存在しません";
          
          const itemData = itemDoc.data() as MenuItem;
          if (itemData.stock < quantity) {
            throw `タッチの差で「${itemData.name}」が売り切れました`;
          }

          // 在庫減算
          transaction.update(itemRef, { stock: itemData.stock - quantity });

          orderItems.push({
            id: itemId,
            name: itemData.name,
            price: itemData.price,
            quantity: quantity
          });
          totalPrice += itemData.price * quantity;
        }

        // 注文作成
        const newOrderRef = doc(collection(db, "orders"));
        const ticketId = Math.random().toString().substring(2, 6); // 簡易チケットID生成

        transaction.set(newOrderRef, {
          userId,
          ticketId,
          items: orderItems,
          totalPrice,
          status: "ordered",
          createdAt: serverTimestamp()
        });
      });

      setCart({}); // カートクリア
      alert("注文が確定しました！チケット画面へ移動します。");

    } catch (e: any) {
      console.error(e);
      alert(typeof e === "string" ? e : "注文エラーが発生しました");
    }
  };

  // --- Module 4: 支払いモードへ遷移 ---
  const enterPaymentMode = async () => {
    if (!activeOrder) return;
    if (!confirm("スタッフの前にいますか？\n支払い画面を表示します。")) return;

    try {
      const orderRef = doc(db, "orders", activeOrder.id);
      await updateDoc(orderRef, { status: "paying" });
    } catch (e) {
      console.error(e);
      alert("エラーが発生しました");
    }
  };

  // --- 表示ロジック ---
  
  // 合計金額計算
  const currentCartTotal = Object.entries(cart).reduce((total, [id, qty]) => {
    const item = menuItems.find(i => i.id === id);
    return total + (item ? item.price * qty : 0);
  }, 0);

  // タイマー計算
  const getTimerDisplay = (createdAt: any) => {
    if (!createdAt) return { text: "--:--", isExpired: false };
    const createdMillis = createdAt.toMillis ? createdAt.toMillis() : Date.now();
    const elapsedMillis = now - createdMillis;
    const remainingMillis = (LIMIT_TIME_MINUTES * 60 * 1000) - elapsedMillis;

    if (remainingMillis <= 0) {
      return { text: "00:00", isExpired: true };
    }

    const m = Math.floor(remainingMillis / 60000);
    const s = Math.floor((remainingMillis % 60000) / 1000);
    return { 
      text: `${m}:${s.toString().padStart(2, '0')}`, 
      isExpired: false 
    };
  };

  // --- UI レンダリング ---
  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 pb-24 font-sans text-gray-800">
      
      {/* Header */}
      <header className="bg-white p-4 shadow-sm sticky top-0 z-10 flex justify-between items-center">
        <h1 className="text-xl font-bold text-blue-600">Fes Order</h1>
        <div className="text-xs text-gray-400 font-mono">ID: {userId}</div>
      </header>

      <main className="p-4">
        {/* === SCENE 1: 支払い画面 (Paying) === */}
        {activeOrder?.status === 'paying' && (
          <div className="flex flex-col items-center justify-center h-[70vh] animate-pulse">
            <div className="text-center space-y-6">
              <p className="text-2xl font-bold text-red-600">スタッフに提示してください</p>
              
              <div className="bg-white p-8 rounded-xl shadow-xl border-4 border-yellow-400 w-full">
                <p className="text-gray-500 text-sm mb-2">お支払い金額</p>
                <div className="text-5xl font-black text-gray-900 mb-6">
                  ¥{activeOrder.totalPrice.toLocaleString()}
                </div>
                
                <div className="border-t pt-4">
                  <p className="text-gray-500 text-sm">チケット番号</p>
                  <p className="text-4xl font-mono font-bold text-blue-900 tracking-widest">
                    {activeOrder.ticketId}
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-500">
                スタッフが確認後、画面が自動で切り替わります。
                <br />（ご自身での操作は不要です）
              </p>
            </div>
          </div>
        )}

        {/* === SCENE 2: チケット・待機画面 (Ordered) === */}
        {activeOrder?.status === 'ordered' && (() => {
          const { text, isExpired } = getTimerDisplay(activeOrder.createdAt);
          
          return (
            <div className="space-y-6">
              <div className={`p-6 rounded-xl shadow-lg text-white transition-colors ${isExpired ? 'bg-red-600' : 'bg-blue-600'}`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-xs opacity-80">Ticket ID</p>
                    <p className="text-3xl font-mono font-bold">{activeOrder.ticketId}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs opacity-80">受取期限まで</p>
                    <p className="text-3xl font-bold font-mono">{text}</p>
                  </div>
                </div>

                {isExpired ? (
                  <div className="bg-red-800 bg-opacity-50 p-3 rounded text-sm font-bold text-center">
                    ⚠️ 期限を過ぎています。<br/>在庫が確保されていない可能性があります。<br/>スタッフにご確認ください。
                  </div>
                ) : (
                  <div className="bg-blue-800 bg-opacity-50 p-3 rounded text-sm text-center">
                    商品が確保されました。<br/>30分以内に受取場所へお越しください。
                  </div>
                )}
              </div>

              <div className="bg-white p-4 rounded-lg shadow-sm">
                <h3 className="font-bold border-b pb-2 mb-2">注文内容</h3>
                {activeOrder.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1">
                    <span>{item.name} ×{item.quantity}</span>
                    <span>¥{(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t mt-2 pt-2 flex justify-between font-bold text-lg">
                  <span>合計</span>
                  <span>¥{activeOrder.totalPrice.toLocaleString()}</span>
                </div>
              </div>

              <button
                onClick={enterPaymentMode}
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-4 rounded-xl shadow-lg text-xl transform transition active:scale-95"
              >
                お支払いへ進む (スタッフ提示)
              </button>
              
              <p className="text-xs text-center text-gray-400">
                ※誤って押さないようご注意ください
              </p>
            </div>
          );
        })()}

        {/* === SCENE 3: メニュー画面 (No Active Order) === */}
        {!activeOrder && (
          <>
            <div className="space-y-4 mb-24">
              <h2 className="text-lg font-bold text-gray-700">メニュー</h2>
              {menuItems.map((item) => {
                const currentQty = cart[item.id] || 0;
                const isSoldOut = item.stock <= 0;
                
                return (
                  <div key={item.id} className={`bg-white p-4 rounded-lg shadow-sm flex justify-between items-center ${isSoldOut ? 'opacity-60 grayscale' : ''}`}>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg">{item.name}</h3>
                      <p className="text-gray-500">¥{item.price.toLocaleString()}</p>
                      {isSoldOut && <span className="text-red-500 font-bold text-xs">SOLD OUT</span>}
                      {!isSoldOut && (
                         <span className="text-xs text-gray-400">在庫: {item.stock} / 制限: {item.limit}</span>
                      )}
                    </div>

                    {!isSoldOut && (
                      <div className="flex items-center bg-gray-100 rounded-lg p-1">
                        <button 
                          onClick={() => handleQuantityChange(item, -1)}
                          className="w-8 h-8 flex items-center justify-center bg-white rounded shadow text-gray-600 font-bold disabled:opacity-30"
                          disabled={currentQty === 0}
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-bold">{currentQty}</span>
                        <button 
                          onClick={() => handleQuantityChange(item, 1)}
                          className="w-8 h-8 flex items-center justify-center bg-blue-500 text-white rounded shadow font-bold disabled:opacity-30"
                          disabled={currentQty >= item.limit || currentQty >= item.stock}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* カートバー */}
            {currentCartTotal > 0 && (
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-lg z-20 max-w-md mx-auto">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-gray-600">{Object.values(cart).reduce((a,b)=>a+b,0)}点の商品</span>
                  <span className="text-xl font-bold">¥{currentCartTotal.toLocaleString()}</span>
                </div>
                <button
                  onClick={submitOrder}
                  className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg shadow hover:bg-blue-700 transition"
                >
                  注文を確定する
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
