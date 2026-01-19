"use client";
import { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebase";
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
  status: "reserved" | "waiting" | "ready" | "used" | "done" | "ordered" | "completed"; // ordered, completedを追加
  count: number;
  isQueue?: boolean;
  isOrder?: boolean; // オーダー制フラグ
  ticketId?: string;
  peopleAhead?: number;
  items?: { name: string; count: number }[]; // 注文内容
  totalPrice?: number; // 合計金額
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
  const [qrTicket, setQrTicket] = useState<Ticket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // 申し込み・注文用の状態
  const [draftBooking, setDraftBooking] = useState<{ time: string; remaining: number; mode: "slot" | "queue"; maxPeople: number } | null>(null);
  const [peopleCount, setPeopleCount] = useState<number>(1);
  // ★カート機能（メニュー名: 個数）
  const [cart, setCart] = useState<{ [key: string]: number }>({});

  // 音を鳴らす関数（省略なし）
  const playBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContextClass();
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      const ctx = audioCtxRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = 'sine'; 
      oscillator.frequency.setValueAtTime(880, ctx.currentTime); 
      oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5); 
      gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.5);
    } catch (e) { console.error(e); }
  };

  const handleTestSound = () => {
     playBeep();
     if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(200);
     alert("テスト音再生中");
  };

  // 1. 初期化とデータ監視
  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));
    
    let storedId = localStorage.getItem("bunkasai_user_id");
    if (!storedId) {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let result = "";
      // ★修正: 8桁に変更
      for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
      storedId = result;
      localStorage.setItem("bunkasai_user_id", storedId);
    }
    setUserId(storedId);

    const userDocRef = doc(db, "users", storedId);
    getDoc(userDocRef).then((snap) => {
        if (!snap.exists()) {
            setDoc(userDocRef, { userId: storedId, createdAt: serverTimestamp(), isBanned: false });
        }
    });
    const unsubUser = onSnapshot(userDocRef, (snap) => {
        if (snap.exists()) setIsBanned(snap.data().isBanned === true);
    });

    const unsubAttractions = onSnapshot(collection(db, "attractions"), (snapshot) => {
      const shopData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttractions(shopData);

      const newMyTickets: Ticket[] = [];
      
      shopData.forEach((shop: any) => {
        // 時間予約
        if (shop.reservations) {
          shop.reservations.forEach((r: any) => {
            if (r.userId === storedId) {
              newMyTickets.push({
                uniqueKey: `slot_${shop.id}_${r.time}`,
                shopId: shop.id, shopName: shop.name, shopDepartment: shop.department,
                time: r.time, timestamp: r.timestamp, status: r.status, count: r.count || 1, isQueue: false
              });
            }
          });
        }
        // 順番待ち
        if (shop.queue) {
          shop.queue.forEach((q: any) => {
            if (q.userId === storedId) {
              let groupsAhead = 0;
              if (q.status === 'waiting') {
                const myNum = parseInt(q.ticketId || "999999");
                groupsAhead = shop.queue.filter((other: any) => 
                  other.status === 'waiting' && parseInt(other.ticketId || "999999") < myNum
                ).length;
              }
              newMyTickets.push({
                uniqueKey: `queue_${shop.id}_${q.ticketId}`,
                shopId: shop.id, shopName: shop.name, shopDepartment: shop.department,
                time: "順番待ち", timestamp: q.createdAt?.toMillis() || Date.now(),
                status: q.status, count: q.count || 1, isQueue: true, ticketId: q.ticketId, peopleAhead: groupsAhead
              });
            }
          });
        }
        // ★オーダー（モバイルオーダー）の読み込み追加
        if (shop.mode === "order" && shop.orders) {
          shop.orders.forEach((o: any) => {
            if (o.userId === storedId) {
               newMyTickets.push({
                 uniqueKey: `order_${shop.id}_${o.ticketId}`,
                 shopId: shop.id, shopName: shop.name, shopDepartment: shop.department,
                 time: "モバイルオーダー", timestamp: o.createdAt?.toMillis() || Date.now(),
                 status: o.status, // ordered or completed
                 count: 1, 
                 isOrder: true,
                 ticketId: o.ticketId,
                 items: o.items,
                 totalPrice: o.totalPrice
               });
            }
          });
        }
      });

      newMyTickets.sort((a, b) => b.timestamp - a.timestamp);
      setMyTickets(newMyTickets);
    });

    return () => { unsubUser(); unsubAttractions(); };
  }, []);

  const activeTickets = myTickets.filter(t => ["reserved", "waiting", "ready", "ordered"].includes(t.status));

  // 通知ループ
  useEffect(() => {
    const intervalId = setInterval(() => {
      const hasReadyTicket = activeTickets.some(t => t.status === 'ready');
      if (hasReadyTicket) {
        if (enableSound) playBeep();
        if (enableVibrate && typeof navigator !== "undefined" && navigator.vibrate) try { navigator.vibrate(200); } catch(e) {}
      }
    }, 1000); 
    return () => clearInterval(intervalId);
  }, [activeTickets, enableSound, enableVibrate]);

  if (isBanned) return <div className="min-h-screen bg-red-900 text-white p-4 text-center pt-20">ACCESS DENIED</div>;

  // --- カート操作 ---
  const updateCart = (itemName: string, delta: number, limit: number, stock: number) => {
    setCart(prev => {
      const current = prev[itemName] || 0;
      const newVal = current + delta;
      if (newVal < 0) return prev;
      if (newVal > limit) return prev; // 購入制限
      if (newVal > stock) return prev; // 画面上の在庫チェック
      const newCart = { ...prev, [itemName]: newVal };
      if (newVal === 0) delete newCart[itemName];
      return newCart;
    });
  };

  // --- 注文実行（トランザクション） ---
  const handlePlaceOrder = async () => {
    if (!selectedShop) return;
    const items = Object.entries(cart).map(([name, count]) => ({ name, count }));
    if (items.length === 0) return alert("商品を選んでください");

    if (!confirm("注文を確定しますか？")) return;

    try {
      await runTransaction(db, async (transaction) => {
        const shopRef = doc(db, "attractions", selectedShop.id);
        const sfDoc = await transaction.get(shopRef);
        if (!sfDoc.exists()) throw "Shop does not exist";

        const data = sfDoc.data();
        const currentMenu = data.menu || [];
        
        // 1. 在庫チェック & 減算計算
        const newMenu = currentMenu.map((menuItem: any) => {
          const orderItem = items.find(i => i.name === menuItem.name);
          if (orderItem) {
             if (menuItem.stock < orderItem.count) throw `「${menuItem.name}」の在庫が足りません`;
             return { ...menuItem, stock: menuItem.stock - orderItem.count };
          }
          return menuItem;
        });

        // 2. ID発行
        const currentOrders = data.orders || [];
        let maxId = 0;
        currentOrders.forEach((o: any) => {
            const num = parseInt(o.ticketId || "0");
            if (num > maxId) maxId = num;
        });
        const nextTicketId = String(maxId + 1).padStart(6, '0');

        // 3. 金額計算
        let total = 0;
        items.forEach(i => {
            const m = currentMenu.find((x: any) => x.name === i.name);
            if (m) total += (m.price * i.count);
        });

        // 4. データ作成
        const newOrder = {
          ticketId: nextTicketId,
          userId: userId,
          items: items,
          totalPrice: total,
          status: "ordered", // 未払い
          createdAt: Timestamp.now()
        };

        transaction.update(shopRef, {
          menu: newMenu,
          orders: arrayUnion(newOrder)
        });
      });

      alert("注文しました！");
      setCart({});
      setSelectedShop(null);
    } catch (e: any) {
      console.error(e);
      alert(typeof e === "string" ? e : "注文に失敗しました。もう一度お試しください。");
    }
  };

  // --- 予約・発券ロジック (既存) ---
  const handleSelectTime = (shop: any, time: string) => { /* 省略（変更なし） */ 
    if (activeTickets.length >= 3) return alert("チケットは3枚までです。");
    if (activeTickets.some(t => t.shopId === shop.id && t.time === time)) return alert("既に予約済みです。");
    const limitGroups = shop.capacity || 0; const current = shop.slots[time] || 0;
    if (limitGroups - current <= 0) return alert("満席です。");
    if (shop.isPaused) return alert("停止中です。");
    setPeopleCount(1);
    setDraftBooking({ time, remaining: limitGroups - current, mode: "slot", maxPeople: shop.groupLimit || 10 });
  };

  const handleJoinQueue = (shop: any) => { /* 省略（変更なし） */
    if (activeTickets.length >= 3) return alert("チケットは3枚までです。");
    if (activeTickets.some(t => t.shopId === shop.id)) return alert("既にこの店に並んでいます。");
    if (shop.isPaused) return alert("停止中です。");
    setPeopleCount(1);
    setDraftBooking({ time: "順番待ち", remaining: 999, mode: "queue", maxPeople: shop.groupLimit || 10 });
  };

  const handleConfirmBooking = async () => { /* 省略（変更なし） */
    if (!selectedShop || !draftBooking) return;
    try {
      const timestamp = Date.now();
      const shopRef = doc(db, "attractions", selectedShop.id);
      if (draftBooking.mode === "slot") {
        const reservationData = { userId, time: draftBooking.time, timestamp, status: "reserved", count: peopleCount };
        await updateDoc(shopRef, { [`slots.${draftBooking.time}`]: increment(1), reservations: arrayUnion(reservationData) });
      } else {
        const shopSnap = await getDoc(shopRef);
        const currentQueue = shopSnap.data()?.queue || [];
        let maxId = 0;
        currentQueue.forEach((q: any) => { const num = parseInt(q.ticketId || "0"); if (num > maxId) maxId = num; });
        const nextTicketId = String(maxId + 1).padStart(6, '0');
        await updateDoc(shopRef, { queue: arrayUnion({ userId, ticketId: nextTicketId, count: peopleCount, status: "waiting", createdAt: Timestamp.now() }) });
        alert(`発券しました！番号: ${nextTicketId}`);
      }
      setDraftBooking(null); setSelectedShop(null);
    } catch (e) { alert("エラーが発生しました。"); }
  };

  const handleCancel = async (ticket: Ticket) => {
    if (!confirm("キャンセル・削除しますか？")) return;
    try {
      const shopRef = doc(db, "attractions", ticket.shopId);
      const shopSnap = await getDoc(shopRef);
      if (!shopSnap.exists()) return;
      const data = shopSnap.data();

      if (ticket.isOrder) {
         // オーダーのキャンセル（在庫を戻す処理などは複雑になるため今回は非表示にするだけ、または運用でカバー）
         // 完了済みのチケットをリストから消すだけにする
         if (ticket.status === 'completed') {
            // クライアント側で非表示にするロジックか、DBから削除するか。
            // ここでは簡易的に「完了済みなら消してOK」とする
            const targetOrder = data.orders?.find((o:any) => o.ticketId === ticket.ticketId);
            if(targetOrder) await updateDoc(shopRef, { orders: arrayRemove(targetOrder) });
         } else {
            alert("注文後のキャンセルはスタッフにお申し付けください");
            return;
         }
      } else if (ticket.isQueue) {
         const targetQ = data.queue?.find((q: any) => q.ticketId === ticket.ticketId);
         if (targetQ) await updateDoc(shopRef, { queue: arrayRemove(targetQ) });
      } else {
         const targetRes = data.reservations?.find((r: any) => r.userId === userId && r.time === ticket.time);
         if (targetRes) { await updateDoc(shopRef, { [`slots.${ticket.time}`]: increment(-1), reservations: arrayRemove(targetRes) }); }
      }
      alert("削除しました");
    } catch (e) { alert("削除失敗"); }
  };

  // --- 入場・支払い共通処理 ---
  const processEntry = async (ticket: Ticket, inputPass: string) => {
    const shop = attractions.find(s => s.id === ticket.shopId);
    if (!shop) return;
    if (inputPass !== shop.password) return alert("パスワードが違います");

    try {
      const shopRef = doc(db, "attractions", shop.id);
      
      if (ticket.isOrder) {
        // ★オーダーの支払い完了処理
        const targetOrder = shop.orders.find((o: any) => o.ticketId === ticket.ticketId);
        if (targetOrder) {
            // ステータスを completed に更新（古いものを消して新しいものを追加）
            await updateDoc(shopRef, { orders: arrayRemove(targetOrder) });
            await updateDoc(shopRef, { orders: arrayUnion({ ...targetOrder, status: "completed" }) });
            alert("購入完了！ありがとうございます！");
        }
      } else if (ticket.isQueue) {
        const targetQ = shop.queue.find((q: any) => q.ticketId === ticket.ticketId);
        if(targetQ) await updateDoc(shopRef, { queue: arrayRemove(targetQ) });
        alert(`入場しました！`);
      } else {
        const oldRes = shop.reservations.find((r: any) => r.userId === userId && r.time === ticket.time && r.status === "reserved");
        if(oldRes) {
            await updateDoc(shopRef, { reservations: arrayRemove(oldRes) });
            await updateDoc(shopRef, { reservations: arrayUnion({ ...oldRes, status: "used" }) });
        }
        alert(`入場しました！`);
      }
      setQrTicket(null);
    } catch(e) { console.error(e); alert("エラーが発生しました。"); }
  };

  // 手動入力
  const handleManualEnter = (ticket: Ticket) => {
    const shop = attractions.find(s => s.id === ticket.shopId);
    if (!shop) return;
    const inputPass = prompt(`${shop.name}のスタッフパスワードを入力：`);
    if (inputPass === null) return;
    processEntry(ticket, inputPass);
  };

  // QRスキャン
  const handleQrScan = (result: any) => {
    if (result && qrTicket) {
        processEntry(qrTicket, result?.text || result);
    }
  };

  // --- UI ---
  return (
    <div className="max-w-md mx-auto p-4 bg-gray-50 min-h-screen pb-20 relative">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-blue-900 mb-2">予約・整理券・注文</h1>
        <div className="bg-gray-800 text-white text-center py-1 rounded text-xs font-mono mb-2">ID: {userId}</div>
        {/* 通知ボタン群（変更なしのため省略可能だが配置維持） */}
        <div className="bg-white p-2 rounded-lg border shadow-sm flex items-center justify-between">
           <span className="text-xs font-bold text-gray-500 pl-2">通知設定</span>
           <div className="flex gap-2">
             <button onClick={() => setEnableSound(!enableSound)} className={`px-2 py-1 rounded text-xs border ${enableSound?"bg-blue-500 text-white":"bg-gray-100"}`}>音</button>
             <button onClick={() => setEnableVibrate(!enableVibrate)} className={`px-2 py-1 rounded text-xs border ${enableVibrate?"bg-blue-500 text-white":"bg-gray-100"}`}>振動</button>
             <button onClick={handleTestSound} className="px-2 py-1 rounded text-xs border bg-gray-200">テスト</button>
           </div>
        </div>
      </header>

      {/* チケット一覧 */}
      {activeTickets.length > 0 && (
        <div className="mb-8 space-y-4">
          <p className="text-blue-900 text-sm font-bold">🎟️ チケット・注文</p>
          {activeTickets.map((t) => {
            // オーダーの場合は背景を変える
            const isOrder = t.isOrder;
            const cardClass = isOrder ? "bg-yellow-50 border-l-4 border-yellow-500 shadow-md" : 
                              (t.status === 'ready' ? "bg-red-50 border-l-4 border-red-500 animate-pulse-slow" : "bg-white border-l-4 border-green-500 shadow-lg");

            return (
              <div key={t.uniqueKey} className={`${cardClass} p-4 rounded relative`}>
                <div className="flex justify-between items-start mb-3">
                  <div className="w-full">
                      <h2 className="font-bold text-lg leading-tight mb-1">{t.shopName}</h2>
                      
                      {/* モバイルオーダー表示 */}
                      {t.isOrder && (
                        <div className="mt-2 bg-white p-3 rounded border border-yellow-200">
                           <div className="flex justify-between items-center border-b border-dashed border-gray-300 pb-2 mb-2">
                              <span className="text-xs font-bold text-gray-500">注文番号</span>
                              <span className="font-mono text-xl font-black text-gray-800">{t.ticketId}</span>
                           </div>
                           <ul className="text-sm space-y-1 mb-2">
                             {t.items?.map((i:any, idx) => (
                               <li key={idx} className="flex justify-between">
                                 <span>{i.name}</span>
                                 <span>x{i.count}</span>
                               </li>
                             ))}
                           </ul>
                           <div className="flex justify-between items-center font-bold text-lg border-t pt-2">
                             <span>合計</span>
                             <span>¥{t.totalPrice}</span>
                           </div>
                        </div>
                      )}

                      {/* 整理券・予約表示 */}
                      {!t.isOrder && t.isQueue && (
                        <div className="mt-2 p-2 bg-gray-100 rounded inline-block">
                           <span className="text-xs text-gray-500 block">番号</span>
                           <span className="text-3xl font-mono font-black">{t.ticketId}</span>
                        </div>
                      )}
                      {!t.isOrder && !t.isQueue && <p className="text-2xl font-bold text-blue-600 mt-1">{t.time}</p>}
                      
                      {/* ステータス表示 */}
                      <div className="mt-3">
                          {t.isOrder ? (
                              t.status === 'completed' ? 
                              <p className="text-green-600 font-bold">✅ 購入済み</p> : 
                              <p className="text-red-600 font-bold animate-pulse">💰 未払い・支払い待ち</p>
                          ) : (
                              t.status === 'ready' ? 
                              <p className="text-red-600 font-bold animate-bounce">🔔 呼び出し中です！</p> : 
                              (t.isQueue && <p className="text-blue-600 font-bold text-sm">{t.peopleAhead}組待ち</p>)
                          )}
                      </div>
                  </div>
                </div>

                <div className="flex gap-2">
                   {/* 支払い・入場ボタン */}
                   {(!t.isOrder || t.status === 'ordered') && (
                     <>
                       <button onClick={() => handleManualEnter(t)} disabled={t.isQueue && t.status!=='ready'} 
                         className={`flex-1 font-bold py-3 rounded-lg shadow text-sm ${t.isQueue && t.status!=='ready'?"bg-gray-300":"bg-blue-600 text-white"}`}>
                         {t.isOrder ? "お支払いへ" : "パスワード入力"}
                       </button>
                       <button onClick={() => setQrTicket(t)} disabled={t.isQueue && t.status!=='ready'}
                         className={`w-1/3 font-bold py-3 rounded-lg border-2 flex justify-center items-center ${t.isQueue && t.status!=='ready'?"bg-gray-50":"bg-white border-black"}`}>
                         📷 QR
                       </button>
                     </>
                   )}
                   {/* キャンセル/削除ボタン */}
                   <button onClick={() => handleCancel(t)} className="px-3 text-red-500 border border-red-200 rounded-lg text-xs">×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 店舗選択リスト */}
      {!selectedShop ? (
        <div className="space-y-3">
          <p className="text-sm font-bold text-gray-600 border-b pb-2">お店を選ぶ</p>
          {attractions.map((shop) => (
            <button key={shop.id} onClick={() => {setSelectedShop(shop); setCart({});}} className={`w-full bg-white p-3 rounded-xl shadow-sm border text-left flex items-start gap-3 ${shop.isPaused ? 'opacity-60' : ''}`}>
               {shop.imageUrl && <img src={shop.imageUrl} className="w-20 h-20 bg-gray-200 rounded-lg object-cover flex-shrink-0" />}
               <div className="flex-1 min-w-0">
                  <div className="flex gap-1 mb-1">
                     {shop.mode === 'order' && <span className="bg-yellow-100 text-yellow-800 text-[10px] px-2 py-0.5 rounded font-bold">モバイルオーダー</span>}
                     {shop.isQueueMode && <span className="bg-orange-100 text-orange-800 text-[10px] px-2 py-0.5 rounded font-bold">整理券</span>}
                  </div>
                  <h3 className="font-bold text-lg truncate">{shop.name}</h3>
               </div>
            </button>
          ))}
        </div>
      ) : (
        // --- 店舗詳細画面 ---
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden pb-10">
            <div className="relative">
               {selectedShop.imageUrl && <img src={selectedShop.imageUrl} className="w-full h-48 object-cover" />}
               <button onClick={() => { setSelectedShop(null); setDraftBooking(null); }} className="absolute top-3 left-3 bg-black/50 text-white px-4 py-2 rounded-full text-sm backdrop-blur-md">← 戻る</button>
               <div className="p-4 border-b bg-gray-50">
                   <h2 className="text-2xl font-bold">{selectedShop.name}</h2>
                   {selectedShop.description && <p className="text-sm text-gray-600 mt-2">{selectedShop.description}</p>}
               </div>
            </div>

            <div className="p-4">
                {selectedShop.isPaused ? (
                    <p className="text-red-500 font-bold bg-red-100 p-3 rounded text-center">受付停止中</p>
                ) : (
                    <>
                        {/* ★オーダー制 UI */}
                        {selectedShop.mode === 'order' ? (
                            <div className="space-y-4">
                                <h3 className="font-bold text-gray-700 border-b pb-1">メニューを選択</h3>
                                {selectedShop.menu?.map((item: any, idx: number) => {
                                    const currentCount = cart[item.name] || 0;
                                    const isStockOut = item.stock <= 0;
                                    const isMax = currentCount >= (item.limit || 99) || currentCount >= item.stock;

                                    return (
                                        <div key={idx} className="flex justify-between items-center py-2 border-b last:border-0">
                                            <div>
                                                <p className="font-bold">{item.name}</p>
                                                <p className="text-sm text-gray-500">¥{item.price} <span className="text-xs ml-2 text-red-500">{isStockOut ? "売り切れ" : `残り${item.stock}`}</span></p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {isStockOut ? <span className="text-sm font-bold text-gray-400">Sold Out</span> : (
                                                  <>
                                                    <button onClick={() => updateCart(item.name, -1, item.limit, item.stock)} disabled={currentCount===0} className="w-8 h-8 rounded-full bg-gray-200 font-bold text-gray-600 disabled:opacity-30">-</button>
                                                    <span className="font-bold w-4 text-center">{currentCount}</span>
                                                    <button onClick={() => updateCart(item.name, 1, item.limit, item.stock)} disabled={isMax} className="w-8 h-8 rounded-full bg-blue-500 text-white font-bold disabled:bg-gray-300">+</button>
                                                  </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="mt-6 pt-4 border-t">
                                    <div className="flex justify-between text-xl font-bold mb-4">
                                        <span>合計</span>
                                        <span>¥{Object.entries(cart).reduce((sum, [name, count]) => {
                                            const price = selectedShop.menu.find((m:any) => m.name === name)?.price || 0;
                                            return sum + (price * count);
                                        }, 0)}</span>
                                    </div>
                                    <button onClick={handlePlaceOrder} className="w-full bg-yellow-500 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-yellow-600 transition">
                                        注文する
                                    </button>
                                </div>
                            </div>
                        ) : selectedShop.isQueueMode ? (
                           /* 整理券ボタン (既存) */
                           <button onClick={() => handleJoinQueue(selectedShop)} className="w-full bg-orange-500 text-white text-xl font-bold py-4 rounded-xl shadow-lg">整理券を発券する</button>
                        ) : (
                           /* 時間枠ボタン (既存) */
                           <div className="grid grid-cols-3 gap-3">
                              {Object.entries(selectedShop.slots || {}).sort().map(([time, count]: any) => (
                                 <button key={time} onClick={() => handleSelectTime(selectedShop, time)} 
                                   className="p-2 rounded border h-20 flex flex-col items-center justify-center bg-white border-blue-200">
                                   <span className="font-bold">{time}</span>
                                 </button>
                              ))}
                           </div>
                        )}
                    </>
                )}
            </div>
        </div>
      )}

      {/* 確認モーダル (既存の予約用) */}
      {draftBooking && selectedShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
           <div className="bg-white w-full max-w-sm rounded-xl p-6">
              <h3 className="text-lg font-bold text-center mb-4">人数を選択</h3>
              <select value={peopleCount} onChange={(e) => setPeopleCount(Number(e.target.value))} className="w-full text-lg p-3 border rounded-lg mb-6">
                 {[...Array(draftBooking.maxPeople)].map((_, i) => <option key={i+1} value={i+1}>{i+1}名</option>)}
              </select>
              <div className="flex gap-3">
                 <button onClick={() => setDraftBooking(null)} className="flex-1 py-3 bg-gray-100 rounded-lg">やめる</button>
                 <button onClick={handleConfirmBooking} className="flex-1 py-3 bg-blue-600 text-white rounded-lg">確定</button>
              </div>
           </div>
        </div>
      )}

      {/* QRリーダー (既存) */}
      {qrTicket && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
              <div className="w-full max-w-sm relative rounded-xl overflow-hidden border-2 border-gray-500">
                  <QrReader onResult={handleQrScan} constraints={{ facingMode: 'environment' }} className="w-full" />
              </div>
              <button onClick={() => setQrTicket(null)} className="mt-6 px-8 py-3 bg-gray-800 text-white rounded-lg">閉じる</button>
          </div>
      )}
    </div>
  );
}
