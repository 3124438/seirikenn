// app/page.tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebase"; // パスは環境に合わせて調整してください
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
  runTransaction // ★追加: Module 3 在庫トランザクション用
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { Ticket, Shop, DraftBooking } from "./types";
import { NotificationPanel, TicketCard, ShopList, ShopDetail, BookingModal, QrModal } from "./components";

// ★共通設定 (Module 2: Constants)
const LIMIT_TIME_MINUTES = 30;

// ★型定義 (Module 3: Database)
type MenuItem = {
  id: string;
  name: string;
  price: number;
  stock: number;
  limit: number;
  order?: number; // 表示順
};

type OrderItem = {
  id: string;
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

export default function Home() {
  // --- 既存ステート ---
  const [attractions, setAttractions] = useState<Shop[]>([]);
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [userId, setUserId] = useState("");
  const [isBanned, setIsBanned] = useState(false);
  const [enableSound, setEnableSound] = useState(false);
  const [enableVibrate, setEnableVibrate] = useState(false);
  const [qrTicket, setQrTicket] = useState<Ticket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [draftBooking, setDraftBooking] = useState<DraftBooking | null>(null);
  const [peopleCount, setPeopleCount] = useState<number>(1);

  // --- ★追加ステート (Module 3 & 4) ---
  const [menuList, setMenuList] = useState<MenuItem[]>([]);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<{ [itemId: string]: number }>({});
  const [currentTime, setCurrentTime] = useState(Date.now()); // タイマー用

  // --- 既存関数: 音再生 ---
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

    // User Check
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

    // --- 既存: Attractions Listener ---
    const unsubAttractions = onSnapshot(collection(db, "attractions"), (snapshot) => {
      const shopData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Shop));
      setAttractions(shopData);

      const newMyTickets: Ticket[] = [];
      
      shopData.forEach((shop: Shop) => {
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

        if (shop.queue) {
          shop.queue.forEach((q: any) => {
            if (q.userId === storedId) {
              let groupsAhead = 0;
              if (q.status === 'waiting') {
                const myNum = parseInt(q.ticketId || "999999");
                groupsAhead = shop.queue!.filter((other: any) => 
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
      });

      newMyTickets.sort((a, b) => {
        if (a.status === 'ready' && b.status !== 'ready') return -1;
        if (a.status !== 'ready' && b.status === 'ready') return 1;
        return b.timestamp - a.timestamp;
      });

      setMyTickets(newMyTickets);
    });

    // --- ★追加: Menu Listener (Module 3) ---
    const unsubMenu = onSnapshot(collection(db, "menu"), (snapshot) => {
        const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem));
        // 表示順などでソート
        items.sort((a, b) => (a.order || 0) - (b.order || 0));
        setMenuList(items);
    });

    // --- ★追加: Orders Listener (Module 3 & 4) ---
    // ※本来は query(collection(db, "orders"), where("userId", "==", storedId)) だが簡略化のため全取得フィルタ
    const unsubOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
        const orders = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() } as Order))
            .filter(o => o.userId === storedId); // クライアントサイドフィルタ
        
        // ソート: 新しい順
        orders.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
        setMyOrders(orders);
    });

    // タイマー更新 (Module 4)
    const timerInterval = setInterval(() => setCurrentTime(Date.now()), 1000);

    return () => {
        unsubUser();        
        unsubAttractions(); 
        unsubMenu();
        unsubOrders();
        clearInterval(timerInterval);
    };
  }, []);

  const activeTickets = myTickets.filter(t => ["reserved", "waiting", "ready"].includes(t.status));

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

  // --- 既存: 予約・発券ロジック ---
  const handleSelectTime = (shop: Shop, time: string) => {
    if (activeTickets.length >= 3) return alert("チケットは3枚までです。");
    if (activeTickets.some(t => t.shopId === shop.id && t.time === time)) return alert("既に予約済みです。");
    
    const limitGroups = shop.capacity || 0; 
    const current = shop.slots?.[time] || 0;
    const remaining = limitGroups - current;

    if (remaining <= 0) return alert("満席です。");
    if (shop.isPaused) return alert("停止中です。");
    
    const maxPeople = shop.groupLimit || 10;

    setPeopleCount(1);
    setDraftBooking({ time, remaining, mode: "slot", maxPeople });
  };

  const handleJoinQueue = (shop: Shop) => {
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

  const handleCancel = async (ticket: Ticket) => {
    if (!confirm("キャンセルしますか？")) return;
    try {
      const shopRef = doc(db, "attractions", ticket.shopId);
      const shopSnap = await getDoc(shopRef);
      if (!shopSnap.exists()) return;
      const shopData = shopSnap.data();

      if (ticket.isQueue) {
         const targetQ = shopData.queue?.find((q: any) => q.ticketId === ticket.ticketId);
         if (targetQ) {
           await updateDoc(shopRef, { queue: arrayRemove(targetQ) });
         }
      } else {
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

  // --- 既存: 入場ロジック (共通処理) ---
  const processEntry = async (ticket: Ticket, inputPass: string) => {
    const shop = attractions.find(s => s.id === ticket.shopId);
    if (!shop) return;
    
    // パスワード照合
    if (inputPass !== shop.password) {
        alert("パスワードが違います（QRコードが異なる可能性があります）");
        return;
    }

    try {
      const shopRef = doc(db, "attractions", shop.id);
      
      if (ticket.isQueue) {
        const targetQ = shop.queue?.find((q: any) => q.ticketId === ticket.ticketId);
        if(targetQ) await updateDoc(shopRef, { queue: arrayRemove(targetQ) });
      } else {
        const oldRes = shop.reservations?.find((r: any) => r.userId === userId && r.time === ticket.time && r.status === "reserved");
        if(oldRes) {
            await updateDoc(shopRef, { reservations: arrayRemove(oldRes) });
            await updateDoc(shopRef, { reservations: arrayUnion({ ...oldRes, status: "used" }) });
        }
      }
      
      alert(`「${shop.name}」に入場しました！`);
      setQrTicket(null); // QRカメラを閉じる
    } catch(e) {
      console.error(e);
      alert("エラーが発生しました。");
    }
  };

  const handleManualEnter = (ticket: Ticket) => {
    const shop = attractions.find(s => s.id === ticket.shopId);
    if (!shop) return;
    if (ticket.isQueue && ticket.status !== 'ready') return alert("まだ呼び出しされていません。");

    const inputPass = prompt(`${shop.name}のスタッフパスワードを入力：`);
    if (inputPass === null) return; // キャンセル時
    processEntry(ticket, inputPass);
  };

  const handleQrScan = (result: any) => {
    if (result && qrTicket) {
        const scannedPassword = result?.text || result;
        processEntry(qrTicket, scannedPassword);
    }
  };

  // --- ★追加機能: Module 3 (注文トランザクション) ---
  const handleAddToCart = (item: MenuItem) => {
      setCart(prev => {
          const currentQty = prev[item.id] || 0;
          if (currentQty >= item.limit) {
              alert(`お一人様${item.limit}個までです`);
              return prev;
          }
          if (currentQty >= item.stock) {
              alert(`在庫上限です`);
              return prev;
          }
          return { ...prev, [item.id]: currentQty + 1 };
      });
  };

  const handleRemoveFromCart = (itemId: string) => {
      setCart(prev => {
          const newCart = { ...prev };
          if (newCart[itemId] > 1) {
              newCart[itemId]--;
          } else {
              delete newCart[itemId];
          }
          return newCart;
      });
  };

  const submitOrder = async () => {
      const cartItemIds = Object.keys(cart);
      if (cartItemIds.length === 0) return;
      if (!confirm("注文を確定しますか？")) return;

      try {
          await runTransaction(db, async (transaction) => {
              const menuRefs = cartItemIds.map(id => doc(db, "menu", id));
              const menuSnaps = await Promise.all(menuRefs.map(ref => transaction.get(ref)));

              // 在庫チェック
              for (const snap of menuSnaps) {
                  if (!snap.exists()) throw "商品が存在しません";
                  const item = snap.data() as MenuItem;
                  const qty = cart[item.id];
                  if (item.stock < qty) {
                      throw `「${item.name}」が在庫切れです（タッチの差で売り切れました）`;
                  }
              }

              // 新規注文データ作成
              const newOrderRef = doc(collection(db, "orders"));
              const orderItems: OrderItem[] = [];
              let totalAmount = 0;

              // 在庫減算処理とOrder構築
              menuSnaps.forEach(snap => {
                  const item = snap.data() as MenuItem;
                  const qty = cart[item.id];
                  
                  // Atomic Increment (Decrement)
                  transaction.update(snap.ref, { stock: increment(-qty) });

                  orderItems.push({
                      id: item.id,
                      name: item.name,
                      price: item.price,
                      quantity: qty
                  });
                  totalAmount += item.price * qty;
              });

              const orderData: any = {
                  orderId: newOrderRef.id,
                  ticketId: newOrderRef.id.slice(-4).toUpperCase(), // 簡易チケット番号
                  userId,
                  items: orderItems,
                  totalAmount,
                  status: 'ordered',
                  createdAt: serverTimestamp()
              };

              transaction.set(newOrderRef, orderData);
          });

          // 成功時
          setCart({});
          alert("注文が完了しました！下にスクロールしてチケットを確認してください。");
      } catch (e: any) {
          console.error(e);
          alert(typeof e === "string" ? e : "注文エラーが発生しました");
      }
  };

  // --- ★追加機能: Module 4 (決済フロー) ---
  const enterPaymentMode = async (orderId: string) => {
      if (!confirm("スタッフに画面を見せる準備はできましたか？")) return;
      try {
          const orderRef = doc(db, "orders", orderId);
          await updateDoc(orderRef, { status: 'paying' });
      } catch (e) {
          alert("エラーが発生しました");
      }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-gray-50 min-h-screen pb-20 relative">
      <header className="mb-6">
        <div className="flex justify-between items-center mb-2">
           <div className="flex items-center gap-2">
               <h1 className="text-xl font-bold text-blue-900">予約・整理券 / 注文</h1>
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
        <NotificationPanel 
            enableSound={enableSound} setEnableSound={setEnableSound}
            enableVibrate={enableVibrate} setEnableVibrate={setEnableVibrate}
            onTestSound={handleTestSound}
        />
      </header>

      {/* --- ★Module 4: 注文チケット表示 --- */}
      {myOrders.length > 0 && (
          <div className="mb-8 space-y-4">
              <p className="text-orange-900 text-sm font-bold">🍔 モバイルオーダー (注文済み)</p>
              {myOrders.map(order => {
                  const createdAtMs = order.createdAt?.toMillis ? order.createdAt.toMillis() : 0;
                  const elapsedMinutes = Math.floor((currentTime - createdAtMs) / 60000);
                  const remainingMinutes = LIMIT_TIME_MINUTES - elapsedMinutes;
                  const isExpired = remainingMinutes < 0;

                  // 支払い提示モード (paying)
                  if (order.status === 'paying') {
                      return (
                          <div key={order.id} className="p-6 bg-yellow-400 text-black rounded-xl border-4 border-yellow-600 shadow-xl animate-pulse">
                              <h3 className="text-center font-bold text-2xl mb-2">お会計画面</h3>
                              <p className="text-center text-sm mb-4">スタッフにこの画面をご提示ください</p>
                              <div className="bg-white p-4 rounded text-center mb-4">
                                  <div className="text-4xl font-mono font-bold mb-2">¥{order.totalAmount}</div>
                                  <div className="text-xl font-mono">No. {order.ticketId}</div>
                              </div>
                              <p className="text-xs text-center">※完了操作はスタッフが行います</p>
                          </div>
                      );
                  }

                  // 受渡完了 (completed)
                  if (order.status === 'completed') {
                      return (
                        <div key={order.id} className="p-4 bg-gray-200 text-gray-500 rounded-xl border border-gray-300">
                             <div className="flex justify-between items-center">
                                <span className="font-bold">受取完了</span>
                                <span className="text-xs">{new Date(createdAtMs).toLocaleTimeString()}</span>
                             </div>
                             <div className="text-sm mt-1">合計: ¥{order.totalAmount}</div>
                        </div>
                      );
                  }
                  
                  // 強制キャンセル (force_cancelled)
                  if (order.status === 'force_cancelled') {
                      return (
                        <div key={order.id} className="p-4 bg-red-100 text-red-800 rounded-xl border border-red-300">
                             <div className="font-bold mb-1">期限切れキャンセル</div>
                             <p className="text-xs">受取期限を過ぎたためキャンセルされました。</p>
                        </div>
                      );
                  }

                  // ユーザーキャンセル (cancelled)
                  if (order.status === 'cancelled') return null;

                  // 通常注文確約 (ordered)
                  return (
                      <div key={order.id} className={`p-4 bg-white rounded-xl shadow-sm border-l-4 ${isExpired ? 'border-red-500 bg-red-50' : 'border-orange-500'}`}>
                          <div className="flex justify-between items-start mb-2">
                              <div>
                                  <span className="font-bold text-lg text-orange-600">No. {order.ticketId}</span>
                                  <div className="text-xs text-gray-500">{new Date(createdAtMs).toLocaleTimeString()} 注文</div>
                              </div>
                              <div className="text-right">
                                  <span className="block font-bold">¥{order.totalAmount}</span>
                              </div>
                          </div>
                          
                          <div className="border-t border-dashed my-2 pt-2 text-sm text-gray-700">
                              {order.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between">
                                      <span>{item.name} x{item.quantity}</span>
                                  </div>
                              ))}
                          </div>

                          {/* カウントダウンタイマー */}
                          <div className={`mt-3 text-center p-2 rounded font-bold ${isExpired ? 'bg-red-200 text-red-800' : 'bg-orange-100 text-orange-800'}`}>
                              {isExpired ? (
                                  <span>⚠️ 受取期限を過ぎています<br/><span className="text-xs font-normal">スタッフに状況をお伝えください</span></span>
                              ) : (
                                  <span>受取期限まで残り {remainingMinutes}分</span>
                              )}
                          </div>

                          <button 
                              onClick={() => enterPaymentMode(order.id)}
                              className="mt-3 w-full bg-orange-600 text-white font-bold py-3 rounded-lg shadow hover:bg-orange-700 transition"
                          >
                              お支払いへ進む
                              <span className="block text-xs font-normal opacity-80">(スタッフに見せる)</span>
                          </button>
                      </div>
                  );
              })}
          </div>
      )}

      {/* --- ★Module 3: メニュー表示・カート --- */}
      {menuList.length > 0 && (
          <div className="mb-8">
              <h2 className="text-lg font-bold text-gray-700 mb-2 border-b pb-1">🍴 フード・物販メニュー</h2>
              
              <div className="grid gap-4">
                  {menuList.map(item => {
                      const inCart = cart[item.id] || 0;
                      const isSoldOut = item.stock <= 0;
                      
                      return (
                          <div key={item.id} className={`flex justify-between items-center p-3 bg-white rounded-lg shadow-sm ${isSoldOut ? 'opacity-60 grayscale' : ''}`}>
                              <div>
                                  <div className="font-bold text-lg">{item.name}</div>
                                  <div className="text-gray-600">¥{item.price} <span className="text-xs text-gray-400">(残: {item.stock})</span></div>
                                  {isSoldOut && <span className="text-red-600 font-bold text-xs">SOLD OUT</span>}
                              </div>
                              
                              <div className="flex items-center gap-3">
                                  {inCart > 0 && (
                                      <>
                                          <button onClick={() => handleRemoveFromCart(item.id)} className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 font-bold">-</button>
                                          <span className="font-bold w-4 text-center">{inCart}</span>
                                      </>
                                  )}
                                  <button 
                                      onClick={() => handleAddToCart(item)} 
                                      disabled={isSoldOut}
                                      className={`w-8 h-8 rounded-full font-bold text-white ${isSoldOut ? 'bg-gray-400' : 'bg-blue-600'}`}
                                  >
                                      +
                                  </button>
                              </div>
                          </div>
                      );
                  })}
              </div>

              {/* カート注文ボタン */}
              {Object.keys(cart).length > 0 && (
                  <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50">
                      <div className="max-w-md mx-auto">
                        <button 
                            onClick={submitOrder}
                            className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-blue-700 transition flex justify-between px-6"
                        >
                            <span>注文を確定する</span>
                            <span>
                                Total: ¥{Object.keys(cart).reduce((sum, id) => {
                                    const item = menuList.find(m => m.id === id);
                                    return sum + (item ? item.price * cart[id] : 0);
                                }, 0)}
                            </span>
                        </button>
                      </div>
                  </div>
              )}
          </div>
      )}

      {/* 既存: チケット一覧 (Attractions) */}
      {activeTickets.length > 0 && (
        <div className="mb-8 space-y-4">
          <p className="text-blue-900 text-sm font-bold">🎟️ アトラクション予約</p>
          {activeTickets.map((t) => (
            <TicketCard 
                key={t.uniqueKey} 
                t={t} 
                onManualEnter={handleManualEnter}
                onCancel={handleCancel}
                onOpenQr={setQrTicket}
            />
          ))}
        </div>
      )}

      {/* 店舗選択リスト または 詳細画面 (Attractions) */}
      {!selectedShop ? (
        <ShopList shops={attractions} onSelect={setSelectedShop} />
      ) : (
        <ShopDetail 
            shop={selectedShop} 
            activeTickets={activeTickets}
            onBack={() => { setSelectedShop(null); setDraftBooking(null); }}
            onSelectTime={handleSelectTime}
            onJoinQueue={handleJoinQueue}
        />
      )}
      
      {/* 申し込み確認モーダル */}
      {draftBooking && selectedShop && (
        <BookingModal 
            draftBooking={draftBooking}
            shopName={selectedShop.name}
            shopDepartment={selectedShop.department}
            peopleCount={peopleCount}
            setPeopleCount={setPeopleCount}
            onCancel={() => setDraftBooking(null)}
            onConfirm={handleConfirmBooking}
        />
      )}

      {/* QRコードリーダー モーダル */}
      {qrTicket && (
          <QrModal onScan={handleQrScan} onClose={() => setQrTicket(null)} />
      )}

    </div>
  );
}
