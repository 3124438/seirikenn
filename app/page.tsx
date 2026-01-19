// app/page.tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebase";
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove, 
  increment, 
  getDoc, 
  setDoc, 
  serverTimestamp, 
  Timestamp,
  runTransaction // ★追加: 在庫管理の整合性確保のため必須
} from "firebase/firestore";
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
  status: "reserved" | "waiting" | "ready" | "used" | "done" | "ordered" | "completed"; // ★ ordered, completed を追加
  count: number;
  isQueue?: boolean;
  ticketId?: string;
  peopleAhead?: number;
  // ★以下、注文機能用に追加
  isOrder?: boolean;
  totalPrice?: number;
  items?: { id: string; name: string; price: number; count: number }[];
};

// ★メニュー項目の型定義
type MenuItem = {
  id: string;
  name: string;
  price: number;
  stock: number;
  limit: number; // 購入制限数
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

  // QRコード関連
  const [qrTicket, setQrTicket] = useState<Ticket | null>(null);

  // 音声再生用
  const audioCtxRef = useRef<AudioContext | null>(null);

  // 申し込み画面用の状態
  const [draftBooking, setDraftBooking] = useState<{ time: string; remaining: number; mode: "slot" | "queue"; maxPeople: number } | null>(null);
  const [peopleCount, setPeopleCount] = useState<number>(1);

  // ★注文機能用の状態
  const [cart, setCart] = useState<{ [itemId: string]: number }>({});
  const [paymentTarget, setPaymentTarget] = useState<Ticket | null>(null); // 支払い中のチケット

  // 音を鳴らす関数
  const playBeep = () => {
    try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        
        if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContextClass();
        }
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }

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
    } catch (e) {
        console.error("Audio play failed", e);
    }
  };

  const handleTestSound = () => {
     playBeep();
     if (typeof navigator !== "undefined" && navigator.vibrate) {
         navigator.vibrate(200);
     }
     alert("テスト音再生中\n(マナーモードや音量設定を確認してください)");
  };

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
    getDoc(userDocRef).then((snap) => {
        if (!snap.exists()) {
            setDoc(userDocRef, {
                userId: storedId,
                createdAt: serverTimestamp(),
                isBanned: false        
            }).catch(err => console.error("User regist error:", err));
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
        // 予約チケット抽出
        if (shop.reservations) {
          shop.reservations.forEach((r: any) => {
            if (r.userId === storedId) {
              newMyTickets.push({
                uniqueKey: `slot_${shop.id}_${r.time}`,
                shopId: shop.id,
                shopName: shop.name,
                shopDepartment: shop.department,
                time: r.time,
                timestamp: r.timestamp,
                status: r.status,
                count: r.count || 1,
                isQueue: false
              });
            }
          });
        }

        // 整理券チケット抽出
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
                shopId: shop.id,
                shopName: shop.name,
                shopDepartment: shop.department,
                time: "順番待ち",
                timestamp: q.createdAt?.toMillis() || Date.now(),
                status: q.status,
                count: q.count || 1,
                isQueue: true,
                ticketId: q.ticketId,
                peopleAhead: groupsAhead
              });
            }
          });
        }

        // ★注文チケット抽出 (orders配列がある場合)
        if (shop.orders) {
          shop.orders.forEach((o: any) => {
            if (o.userId === storedId) {
              newMyTickets.push({
                uniqueKey: `order_${shop.id}_${o.ticketId}`,
                shopId: shop.id,
                shopName: shop.name,
                shopDepartment: shop.department,
                time: "注文済み",
                timestamp: o.timestamp,
                status: o.status,
                count: 1, // 注文は人数ではなく1件として扱う
                isOrder: true,
                ticketId: o.ticketId,
                totalPrice: o.totalPrice,
                items: o.items
              });
            }
          });
        }
      });

      // 並び替え: 呼び出し中(ready) -> 注文(ordered) -> その他日時順
      newMyTickets.sort((a, b) => {
        if (a.status === 'ready' && b.status !== 'ready') return -1;
        if (a.status !== 'ready' && b.status === 'ready') return 1;
        // 未完了の注文を上位に
        if (a.status === 'ordered' && b.status !== 'ordered') return -1;
        if (a.status !== 'ordered' && b.status === 'ordered') return 1;
        return b.timestamp - a.timestamp;
      });

      setMyTickets(newMyTickets);
    });

    return () => {
        unsubUser();        
        unsubAttractions(); 
    };
  }, []);

  const activeTickets = myTickets.filter(t => ["reserved", "waiting", "ready", "ordered"].includes(t.status));

  // 通知ループ処理
  useEffect(() => {
    const intervalId = setInterval(() => {
      const hasReadyTicket = activeTickets.some(t => t.status === 'ready');
      if (hasReadyTicket) {
        if (enableSound) playBeep();
        if (enableVibrate && typeof navigator !== "undefined" && navigator.vibrate) {
            try { navigator.vibrate(200); } catch(e) { /* ignore */ }
        }
      }
    }, 1000); 

    return () => clearInterval(intervalId);
  }, [activeTickets, enableSound, enableVibrate]);


  if (isBanned) {
      return (
          <div className="min-h-screen bg-red-900 text-white flex flex-col items-center justify-center p-4 text-center">
              <h1 className="text-3xl font-bold mb-2">ACCESS DENIED</h1>
              <p>利用停止処分が適用されています</p>
          </div>
      );
  }

  // --- 予約・発券ロジック ---

  const handleSelectTime = (shop: any, time: string) => {
    if (activeTickets.length >= 3) return alert("チケットは3枚までです。");
    if (activeTickets.some(t => t.shopId === shop.id && t.time === time)) return alert("既に予約済みです。");
    
    const limitGroups = shop.capacity || 0; 
    const current = shop.slots[time] || 0;
    const remaining = limitGroups - current;

    if (remaining <= 0) return alert("満席です。");
    if (shop.isPaused) return alert("停止中です。");
    
    const maxPeople = shop.groupLimit || 10;

    setPeopleCount(1);
    setDraftBooking({ time, remaining, mode: "slot", maxPeople });
  };

  const handleJoinQueue = (shop: any) => {
    if (activeTickets.length >= 3) return alert("チケットは3枚までです。");
    if (activeTickets.some(t => t.shopId === shop.id)) return alert("既にこの店に並んでいます。");
    if (shop.isPaused) return alert("停止中です。");

    const maxPeople = shop.groupLimit || 10;

    setPeopleCount(1);
    setDraftBooking({ time: "順番待ち", remaining: 999, mode: "queue", maxPeople });
  };

  const handleConfirmBooking = async () => {
    if (!selectedShop || !draftBooking) return;

    if (!confirm(`${selectedShop.name}\n${draftBooking.mode === "queue" ? "並びますか？" : "予約しますか？"}\n人数: ${peopleCount}名`)) return;

    try {
      const timestamp = Date.now();
      const shopRef = doc(db, "attractions", selectedShop.id);
      
      if (draftBooking.mode === "slot") {
        const reservationData = { userId, time: draftBooking.time, timestamp, status: "reserved", count: peopleCount };
        await updateDoc(shopRef, { 
            [`slots.${draftBooking.time}`]: increment(1),
            reservations: arrayUnion(reservationData)
        });
      } else {
        const shopSnap = await getDoc(shopRef);
        const currentQueue = shopSnap.data()?.queue || [];
        let maxId = 0;
        currentQueue.forEach((q: any) => {
            const num = parseInt(q.ticketId || "0");
            if (num > maxId) maxId = num;
        });
        const nextIdNum = maxId + 1;
        const nextTicketId = String(nextIdNum).padStart(6, '0');

        const queueData = {
          userId,
          ticketId: nextTicketId,
          count: peopleCount,
          status: "waiting",
          createdAt: Timestamp.now()
        };

        await updateDoc(shopRef, {
          queue: arrayUnion(queueData)
        });

        alert(`発券しました！\n番号: ${nextTicketId}`);
      }
      setDraftBooking(null);
      setSelectedShop(null);
    } catch (e) { 
      console.error(e);
      alert("エラーが発生しました。もう一度お試しください。"); 
    }
  };

  // --- ★注文ロジック ---

  // カート操作
  const updateCart = (itemId: string, diff: number, stock: number, limit: number) => {
    setCart(prev => {
        const currentVal = prev[itemId] || 0;
        const newVal = currentVal + diff;
        if (newVal < 0) return prev;
        if (newVal > limit) return prev; 
        if (newVal > stock) return prev; // 表示上の在庫チェック（厳密なチェックは送信時）
        
        const newCart = { ...prev, [itemId]: newVal };
        if (newVal === 0) delete newCart[itemId];
        return newCart;
    });
  };

  // 注文送信（Firebaseトランザクション）
  const handleOrder = async () => {
    if (!selectedShop) return;
    const itemIds = Object.keys(cart);
    if (itemIds.length === 0) return;

    if (activeTickets.length >= 3) return alert("チケット保持数の上限です。既存のチケットを消化してください。");

    if (!confirm("注文を確定しますか？")) return;

    try {
        const shopRef = doc(db, "attractions", selectedShop.id);

        await runTransaction(db, async (transaction) => {
            const shopDoc = await transaction.get(shopRef);
            if (!shopDoc.exists()) throw "Shop not found";

            const shopData = shopDoc.data();
            const menu = shopData.menu || [];
            let totalPrice = 0;
            const orderItems: any[] = [];

            // 在庫チェック & データ構築
            const newMenu = menu.map((item: any) => {
                const count = cart[item.id] || 0;
                if (count > 0) {
                    if (item.stock < count) {
                        throw `商品「${item.name}」の在庫が足りません（残り${item.stock}個）`;
                    }
                    totalPrice += item.price * count;
                    orderItems.push({ id: item.id, name: item.name, price: item.price, count });
                    return { ...item, stock: item.stock - count }; // 在庫減算
                }
                return item;
            });

            // チケットID生成 (現在のorders配列の長さベースまたはランダム)
            const currentOrders = shopData.orders || [];
            const nextOrderNum = currentOrders.length + 1;
            const ticketId = `ORD-${String(nextOrderNum).padStart(4, '0')}`;

            const orderData = {
                ticketId,
                userId,
                items: orderItems,
                totalPrice,
                status: "ordered",
                timestamp: Date.now()
            };

            // 書き込み
            transaction.update(shopRef, {
                menu: newMenu,
                orders: arrayUnion(orderData)
            });
        });

        alert("注文が完了しました！");
        setCart({});
        setSelectedShop(null);

    } catch (e: any) {
        console.error("Transaction failed: ", e);
        alert(typeof e === "string" ? e : "注文に失敗しました。売り切れの可能性があります。");
    }
  };

  // --- キャンセル・入場・支払いロジック ---

  const handleCancel = async (ticket: Ticket) => {
    if (!confirm("キャンセルしますか？")) return;
    try {
      const shopRef = doc(db, "attractions", ticket.shopId);
      const shopSnap = await getDoc(shopRef);
      if (!shopSnap.exists()) return;
      const shopData = shopSnap.data();

      // ★注文のキャンセル処理（簡易版：在庫は戻さない仕様とするか、戻すならトランザクションが必要）
      // ここでは仕様書に「注文キャンセル」の記述がないため、UIから削除のみ行う（データは残るがactiveから消える）
      // ただし仕様上、注文機能のキャンセルボタンは表示しない、または運用でカバーとするケースが多い。
      // 今回は注文チケットにはキャンセルボタンを表示しない方針で実装します（UI部分で制御）。
      
      if (ticket.isQueue) {
         const targetQ = shopData.queue?.find((q: any) => q.ticketId === ticket.ticketId);
         if (targetQ) {
           await updateDoc(shopRef, { queue: arrayRemove(targetQ) });
         }
      } else if (!ticket.isOrder) {
         const targetRes = shopData.reservations?.find((r: any) => r.userId === userId && r.time === ticket.time && r.timestamp === ticket.timestamp);
         if (targetRes) {
           await updateDoc(shopRef, { 
             [`slots.${ticket.time}`]: increment(-1),
             reservations: arrayRemove(targetRes)
           });
         }
      }
      alert("キャンセルしました");
    } catch (e) { alert("キャンセル失敗"); }
  };

  const processEntry = async (ticket: Ticket, inputPass: string) => {
    const shop = attractions.find(s => s.id === ticket.shopId);
    if (!shop) return;
    
    if (inputPass !== shop.password) {
        alert("パスワードが違います");
        return;
    }

    try {
      const shopRef = doc(db, "attractions", shop.id);
      
      if (ticket.isOrder) {
        // ★注文完了処理
        const oldOrder = shop.orders.find((o: any) => o.ticketId === ticket.ticketId);
        if (oldOrder) {
             await updateDoc(shopRef, { orders: arrayRemove(oldOrder) });
             await updateDoc(shopRef, { orders: arrayUnion({ ...oldOrder, status: "completed" }) });
        }
        alert("お支払いが完了しました！");
        setPaymentTarget(null); // モーダルを閉じる

      } else if (ticket.isQueue) {
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

  // 手動入力での入場/支払い
  const handleManualEnter = (ticket: Ticket) => {
    const shop = attractions.find(s => s.id === ticket.shopId);
    if (!shop) return;
    
    // 注文の場合は支払いモーダルを開く
    if (ticket.isOrder) {
        setPaymentTarget(ticket);
        return;
    }

    if (ticket.isQueue && ticket.status !== 'ready') return alert("まだ呼び出しされていません。");

    const inputPass = prompt(`${shop.name}のスタッフパスワードを入力：`);
    if (inputPass === null) return; 
    processEntry(ticket, inputPass);
  };

  // 支払いモーダルからの実行
  const handlePaymentSubmit = () => {
      if(!paymentTarget) return;
      const inputPass = (document.getElementById("payment-pass") as HTMLInputElement).value;
      if (!inputPass) return;
      processEntry(paymentTarget, inputPass);
  };

  const handleQrScan = (result: any) => {
    if (result && qrTicket) {
        const scannedPassword = result?.text || result;
        processEntry(qrTicket, scannedPassword);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-gray-50 min-h-screen pb-20 relative">
      <header className="mb-6">
        <div className="flex justify-between items-center mb-2">
           <div className="flex items-center gap-2">
               <h1 className="text-xl font-bold text-blue-900">予約・整理券</h1>
           </div>
           
           <div className="flex items-center gap-2">
               <div className={`px-3 py-1 rounded-full text-sm font-bold ${activeTickets.length >= 3 ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                   {activeTickets.length}/3枚
               </div>
           </div>
        </div>
        
        <div className="bg-gray-800 text-white text-center py-1 rounded text-xs font-mono mb-2">
            User ID: {userId}
        </div>

        {/* 通知設定パネル */}
        <div className="bg-white p-2 rounded-lg border shadow-sm flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 pl-2">呼び出し通知</span>
            <div className="flex gap-2">
                <button 
                  onClick={() => setEnableSound(!enableSound)}
                  className={`px-2 py-1.5 rounded text-xs font-bold border transition-colors flex items-center gap-1 ${enableSound ? "bg-blue-500 text-white border-blue-600" : "bg-gray-100 text-gray-400 border-gray-200"}`}
                >
                  {enableSound ? "🔊 音ON" : "🔇 音OFF"}
                </button>
                <button 
                  onClick={() => setEnableVibrate(!enableVibrate)}
                  className={`px-2 py-1.5 rounded text-xs font-bold border transition-colors flex items-center gap-1 ${enableVibrate ? "bg-blue-500 text-white border-blue-600" : "bg-gray-100 text-gray-400 border-gray-200"}`}
                >
                  {enableVibrate ? "📳 振動ON" : "📴 振動OFF"}
                </button>
                <button 
                  onClick={handleTestSound} 
                  className="px-2 py-1.5 rounded text-xs border bg-gray-200 text-gray-600 active:bg-gray-300"
                >
                  🔔 テスト
                </button>
            </div>
        </div>
      </header>

      {/* チケット一覧 */}
      {activeTickets.length > 0 && (
        <div className="mb-8 space-y-4">
          <p className="text-blue-900 text-sm font-bold">🎟️ あなたのチケット</p>
          {activeTickets.map((t) => {
            const isReady = t.status === 'ready';
            const isOrder = t.isOrder; // 注文タイプか
            
            // 色分け: 注文=黄色系, 呼び出し=赤系, 通常=青/緑系
            let cardClass = "bg-white border-l-4 shadow-lg";
            if (isOrder) {
                cardClass += " border-yellow-500 bg-yellow-50";
            } else if (isReady) {
                cardClass += " bg-red-50 border-red-500 ring-2 ring-red-400 animate-pulse-slow";
            } else {
                cardClass += " border-green-500";
            }

            return (
              <div key={t.uniqueKey} className={`${cardClass} p-4 rounded relative`}>
                <div className="flex justify-between items-start mb-3">
                  <div className="w-full">
                      {t.shopDepartment && (
                        <p className="text-xs font-bold text-gray-500 mb-0.5">{t.shopDepartment}</p>
                      )}
                      <h2 className="font-bold text-lg flex items-center gap-2 leading-tight">
                          {t.shopName}
                          {!isOrder && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full border border-green-200 whitespace-nowrap">
                               {t.count}名
                            </span>
                          )}
                      </h2>
                      
                      {isOrder ? (
                        // ★注文チケットの表示
                        <div className="mt-2 w-full">
                            <div className="flex justify-between items-end border-b border-yellow-200 pb-2 mb-2">
                                <span className="font-bold text-gray-600">お支払い合計</span>
                                <span className="text-2xl font-bold text-gray-900">¥{t.totalPrice?.toLocaleString()}</span>
                            </div>
                            <div className="text-xs text-gray-500 space-y-1">
                                {t.items?.map((item, idx) => (
                                    <div key={idx} className="flex justify-between">
                                        <span>{item.name} x{item.count}</span>
                                        <span>¥{(item.price * item.count).toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-3 bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded inline-block">
                                番号: {t.ticketId}
                            </div>
                        </div>
                      ) : t.isQueue ? (
                        <div className="mt-2 p-2 bg-gray-100 rounded border border-gray-200 inline-block">
                          <p className="text-xs text-gray-500 font-bold mb-1">整理券番号</p>
                          <p className="text-3xl font-mono font-black text-gray-800 tracking-widest leading-none">
                              {t.ticketId}
                          </p>
                        </div>
                      ) : (
                        <p className="text-3xl font-bold text-blue-600 font-mono mt-1">{t.time}</p>
                      )}
                      
                      {t.isQueue && (
                          <div className="mt-2">
                              {isReady ? (
                                <p className="text-red-600 font-bold text-lg animate-bounce">🔔 呼び出し中です！</p>
                              ) : (
                                <p className="text-blue-600 font-bold text-sm">
                                  あなたの前に <span className="text-xl text-blue-800">{t.peopleAhead}</span> 組待ち
                                </p>
                              )}
                          </div>
                      )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    {/* ★ボタン表示（注文なら「お支払いへ」、他は「入場」） */}
                    <button 
                        onClick={() => handleManualEnter(t)} 
                        disabled={t.isQueue && !isReady} 
                        className={`flex-1 font-bold py-3 rounded-lg shadow transition text-sm
                        ${(t.isQueue && !isReady) 
                            ? "bg-gray-300 text-gray-500 cursor-not-allowed" 
                            : isOrder 
                                ? "bg-yellow-500 text-white hover:bg-yellow-600"
                                : "bg-blue-600 text-white hover:bg-blue-500"
                        }`}
                    >
                        {isOrder 
                            ? "💴 お支払いへ" 
                            : (t.isQueue && !isReady) ? "待機中..." : "パスワード入力で入場"
                        }
                    </button>
                    
                    {/* キャンセルボタン (注文以外のみ表示) */}
                    {!isOrder && (
                        <button onClick={() => handleCancel(t)} className="px-4 text-red-500 border border-red-200 rounded-lg text-xs hover:bg-red-50">
                            削除
                        </button>
                    )}
                  </div>

                  {/* QRコードで入場/支払いボタン */}
                  {!isOrder && ( // 注文の場合はQR支払いは今回は実装対象外(パスワードのみ)とするか、共通ボタンを使う
                      <button 
                        onClick={() => setQrTicket(t)}
                        disabled={t.isQueue && !isReady}
                        className={`w-full font-bold py-3 rounded-lg border-2 flex items-center justify-center gap-2 transition
                            ${(t.isQueue && !isReady)
                                ? "border-gray-300 text-gray-400 cursor-not-allowed bg-gray-50"
                                : "border-black text-black bg-white hover:bg-gray-100"
                            }`}
                      >
                          <span>📷</span> QRコードで入場
                      </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* 店舗選択リスト */}
      {!selectedShop ? (
        <div className="space-y-3">
          <p className="text-sm font-bold text-gray-600 mb-2 border-b pb-2">アトラクションを選ぶ</p>
          {attractions.map((shop) => (
            <button key={shop.id} onClick={() => { setSelectedShop(shop); setCart({}); }} className={`w-full bg-white p-3 rounded-xl shadow-sm border text-left flex items-start gap-3 hover:bg-gray-50 transition ${shop.isPaused ? 'opacity-60 grayscale' : ''}`}>
              {shop.imageUrl && (
                  <div className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                      <img src={shop.imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
              )}
              <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1 mb-1">
                      {shop.isQueueMode && <span className="bg-orange-100 text-orange-700 border-orange-200 border text-[10px] px-2 py-0.5 rounded font-bold">順番待ち制</span>}
                      {shop.menu && <span className="bg-yellow-100 text-yellow-700 border-yellow-200 border text-[10px] px-2 py-0.5 rounded font-bold">注文可</span>}
                      {shop.isPaused && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded">受付停止中</span>}
                  </div>
                  {shop.department && (
                    <p className="text-xs text-blue-600 font-bold mb-0.5">{shop.department}</p>
                  )}
                  <h3 className="font-bold text-lg leading-tight truncate text-gray-800 mb-1">{shop.name}</h3>
                  <div className="text-xs text-gray-400">
                      {shop.isQueueMode 
                        ? `待ち: ${shop.queue?.filter((q:any)=>q.status==='waiting').length || 0}組` 
                        : `予約可`}
                  </div>
              </div>
              <div className="self-center text-gray-300">&gt;</div>
            </button>
          ))}
        </div>
      ) : (
        // 詳細・予約画面
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden pb-20">
            <div className="relative">
               {selectedShop.imageUrl && (
                 <div className="w-full h-56 bg-gray-200">
                   <img 
                     src={selectedShop.imageUrl} 
                     alt={selectedShop.name} 
                     className="w-full h-full object-cover" 
                   />
                 </div>
               )}

               <button 
                 onClick={() => { setSelectedShop(null); setDraftBooking(null); setCart({}); }} 
                 className="absolute top-3 left-3 bg-black/50 text-white px-4 py-2 rounded-full text-sm backdrop-blur-md z-10 hover:bg-black/70 transition"
               >
                 ← 戻る
               </button>

               <div className={`p-5 border-b bg-gray-50 ${!selectedShop.imageUrl ? "pt-14" : ""}`}>
                   {selectedShop.department && (
                     <p className="text-sm font-bold text-blue-600 mb-1">{selectedShop.department}</p>
                   )}
                   <h2 className="text-2xl font-bold leading-tight text-gray-900">{selectedShop.name}</h2>
               </div>
            </div>

            <div className="p-4">
                {selectedShop.description && (
                    <div className="mb-6 text-sm text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
                        {selectedShop.description}
                    </div>
                )}

                {selectedShop.isPaused ? (
                    <p className="text-red-500 font-bold mb-4 bg-red-100 p-3 rounded text-center">現在 受付停止中です</p>
                ) : (
                    <>
                        {/* ★メニュー注文セクション */}
                        {selectedShop.menu && selectedShop.menu.length > 0 ? (
                            <div className="mb-8">
                                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                    🍔 メニュー
                                </h3>
                                <div className="space-y-4">
                                    {selectedShop.menu.map((item: MenuItem) => {
                                        const currentQty = cart[item.id] || 0;
                                        const isSoldOut = item.stock <= 0;
                                        return (
                                            <div key={item.id} className="flex items-center justify-between border-b pb-3">
                                                <div className="flex-1">
                                                    <p className="font-bold text-gray-800">{item.name}</p>
                                                    <p className="text-gray-500 text-sm">¥{item.price.toLocaleString()}</p>
                                                    {isSoldOut && <span className="text-xs text-red-500 font-bold bg-red-100 px-1 rounded">売り切れ</span>}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <button 
                                                        onClick={() => updateCart(item.id, -1, item.stock, item.limit)}
                                                        disabled={currentQty <= 0}
                                                        className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center disabled:opacity-30 font-bold text-lg"
                                                    >
                                                        -
                                                    </button>
                                                    <span className="w-6 text-center font-bold text-lg">{currentQty}</span>
                                                    <button 
                                                        onClick={() => updateCart(item.id, 1, item.stock, item.limit)}
                                                        disabled={isSoldOut || currentQty >= item.limit || currentQty >= item.stock}
                                                        className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center disabled:bg-gray-300 font-bold text-lg"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* 注文ボタンエリア */}
                                {Object.keys(cart).length > 0 && (
                                    <div className="fixed bottom-0 left-0 w-full bg-white border-t p-4 shadow-lg z-20 flex items-center justify-between">
                                        <div>
                                            <p className="text-xs text-gray-500">合計金額</p>
                                            <p className="text-2xl font-bold text-blue-900">
                                                ¥{Object.keys(cart).reduce((sum, id) => {
                                                    const item = selectedShop.menu.find((m: any) => m.id === id);
                                                    return sum + (item ? item.price * cart[id] : 0);
                                                }, 0).toLocaleString()}
                                            </p>
                                        </div>
                                        <button 
                                            onClick={handleOrder}
                                            className="bg-blue-600 text-white font-bold px-8 py-3 rounded-xl shadow-lg hover:bg-blue-500 transition"
                                        >
                                            注文する
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* 既存の予約・整理券UI */
                            selectedShop.isQueueMode ? (
                               <div className="text-center py-6">
                                  <div className="mb-6">
                                    <p className="text-gray-500 text-sm font-bold mb-2">現在の待ち状況</p>
                                    <div className="flex justify-center gap-4">
                                       <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 min-w-[100px]">
                                          <p className="text-xs text-orange-600">待ち組数</p>
                                          <p className="text-3xl font-bold text-orange-900">
                                            {selectedShop.queue?.filter((q:any)=>q.status==='waiting').length || 0}
                                            <span className="text-sm font-normal ml-1">組</span>
                                          </p>
                                       </div>
                                    </div>
                                  </div>
                                  <button 
                                    onClick={() => handleJoinQueue(selectedShop)}
                                    className="w-full bg-orange-500 text-white text-xl font-bold py-4 rounded-xl shadow-lg hover:bg-orange-600 transition flex items-center justify-center gap-2"
                                  >
                                    <span>🏃</span> 整理券を発券する
                                  </button>
                               </div>
                            ) : (
                               <div className="grid grid-cols-3 gap-3">
                                  {Object.entries(selectedShop.slots || {}).sort().map(([time, count]: any) => {
                                      const limitGroups = selectedShop.capacity || 0; 
                                      const isFull = count >= limitGroups;
                                      const remaining = limitGroups - count;
                                      const isBooked = activeTickets.some(t => t.shopId === selectedShop.id && t.time === time);
                                      
                                      return (
                                        <button 
                                          key={time} 
                                          disabled={isFull || isBooked} 
                                          onClick={() => handleSelectTime(selectedShop, time)}
                                          className={`p-2 rounded border h-24 flex flex-col items-center justify-center ${isBooked ? "bg-green-50 border-green-500" : "bg-white border-blue-200"}`}
                                        >
                                           <span className="font-bold">{time}</span>
                                           <span className="text-xs">{isBooked ? "予約済" : isFull ? "満席" : `あと${remaining}組`}</span>
                                        </button>
                                      );
                                  })}
                               </div>
                            )
                        )}
                    </>
                )}
            </div>
        </div>
      )}
      
      {/* 申し込み確認モーダル */}
      {draftBooking && selectedShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl overflow-hidden">
            <div className={`${draftBooking.mode === "queue" ? "bg-orange-500" : "bg-blue-600"} text-white p-4 text-center`}>
              <h3 className="text-lg font-bold">{draftBooking.mode === "queue" ? "整理券の発券" : "予約の確認"}</h3>
            </div>
            
            <div className="p-6">
              <p className="text-center text-sm font-bold text-gray-500 mb-1">{selectedShop.department}</p>
              <p className="text-center font-bold text-xl mb-4">{selectedShop.name}</p>
              
              <label className="block text-sm font-bold text-gray-700 mb-2">
                  人数を選択してください
              </label>
              <select 
                  value={peopleCount} 
                  onChange={(e) => setPeopleCount(Number(e.target.value))}
                  className="w-full text-lg p-3 border-2 border-gray-200 rounded-lg mb-6"
              >
                  {[...Array(draftBooking.maxPeople)].map((_, i) => (
                      <option key={i+1} value={i+1}>{i+1}名</option>
                  ))}
              </select>

              <div className="flex gap-3">
                  <button onClick={() => setDraftBooking(null)} className="flex-1 py-3 bg-gray-100 rounded-lg font-bold text-gray-500">やめる</button>
                  <button onClick={handleConfirmBooking} className={`flex-1 py-3 text-white font-bold rounded-lg shadow ${draftBooking.mode === "queue" ? "bg-orange-500" : "bg-blue-600"}`}>
                      {draftBooking.mode === "queue" ? "発券する" : "予約する"}
                  </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ★お支払いパスワード入力モーダル */}
      {paymentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl overflow-hidden">
                <div className="bg-yellow-500 text-white p-4 text-center">
                    <h3 className="text-lg font-bold">お支払い確認</h3>
                </div>
                <div className="p-6">
                    <p className="text-center text-gray-600 mb-2">スタッフに画面を提示し、<br/>パスワードを入力してもらってください。</p>
                    <div className="bg-gray-100 p-4 rounded mb-4 text-center">
                        <p className="text-xs text-gray-500">合計金額</p>
                        <p className="text-3xl font-bold">¥{paymentTarget.totalPrice?.toLocaleString()}</p>
                    </div>
                    <input 
                        type="password"
                        id="payment-pass"
                        placeholder="スタッフパスワード"
                        className="w-full p-3 border-2 border-gray-300 rounded-lg text-center text-xl mb-4"
                    />
                    <div className="flex gap-3">
                         <button onClick={() => setPaymentTarget(null)} className="flex-1 py-3 bg-gray-200 rounded-lg font-bold text-gray-600">閉じる</button>
                         <button onClick={handlePaymentSubmit} className="flex-1 py-3 bg-yellow-500 text-white font-bold rounded-lg shadow">完了</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* QRコードリーダー モーダル */}
      {qrTicket && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
              <div className="w-full max-w-sm">
                  <h3 className="text-white font-bold text-center mb-4 text-lg">
                      QRコードを読み取ってください
                  </h3>
                  
                  <div className="relative rounded-xl overflow-hidden border-2 border-gray-700 bg-black">
                        <QrReader
                          onResult={handleQrScan}
                          constraints={{ facingMode: 'environment' }}
                          className="w-full"
                          scanDelay={500}
                        />
                        {/* 枠の演出 */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-64 h-64 border-4 border-green-500/50 rounded-lg"></div>
                        </div>
                  </div>

                  <p className="text-gray-400 text-xs text-center mt-4">
                      会場のQRコードを枠内に写してください
                  </p>
                  
                  <button 
                      onClick={() => setQrTicket(null)}
                      className="w-full mt-6 py-4 bg-gray-800 text-white font-bold rounded-lg border border-gray-600"
                  >
                      キャンセル
                  </button>
              </div>
          </div>
      )}

    </div>
  );
}
