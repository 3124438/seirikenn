// app/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase"; // 環境に合わせてインポートパスを調整してください
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  updateDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  Timestamp
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

// --- 2. 共通設定 (Constants) ---
const LIMIT_TIME_MINUTES = 30;

// --- 型定義 (仕様書 Section 3準拠) ---
type OrderStatus = 'ordered' | 'paying' | 'completed' | 'cancelled' | 'force_cancelled';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  stock: number;
  limit: number; // 1人あたりの購入制限
  description?: string;
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
  createdAt: Timestamp;
}

export default function OrderPage() {
  // --- State Management ---
  const [userId, setUserId] = useState<string>("");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<{ [key: string]: number }>({});
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  // --- 1. 初期化・認証・データ監視 ---
  useEffect(() => {
    // 1. 匿名認証 & ユーザーID確保
    signInAnonymously(auth).catch((e) => console.error("Auth Error:", e));
    
    let storedId = localStorage.getItem("order_system_user_id");
    if (!storedId) {
      storedId = Math.random().toString(36).substring(2, 10).toUpperCase();
      localStorage.setItem("order_system_user_id", storedId);
    }
    setUserId(storedId);

    // 2. タイマー（1秒ごとに現在時刻更新）
    const timerInterval = setInterval(() => setNow(Date.now()), 1000);

    // 3. メニュー監視 (Module 3: renderMenu)
    const unsubMenu = onSnapshot(collection(db, "menu"), (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as MenuItem[];
      // 表示順序フィールドがあればここでソート
      setMenuItems(items);
    });

    // 4. 自分のオーダー監視 (Module 4: monitorOrderStatus)
    // 最新の未完了または完了直後の注文を取得
    const q = query(
      collection(db, "orders"),
      where("userId", "==", storedId),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const unsubOrder = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const orderData = snapshot.docs[0].data();
        const order = { id: snapshot.docs[0].id, ...orderData } as Order;
        
        // キャンセル済み以外をアクティブとして扱う（履歴表示要件次第で調整）
        if (order.status !== 'cancelled') {
             setActiveOrder(order);
        } else {
             setActiveOrder(null);
        }
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

  // --- Logic: カート操作 ---
  const handleQuantityChange = (item: MenuItem, delta: number) => {
    setCart((prev) => {
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

  const getCartTotal = () => {
    return Object.entries(cart).reduce((total, [id, qty]) => {
      const item = menuItems.find((i) => i.id === id);
      return total + (item ? item.price * qty : 0);
    }, 0);
  };

  // --- Logic: Module 3 submitOrder (Transaction) ---
  const submitOrder = async () => {
    if (!userId) return;
    if (Object.keys(cart).length === 0) return;
    if (!confirm("注文を確定し、在庫を確保しますか？")) return;

    try {
      await runTransaction(db, async (transaction) => {
        const orderItems: CartItem[] = [];
        let totalPrice = 0;

        // 在庫チェックとデータ構築
        for (const [itemId, quantity] of Object.entries(cart)) {
          const itemRef = doc(db, "menu", itemId);
          const itemDoc = await transaction.get(itemRef);

          if (!itemDoc.exists()) {
            throw new Error(`商品ID: ${itemId} が存在しません。`);
          }

          const itemData = itemDoc.data() as MenuItem;

          // 在庫不足チェック
          if (itemData.stock < quantity) {
            throw new Error(`申し訳ありません。「${itemData.name}」がタッチの差で売り切れました。`);
          }

          // 在庫減算
          transaction.update(itemRef, {
            stock: itemData.stock - quantity
          });

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
        const ticketId = Math.random().toString().substring(2, 6); // 簡易チケット番号

        transaction.set(newOrderRef, {
          userId,
          ticketId,
          items: orderItems,
          totalPrice,
          status: "ordered",
          createdAt: serverTimestamp()
        });
      });

      // 成功時
      setCart({});
      alert("在庫を確保しました！\n30分以内に受取場所へお越しください。");

    } catch (e: any) {
      console.error(e);
      alert(e.message || "注文処理中にエラーが発生しました。");
    }
  };

  // --- Logic: Module 4 enterPaymentMode ---
  const enterPaymentMode = async () => {
    if (!activeOrder) return;
    if (!confirm("スタッフの目の前にいますか？\n支払い画面を表示します。")) return;

    try {
      const orderRef = doc(db, "orders", activeOrder.id);
      await updateDoc(orderRef, {
        status: "paying"
      });
    } catch (e) {
      console.error(e);
      alert("通信エラーが発生しました。");
    }
  };

  // --- Logic: タイマー計算 ---
  const getTimerInfo = (createdAt: Timestamp) => {
    if (!createdAt) return { text: "--:--", isExpired: false };
    
    const createdMillis = createdAt.toMillis();
    const elapsedMillis = now - createdMillis;
    const limitMillis = LIMIT_TIME_MINUTES * 60 * 1000;
    const remainingMillis = limitMillis - elapsedMillis;

    if (remainingMillis <= 0) {
      return { text: "00:00", isExpired: true };
    }

    const m = Math.floor(remainingMillis / 60000);
    const s = Math.floor((remainingMillis % 60000) / 1000);
    return {
      text: `${m}:${s.toString().padStart(2, "0")}`,
      isExpired: false
    };
  };

  // --- UI Render ---
  
  // 1. 完了画面
  if (activeOrder?.status === "completed") {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-sm">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-green-800 mb-2">受取完了</h2>
          <p className="text-gray-600 mb-6">ご利用ありがとうございました！</p>
          <button 
            onClick={() => setActiveOrder(null)}
            className="w-full py-3 bg-gray-200 rounded-lg font-bold text-gray-700"
          >
            メニューに戻る
          </button>
        </div>
      </div>
    );
  }

  // 2. 強制キャンセル画面
  if (activeOrder?.status === "force_cancelled") {
    return (
      <div className="min-h-screen bg-red-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-sm border-2 border-red-100">
          <div className="text-6xl mb-4">😢</div>
          <h2 className="text-2xl font-bold text-red-800 mb-2">期限切れキャンセル</h2>
          <p className="text-gray-600 mb-6 text-sm">
            受取期限（{LIMIT_TIME_MINUTES}分）を超過したため、<br/>
            自動的にキャンセルされました。<br/>
            再度ご注文をお願いいたします。
          </p>
          <button 
            onClick={() => setActiveOrder(null)}
            className="w-full py-3 bg-red-600 text-white rounded-lg font-bold"
          >
            メニューに戻る
          </button>
        </div>
      </div>
    );
  }

  // 3. 支払い提示画面 (Paying)
  if (activeOrder?.status === "paying") {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 relative">
        <div className="flex-1 flex flex-col items-center justify-center animate-pulse">
          <p className="text-xl font-bold text-yellow-400 mb-8 text-center">
            この画面をスタッフに<br/>提示してください
          </p>
          
          <div className="w-full max-w-sm bg-white text-gray-900 p-8 rounded-3xl text-center shadow-2xl">
            <p className="text-sm text-gray-500 mb-2">お支払い金額</p>
            <p className="text-5xl font-black mb-6">¥{activeOrder.totalPrice.toLocaleString()}</p>
            
            <div className="border-t border-dashed border-gray-300 pt-6">
              <p className="text-sm text-gray-500 mb-1">チケット番号</p>
              <p className="text-4xl font-mono font-bold tracking-widest">{activeOrder.ticketId}</p>
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-gray-400 pb-8">
          スタッフ確認後、自動で完了画面に切り替わります
        </p>
      </div>
    );
  }

  // 4. チケット画面 (Ordered)
  if (activeOrder?.status === "ordered") {
    const { text, isExpired } = getTimerInfo(activeOrder.createdAt);

    return (
      <div className="min-h-screen bg-gray-100 p-4 max-w-md mx-auto">
        <header className="mb-6 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">チケット</h1>
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">在庫確保済</span>
        </header>

        {/* チケットカード */}
        <div className={`bg-white rounded-xl shadow-lg overflow-hidden border-t-8 ${isExpired ? 'border-red-500' : 'border-blue-500'} mb-6`}>
          <div className="p-6 text-center bg-gray-50 border-b">
            <p className="text-sm text-gray-500 mb-1">呼び出し番号</p>
            <p className="text-4xl font-mono font-bold text-gray-800">{activeOrder.ticketId}</p>
          </div>
          
          <div className="p-6">
             {/* タイマー */}
            <div className={`text-center mb-6 p-4 rounded-lg ${isExpired ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
              <p className="text-xs font-bold mb-1">受取期限まで</p>
              <p className="text-3xl font-mono font-bold">{text}</p>
              {isExpired && (
                <p className="text-xs mt-2 font-bold animate-pulse">
                  ⚠️ 期限を過ぎています。<br/>スタッフに状況をお伝えください。
                </p>
              )}
            </div>

            {/* 注文詳細 */}
            <div className="space-y-2 mb-6 text-sm">
              {activeOrder.items.map((item, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{item.name} ×{item.quantity}</span>
                  <span className="font-bold">¥{(item.price * item.quantity).toLocaleString()}</span>
                </div>
              ))}
              <div className="border-t pt-2 mt-2 flex justify-between text-base font-bold">
                <span>合計</span>
                <span>¥{activeOrder.totalPrice.toLocaleString()}</span>
              </div>
            </div>

            {/* アクションボタン */}
            {!isExpired ? (
              <button
                onClick={enterPaymentMode}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-md transition transform active:scale-95"
              >
                お支払いへ進む
                <span className="block text-xs font-normal opacity-80">（スタッフに見せる）</span>
              </button>
            ) : (
              <div className="text-center text-xs text-gray-400">
                期限切れのため、支払いへ進めません。<br/>スタッフにお声がけください。
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 5. メニュー画面 (Default)
  return (
    <div className="min-h-screen bg-white pb-24 max-w-md mx-auto relative">
      <header className="p-4 bg-white shadow-sm sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-800">メニュー</h1>
        <p className="text-xs text-gray-500">ID: {userId}</p>
      </header>

      <div className="p-4 space-y-4">
        {menuItems.map((item) => {
          const currentQty = cart[item.id] || 0;
          const isSoldOut = item.stock <= 0;
          const isLimitReached = currentQty >= item.limit;

          return (
            <div key={item.id} className={`flex justify-between items-center p-4 border rounded-lg shadow-sm ${isSoldOut ? 'bg-gray-50 opacity-60' : 'bg-white'}`}>
              <div className="flex-1 pr-2">
                <h3 className="font-bold text-lg">{item.name}</h3>
                <p className="text-gray-600 font-mono">¥{item.price.toLocaleString()}</p>
                
                {isSoldOut ? (
                  <span className="text-red-500 font-bold text-xs bg-red-50 px-2 py-1 rounded mt-1 inline-block">SOLD OUT</span>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">
                    残り: {item.stock} / 制限: {item.limit}
                  </p>
                )}
              </div>

              {!isSoldOut && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleQuantityChange(item, -1)}
                    disabled={currentQty === 0}
                    className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center font-bold disabled:opacity-30"
                  >
                    -
                  </button>
                  <span className="w-4 text-center font-bold text-lg">{currentQty}</span>
                  <button
                    onClick={() => handleQuantityChange(item, 1)}
                    disabled={isLimitReached || currentQty >= item.stock}
                    className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold disabled:bg-gray-300"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* カートフッター */}
      {getCartTotal() > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-lg z-20 max-w-md mx-auto">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-bold text-gray-500">
              {Object.values(cart).reduce((a, b) => a + b, 0)}点の商品
            </span>
            <span className="text-2xl font-bold text-gray-900">
              ¥{getCartTotal().toLocaleString()}
            </span>
          </div>
          <button
            onClick={submitOrder}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition"
          >
            注文を確定する
          </button>
        </div>
      )}
    </div>
  );
}
