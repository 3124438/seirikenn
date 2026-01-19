// app/page.tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebase";
// ★ runTransaction を追加
import { collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, increment, getDoc, setDoc, serverTimestamp, Timestamp, runTransaction } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { QrReader } from 'react-qr-reader';

// 型定義
type Ticket = {
  uniqueKey: string;
  shopId: string;
  shopName: string;
  shopDepartment?: string;
  time: string;
  timestamp: number;
  status: "reserved" | "waiting" | "ready" | "used" | "done" | "ordered" | "completed"; // ★ ordered, completed 追加
  count: number;
  isQueue?: boolean;
  isOrder?: boolean; // ★ 注文かどうか
  ticketId?: string;
  peopleAhead?: number;
  // ★ 注文用フィールド
  totalPrice?: number;
  items?: { name: string; count: number; price: number }[];
};

export default function Home() {
  const [attractions, setAttractions] = useState<any[]>([]);
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [selectedShop, setSelectedShop] = useState<any | null>(null);
  const [userId, setUserId] = useState("");
  const [isBanned, setIsBanned] = useState(false);

  // 通知設定
  const [enableSound, setEnableSound] = useState(false);
  const [enableVibrate, setEnableVibrate] = useState(false);

  // QR/カメラ関連
  const [qrTicket, setQrTicket] = useState<Ticket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // 申し込み画面用の状態
  const [draftBooking, setDraftBooking] = useState<{ time: string; remaining: number; mode: "slot" | "queue"; maxPeople: number } | null>(null);
  const [peopleCount, setPeopleCount] = useState<number>(1);
  
  // ★ カート状態管理 { [menuId]: count }
  const [cart, setCart] = useState<{ [key: string]: number }>({});

  // ... (playBeep, handleTestSound は変更なしのため省略) ...
  const playBeep = () => { /* 省略 */ };
  const handleTestSound = () => { /* 省略 */ };

  // 1. 初期化とデータ監視
  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));
    
    let storedId = localStorage.getItem("bunkasai_user_id");
    if (!storedId) {
      storedId = Math.random().toString(36).substring(2, 8).toUpperCase();
      localStorage.setItem("bunkasai_user_id", storedId);
    }
    setUserId(storedId);

    const userDocRef = doc(db, "users", storedId);
    // ... (User生成ロジック省略) ...

    const unsubAttractions = onSnapshot(collection(db, "attractions"), (snapshot) => {
      const shopData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttractions(shopData);

      const newMyTickets: Ticket[] = [];
      
      shopData.forEach((shop: any) => {
        // ... (既存の予約・整理券抽出ロジック省略) ...
        if (shop.reservations) { /* ... */ }
        if (shop.queue) { /* ... */ }

        // ★ 注文データの抽出
        if (shop.orders) {
          shop.orders.forEach((ord: any) => {
            if (ord.userId === storedId) {
              newMyTickets.push({
                uniqueKey: `order_${shop.id}_${ord.orderId}`,
                shopId: shop.id,
                shopName: shop.name,
                shopDepartment: shop.department,
                time: "お食事・注文", // 表示用
                timestamp: ord.createdAt?.toMillis ? ord.createdAt.toMillis() : Date.now(),
                status: ord.status, // ordered | completed
                count: 0,
                isQueue: false,
                isOrder: true,      // 注文フラグ
                ticketId: ord.orderId,
                totalPrice: ord.total,
                items: ord.items
              });
            }
          });
        }
      });

      // ソート順調整（完了していない注文を上に）
      newMyTickets.sort((a, b) => {
        // Ready/Ordered を最優先
        const isActiveA = a.status === 'ready' || a.status === 'ordered';
        const isActiveB = b.status === 'ready' || b.status === 'ordered';
        if (isActiveA && !isActiveB) return -1;
        if (!isActiveA && isActiveB) return 1;
        return b.timestamp - a.timestamp;
      });

      setMyTickets(newMyTickets);
    });

    return () => { /* unsubUser(); */ unsubAttractions(); };
  }, []);

  // ★ 注文は "ordered" ステータスの場合のみアクティブとみなす
  const activeTickets = myTickets.filter(t => ["reserved", "waiting", "ready", "ordered"].includes(t.status));

  // ... (通知ループ処理省略) ...

  if (isBanned) return <div>ACCESS DENIED</div>;

  // --- ★ 注文カート操作ロジック ---
  const handleAddToCart = (menuItem: any, delta: number) => {
    setCart(prev => {
      const current = prev[menuItem.id] || 0;
      const newVal = current + delta;
      
      // 制限チェック
      if (newVal < 0) return prev;
      if (menuItem.limit && newVal > menuItem.limit) return prev; // 購入制限
      if (newVal > menuItem.stock) return prev; // 在庫（簡易チェック）

      const newCart = { ...prev, [menuItem.id]: newVal };
      if (newVal === 0) delete newCart[menuItem.id];
      return newCart;
    });
  };

  // --- ★ 注文確定ロジック (Transaction) ---
  const handleOrderSubmit = async () => {
    if (!selectedShop || Object.keys(cart).length === 0) return;
    if (!confirm(`合計 ${Object.keys(cart).reduce((sum, id) => {
        const item = selectedShop.menu.find((m:any) => m.id === id);
        return sum + (item?.price || 0) * cart[id];
    }, 0)}円 です。\n注文を確定しますか？`)) return;

    try {
      await runTransaction(db, async (transaction) => {
        const shopRef = doc(db, "attractions", selectedShop.id);
        const shopDoc = await transaction.get(shopRef);
        if (!shopDoc.exists()) throw "Shop not found";

        const shopData = shopDoc.data();
        const menu = shopData.menu || [];
        const newMenu = [...menu];
        const orderItems: any[] = [];
        let total = 0;

        // 在庫チェック & 減算
        for (const [itemId, count] of Object.entries(cart)) {
          const itemIndex = newMenu.findIndex((m: any) => m.id === itemId);
          if (itemIndex === -1) throw "メニューが見つかりません";
          
          if (newMenu[itemIndex].stock < count) {
            throw `「${newMenu[itemIndex].name}」の在庫が足りません`;
          }
          newMenu[itemIndex].stock -= count; // 在庫減らす
          total += newMenu[itemIndex].price * count;
          orderItems.push({ 
            id: itemId, 
            name: newMenu[itemIndex].name, 
            price: newMenu[itemIndex].price, 
            count 
          });
        }

        // Ticket ID 生成 (現在数+1)
        const currentOrders = shopData.orders || [];
        const nextNum = currentOrders.length + 1;
        const orderId = "ORD-" + String(nextNum).padStart(4, '0');

        const newOrder = {
          orderId,
          userId,
          items: orderItems,
          total,
          status: "ordered", // 支払い待ち
          createdAt: Timestamp.now()
        };

        // 更新実行
        transaction.update(shopRef, {
          menu: newMenu,
          orders: arrayUnion(newOrder)
        });
      });

      alert("注文しました！チケット画面からお支払いへ進んでください。");
      setCart({});
      setSelectedShop(null);
    } catch (e: any) {
      console.error(e);
      alert("エラー: " + (typeof e === "string" ? e : "注文に失敗しました"));
    }
  };

  // ... (handleSelectTime, handleJoinQueue, handleConfirmBooking, handleCancel は変更なし) ...
  const handleSelectTime = (shop: any, time: string) => { /* 省略 */ setPeopleCount(1); setDraftBooking({ time, remaining: 10, mode: "slot", maxPeople: 10 }); };
  const handleJoinQueue = (shop: any) => { /* 省略 */ setPeopleCount(1); setDraftBooking({ time: "順番待ち", remaining: 999, mode: "queue", maxPeople: 10 }); };
  const handleConfirmBooking = async () => { /* 省略 */ };
  const handleCancel = async (ticket: Ticket) => { /* 省略 */ };

  // --- 入場 / 支払い完了ロジック (共通処理) ---
  const processEntry = async (ticket: Ticket, inputPass: string) => {
    const shop = attractions.find(s => s.id === ticket.shopId);
    if (!shop) return;
    
    if (inputPass !== shop.password) {
        alert("パスワードが違います");
        return;
    }

    try {
      const shopRef = doc(db, "attractions", shop.id);
      
      // ★ 注文完了処理
      if (ticket.isOrder) {
        const targetOrder = shop.orders.find((o:any) => o.orderId === ticket.ticketId);
        if (targetOrder) {
            // ステータス更新: ordered -> completed
            await updateDoc(shopRef, { orders: arrayRemove(targetOrder) });
            await updateDoc(shopRef, { orders: arrayUnion({ ...targetOrder, status: "completed" }) });
            alert("購入完了しました！");
        }
      } 
      // 既存の予約・整理券処理
      else if (ticket.isQueue) {
        const targetQ = shop.queue.find((q: any) => q.ticketId === ticket.ticketId);
        if(targetQ) await updateDoc(shopRef, { queue: arrayRemove(targetQ) });
        alert(`「${shop.name}」に入場しました！`);
      } else {
        const oldRes = shop.reservations.find((r: any) => r.userId === userId && r.time === ticket.time && r.status === "reserved");
        if(oldRes) {
            await updateDoc(shopRef, { reservations: arrayRemove(oldRes) });
            await updateDoc(shopRef, { reservations: arrayUnion({ ...oldRes, status: "used" }) });
        }
        alert(`「${shop.name}」に入場しました！`);
      }
      
      setQrTicket(null);
    } catch(e) {
      console.error(e);
      alert("エラーが発生しました。");
    }
  };

  // ... (handleManualEnter, handleQrScan は変更なし) ...
  const handleManualEnter = (ticket: Ticket) => {
    const shop = attractions.find(s => s.id === ticket.shopId);
    if (!shop) return;
    // 注文の場合はいつでも支払い可能、整理券の場合は呼び出し後のみ
    if (!ticket.isOrder && ticket.isQueue && ticket.status !== 'ready') return alert("まだ呼び出しされていません。");

    const inputPass = prompt(ticket.isOrder ? "お支払いの確認\n店員から伝えられたパスワードを入力:" : `${shop.name}のスタッフパスワードを入力：`);
    if (inputPass === null) return;
    processEntry(ticket, inputPass);
  };
  const handleQrScan = (result: any) => { if (result && qrTicket) processEntry(qrTicket, result?.text || result); };

  return (
    <div className="max-w-md mx-auto p-4 bg-gray-50 min-h-screen pb-20 relative">
      {/* ... (Header省略) ... */}
      <header className="mb-6"><h1 className="text-xl font-bold">予約・注文アプリ</h1></header>

      {/* チケット一覧 */}
      {activeTickets.length > 0 && (
        <div className="mb-8 space-y-4">
          <p className="text-blue-900 text-sm font-bold">🎟️ あなたのチケット / 注文</p>
          {activeTickets.map((t) => {
            const isReady = t.status === 'ready';
            const isOrder = t.isOrder;
            // 注文チケットのデザイン調整
            const cardClass = isOrder 
                ? "bg-yellow-50 border-l-4 border-yellow-500 shadow-md"
                : (isReady ? "bg-red-50 border-l-4 border-red-500 shadow-xl animate-pulse-slow" : "bg-white border-l-4 border-green-500 shadow-lg");

            return (
              <div key={t.uniqueKey} className={`${cardClass} p-4 rounded relative`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                      <h2 className="font-bold text-lg">{t.shopName}</h2>
                      {/* ★ 注文内容表示 */}
                      {isOrder ? (
                          <div className="mt-2 text-sm text-gray-700">
                              <ul className="list-disc pl-4 mb-2">
                                  {t.items?.map((item, idx) => (
                                      <li key={idx}>{item.name} x {item.count}</li>
                                  ))}
                              </ul>
                              <p className="font-bold text-xl text-right border-t pt-1">合計 ¥{t.totalPrice}</p>
                          </div>
                      ) : (
                          // 既存表示
                          t.isQueue ? <p className="text-3xl font-mono">{t.ticketId}</p> : <p className="text-3xl font-bold">{t.time}</p>
                      )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    {/* 手動入力/支払いボタン */}
                    <button 
                        onClick={() => handleManualEnter(t)} 
                        disabled={!isOrder && t.isQueue && !isReady} 
                        className={`flex-1 font-bold py-3 rounded-lg shadow transition text-sm
                        ${(!isOrder && t.isQueue && !isReady) ? "bg-gray-300 text-gray-500" : (isOrder ? "bg-yellow-500 text-white" : "bg-blue-600 text-white")}`}
                    >
                        {isOrder ? "お支払いへ (パスワード)" : (t.isQueue && !isReady ? "待機中..." : "パスワード入力で入場")}
                    </button>
                    {/* 削除ボタン（注文済みはキャンセル不可にする等の制御が必要だが、ここでは簡易的に許可） */}
                    {!isOrder && <button onClick={() => handleCancel(t)} className="px-4 text-red-500 border border-red-200 rounded-lg text-xs">削除</button>}
                  </div>

                  {/* QRボタン */}
                  <button 
                    onClick={() => setQrTicket(t)}
                    disabled={!isOrder && t.isQueue && !isReady}
                    className="w-full font-bold py-3 rounded-lg border-2 border-black text-black bg-white flex items-center justify-center gap-2"
                  >
                      <span>📷</span> {isOrder ? "QRコードで支払い完了" : "QRコードで入場"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 店舗選択リスト (変更なし) */}
      {!selectedShop ? (
        <div className="space-y-3">
          {attractions.map((shop) => (
            <button key={shop.id} onClick={() => { setSelectedShop(shop); setCart({}); }} className="w-full bg-white p-3 rounded-xl shadow-sm border text-left">
               {/* ... (既存の店舗カード) ... */}
               <h3 className="font-bold">{shop.name}</h3>
               {shop.menu && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 rounded ml-2">オーダー可</span>}
            </button>
          ))}
        </div>
      ) : (
        // 詳細・予約・注文画面
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden pb-10">
            {/* ... (戻るボタンや画像表示 省略) ... */}
            <button onClick={() => { setSelectedShop(null); setDraftBooking(null); }} className="m-2 bg-gray-200 px-4 py-2 rounded-full">戻る</button>
            <div className="p-4">
                <h2 className="text-2xl font-bold mb-4">{selectedShop.name}</h2>

                {/* ★ メニュー表示エリア (menuがある場合のみ) */}
                {selectedShop.menu && (
                    <div className="mb-8">
                        <h3 className="font-bold text-lg border-b mb-3 pb-1">ご注文メニュー</h3>
                        <div className="space-y-3">
                            {selectedShop.menu.map((item: any) => (
                                <div key={item.id} className="flex justify-between items-center bg-gray-50 p-3 rounded border">
                                    <div>
                                        <p className="font-bold">{item.name}</p>
                                        <p className="text-sm text-gray-500">¥{item.price} <span className={item.stock < 5 ? "text-red-500" : "text-green-600"}>{item.stock > 0 ? `(残${item.stock})` : '(売切)'}</span></p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button 
                                            onClick={() => handleAddToCart(item, -1)}
                                            disabled={!cart[item.id]}
                                            className="w-8 h-8 bg-gray-200 rounded-full font-bold disabled:opacity-30"
                                        >-</button>
                                        <span className="font-bold w-4 text-center">{cart[item.id] || 0}</span>
                                        <button 
                                            onClick={() => handleAddToCart(item, 1)}
                                            disabled={item.stock <= (cart[item.id]||0) || (item.limit && (cart[item.id]||0) >= item.limit)}
                                            className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full font-bold disabled:opacity-30"
                                        >+</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* 注文ボタン */}
                        {Object.keys(cart).length > 0 && (
                            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-right font-bold text-lg mb-2">
                                    合計: ¥{Object.keys(cart).reduce((sum, id) => {
                                        const item = selectedShop.menu.find((m:any) => m.id === id);
                                        return sum + (item?.price || 0) * cart[id];
                                    }, 0)}
                                </p>
                                <button onClick={handleOrderSubmit} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg shadow hover:bg-blue-500">
                                    注文する
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* 既存の予約・整理券 UI (共存させる) */}
                {!selectedShop.menu && (
                   selectedShop.isQueueMode ? (
                      <button onClick={() => handleJoinQueue(selectedShop)} className="w-full bg-orange-500 text-white font-bold py-4 rounded-xl">整理券を発券</button>
                   ) : (
                      /* 時間枠選択 (既存コードのマップ処理) */
                      <div className="grid grid-cols-3 gap-3">
                         {Object.entries(selectedShop.slots || {}).map(([time, count]: any) => (
                             <button key={time} onClick={() => handleSelectTime(selectedShop, time)} className="p-2 border rounded">{time}</button>
                         ))}
                      </div>
                   )
                )}
            </div>
        </div>
      )}
      
      {/* 予約確認モーダル(変更なし) */}
      {draftBooking && selectedShop && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
             <div className="bg-white p-6 rounded-lg">
                 <h3 className="font-bold mb-4">予約確認</h3>
                 <button onClick={handleConfirmBooking} className="bg-blue-600 text-white px-4 py-2 rounded">確定</button>
                 <button onClick={() => setDraftBooking(null)} className="ml-2 px-4 py-2">キャンセル</button>
             </div>
         </div>
      )}

      {/* QRリーダーモーダル (変更なし) */}
      {qrTicket && (
          <div className="fixed inset-0 bg-black flex flex-col items-center justify-center">
             <QrReader onResult={handleQrScan} constraints={{ facingMode: 'environment' }} className="w-full max-w-sm" />
             <button onClick={() => setQrTicket(null)} className="mt-4 bg-gray-800 text-white px-6 py-3 rounded">閉じる</button>
          </div>
      )}
    </div>
  );
}
