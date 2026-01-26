// app/page.tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebase"; // パスは環境に合わせて調整してください
import { 
  collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, 
  increment, getDoc, setDoc, serverTimestamp, Timestamp, 
  query, where, runTransaction, collectionGroup, orderBy 
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { Ticket, Shop, DraftBooking } from "./types";
import { NotificationPanel, TicketCard, ShopList, ShopDetail, BookingModal, QrModal } from "./components";

// --- Types for Order System ---
type MenuItem = {
  id: string;
  name: string;
  price: number;
  stock: number;
  limit: number;
};

type CartItem = MenuItem & {
  quantity: number;
};

type Order = {
  id: string;
  ticketId: string;
  shopId: string;
  shopName: string;
  userId: string;
  items: { name: string; price: number; quantity: number }[];
  totalAmount: number;
  status: 'paying' | 'ordered' | 'completed' | 'cancelled';
  createdAt: any;
  isDelayed?: boolean;
};

export default function Home() {
  const [attractions, setAttractions] = useState<Shop[]>([]);
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [userId, setUserId] = useState("");
  const [isBanned, setIsBanned] = useState(false);

  // --- Order System State ---
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isOrderMode, setIsOrderMode] = useState(false);
  const [myOrders, setMyOrders] = useState<Order[]>([]);

  // ★通知設定（デフォルトOFF）
  const [enableSound, setEnableSound] = useState(false);
  const [enableVibrate, setEnableVibrate] = useState(false);

  // ★QRコード関連のステート
  const [qrTicket, setQrTicket] = useState<Ticket | null>(null);

  // 音声再生用の参照 (Web Audio API)
  const audioCtxRef = useRef<AudioContext | null>(null);

  // 申し込み画面用の状態
  const [draftBooking, setDraftBooking] = useState<DraftBooking | null>(null);
  const [peopleCount, setPeopleCount] = useState<number>(1);

  // ★音を鳴らす関数
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

  // ★音量テストボタン用
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
      const shopData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Shop));
      setAttractions(shopData);
    });

    // 自分の予約/順番待ちチケットの監視 (既存ロジック)
    // NOTE: attractionsが更新されるたびに再計算される
    const updateMyTickets = (shops: Shop[], orders: Order[]) => {
       const newMyTickets: Ticket[] = [];
      
       // 1. 予約・順番待ち
       shops.forEach((shop: Shop) => {
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
                timestamp: q.createdAt?.toMillis ? q.createdAt.toMillis() : Date.now(),
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

      // 2. 注文 (Order System) をチケットとして統合
      orders.forEach(order => {
        // status mapping: paying -> ready(ish), ordered -> waiting
        let displayStatus = 'waiting';
        if (order.status === 'paying') displayStatus = 'ready'; // 会計待ちは目立たせる
        if (order.status === 'completed') displayStatus = 'used';
        if (order.status === 'cancelled') displayStatus = 'cancelled';

        newMyTickets.push({
            uniqueKey: `order_${order.id}`,
            shopId: order.shopId,
            shopName: order.shopName,
            shopDepartment: 'Mobile Order',
            time: `注文: ¥${order.totalAmount}`,
            timestamp: order.createdAt?.toMillis ? order.createdAt.toMillis() : Date.now(),
            status: displayStatus,
            count: 1,
            isQueue: true, // UI流用のため
            ticketId: order.ticketId,
            peopleAhead: 0 // Order does not show people ahead
        });
      });

      newMyTickets.sort((a, b) => {
        // 会計待ち(paying mapped to ready)を最優先
        if (a.status === 'ready' && b.status !== 'ready') return -1;
        if (a.status !== 'ready' && b.status === 'ready') return 1;
        return b.timestamp - a.timestamp;
      });

      setMyTickets(newMyTickets);
    };

    // attractions更新時にチケット再計算 (ordersはまだ空かもだが)
    updateMyTickets(attractions, myOrders);
    
    // orders監視: collectionGroupを使って全店舗の自分の注文を取得
    const q = query(collectionGroup(db, 'orders'), where('userId', '==', storedId), orderBy('createdAt', 'desc'));
    const unsubOrders = onSnapshot(q, (snapshot) => {
        const myOrdersData = snapshot.docs.map(d => {
            // 親のshop情報を取得できないため、Order作成時にshopNameを埋め込む設計とする
            // または attractions から id で引く
            const data = d.data();
            const shop = attractions.find(s => s.id === d.ref.parent.parent?.id);
            return { 
                id: d.id, 
                shopId: d.ref.parent.parent?.id || '', 
                shopName: shop?.name || '不明な店舗', 
                ...data 
            } as Order;
        });
        setMyOrders(myOrdersData);
        // attractionsとorders両方が揃った状態で更新したいが、
        // 簡易的にここでも呼ぶ (attractionsはstate参照)
        // Note: closure問題を防ぐため useEffectの依存配列で管理
    });

    return () => {
        unsubUser();        
        unsubAttractions(); 
        unsubOrders();
    };
  }, []);

  // attractions または myOrders が変わったらチケットリストを更新
  useEffect(() => {
     if (!userId) return;
     
     // updateMyTicketsロジックの再定義(依存解決のため)
     const generateTickets = () => {
        const newMyTickets: Ticket[] = [];
        // (Reservation/Queue Logic)
        attractions.forEach((shop: Shop) => {
            if (shop.reservations) {
                shop.reservations.forEach((r: any) => {
                    if (r.userId === userId) {
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
                    if (q.userId === userId) {
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
                            timestamp: q.createdAt?.toMillis ? q.createdAt.toMillis() : Date.now(),
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
        // (Order Logic)
        myOrders.forEach(order => {
             // shopNameの補完
             const shop = attractions.find(s => s.id === order.shopId);
             const shopName = shop ? shop.name : (order.shopName || "店舗");

             let displayStatus = 'waiting';
             let timeLabel = `注文: ¥${order.totalAmount}`;
             
             if (order.status === 'paying') {
                 displayStatus = 'ready'; // 会計待ち（黄色）
                 timeLabel = "会計へお越しください";
             } else if (order.status === 'ordered') {
                 displayStatus = 'waiting'; // 調理中
                 timeLabel = "調理中";
             } else if (order.status === 'completed') {
                 displayStatus = 'used';
             } else {
                 displayStatus = 'cancelled';
             }

             newMyTickets.push({
                 uniqueKey: `order_${order.id}`,
                 shopId: order.shopId,
                 shopName: shopName,
                 shopDepartment: 'Mobile Order',
                 time: timeLabel,
                 timestamp: order.createdAt?.toMillis ? order.createdAt.toMillis() : Date.now(),
                 status: displayStatus,
                 count: 1,
                 isQueue: true,
                 ticketId: order.ticketId,
                 peopleAhead: -1 // Special flag
             });
        });

        newMyTickets.sort((a, b) => {
            if (a.status === 'ready' && b.status !== 'ready') return -1;
            if (a.status !== 'ready' && b.status === 'ready') return 1;
            return b.timestamp - a.timestamp;
        });
        setMyTickets(newMyTickets);
     };
     generateTickets();
  }, [attractions, myOrders, userId]);


  // --- Order System: Fetch Menu ---
  useEffect(() => {
    if (selectedShop) {
        // メニューの取得
        const unsubMenu = onSnapshot(collection(db, "attractions", selectedShop.id, "menu"), (snap) => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem));
            // 在庫があるもの、または表示設定に合わせてフィルタリング
            setMenuItems(items);
        });
        // カートリセット
        setCart([]);
        setIsOrderMode(false);
        return () => unsubMenu();
    }
  }, [selectedShop]);


  const activeTickets = myTickets.filter(t => ["reserved", "waiting", "ready"].includes(t.status));

  // ★通知ループ処理
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

  // --- Order System Logic ---
  
  const addToCart = (item: MenuItem) => {
    setCart(prev => {
        const existing = prev.find(i => i.id === item.id);
        if (existing) {
            // 在庫数チェック（クライアントサイドの簡易チェック）
            if (existing.quantity >= item.stock) return prev;
            return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
        }
        return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
        const existing = prev.find(i => i.id === itemId);
        if (existing && existing.quantity > 1) {
            return prev.map(i => i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i);
        }
        return prev.filter(i => i.id !== itemId);
    });
  };

  const submitOrder = async () => {
    if (!selectedShop || cart.length === 0) return;
    if (activeTickets.length >= 3) return alert("チケット上限に達しています。既存の注文や予約を完了させてください。");
    
    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (!confirm(`注文を確定しますか？\n合計: ¥${totalAmount}\n※注文後、カウンターで会計を行ってください。`)) return;

    try {
        await runTransaction(db, async (transaction) => {
            const shopId = selectedShop.id;
            
            // 1. 在庫チェック & 減算
            for (const item of cart) {
                const itemRef = doc(db, "attractions", shopId, "menu", item.id);
                const itemDoc = await transaction.get(itemRef);
                if (!itemDoc.exists()) throw "商品が存在しません: " + item.name;
                
                const currentStock = itemDoc.data().stock;
                if (currentStock < item.quantity) {
                    throw "在庫切れの商品があります: " + item.name;
                }
                transaction.update(itemRef, { stock: currentStock - item.quantity });
            }

            // 2. Ticket ID 発番 (Counter Document)
            const counterRef = doc(db, "attractions", shopId, "counters", "order");
            const counterDoc = await transaction.get(counterRef);
            let nextIdNum = 1;
            if (counterDoc.exists()) {
                nextIdNum = (counterDoc.data().current || 0) + 1;
            }
            transaction.set(counterRef, { current: nextIdNum }, { merge: true });
            
            const ticketId = String(nextIdNum).padStart(6, '0');

            // 3. 注文作成
            const newOrderRef = doc(collection(db, "attractions", shopId, "orders"));
            const orderData = {
                ticketId,
                userId,
                items: cart.map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
                totalAmount,
                status: 'paying', // まずは会計待ち
                createdAt: serverTimestamp()
            };
            transaction.set(newOrderRef, orderData);
        });

        alert("注文を送信しました！\nカウンターで画面を見せて会計してください。");
        setCart([]);
        setIsOrderMode(false);
        setSelectedShop(null); // 一覧に戻る

    } catch (e: any) {
        console.error(e);
        alert("注文に失敗しました: " + (typeof e === 'string' ? e : "エラーが発生しました"));
    }
  };


  const handleCancel = async (ticket: Ticket) => {
    if (!confirm("キャンセルしますか？")) return;
    try {
      const shopRef = doc(db, "attractions", ticket.shopId);
      
      // Order Cancellation
      if (ticket.uniqueKey.startsWith('order_')) {
          const orderId = ticket.uniqueKey.replace('order_', '');
          const orderRef = doc(db, "attractions", ticket.shopId, "orders", orderId);
          await updateDoc(orderRef, { status: 'cancelled' });
          // Note: 在庫復元は仕様上Adminが行うか、ここでCloud Functions/Triggerを使うのが一般的ですが、
          // 簡易実装としてここではステータス変更のみとします（在庫は戻らない）。
          // もし即時戻すならTransactionが必要ですが、コードが複雑になるため省略します。
          alert("注文を取り消しました。");
          return;
      }

      // Existing Ticket/Queue Cancellation
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

  // --- ★入場ロジック (共通処理) ---
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
      
      if (ticket.uniqueKey.startsWith('order_')) {
          // 注文の完了処理は本来Admin（スタッフ）が行うが、ユーザーがQRで完了させる場合
          // Status: paying -> completed (Payment Done & Food Received)
          // 現実的にはスタッフがDashboardで操作するため、ユーザー側でのQR処理は不要かもしれないが実装しておく
          const orderId = ticket.uniqueKey.replace('order_', '');
          await updateDoc(doc(db, "attractions", shop.id, "orders", orderId), { status: 'completed' });
          alert("受取完了を記録しました！");

      } else if (ticket.isQueue) {
        const targetQ = shop.queue?.find((q: any) => q.ticketId === ticket.ticketId);
        if(targetQ) await updateDoc(shopRef, { queue: arrayRemove(targetQ) });
        alert(`「${shop.name}」に入場しました！`);
      } else {
        const oldRes = shop.reservations?.find((r: any) => r.userId === userId && r.time === ticket.time && r.status === "reserved");
        if(oldRes) {
            await updateDoc(shopRef, { reservations: arrayRemove(oldRes) });
            await updateDoc(shopRef, { reservations: arrayUnion({ ...oldRes, status: "used" }) });
        }
        alert(`「${shop.name}」に入場しました！`);
      }
      
      setQrTicket(null); // QRカメラを閉じる
    } catch(e) {
      console.error(e);
      alert("エラーが発生しました。");
    }
  };

  // ★手動入力での入場
  const handleManualEnter = (ticket: Ticket) => {
    const shop = attractions.find(s => s.id === ticket.shopId);
    if (!shop) return;
    if (ticket.status === 'waiting' && !ticket.uniqueKey.startsWith('order_')) return alert("まだ呼び出しされていません。");
    if (ticket.uniqueKey.startsWith('order_') && ticket.status !== 'ready') return alert("会計待ちの状態ではありません。");

    const inputPass = prompt(`${shop.name}のスタッフパスワードを入力：`);
    if (inputPass === null) return; // キャンセル時
    processEntry(ticket, inputPass);
  };

  // ★QRスキャン完了時の処理
  const handleQrScan = (result: any) => {
    if (result && qrTicket) {
        const scannedPassword = result?.text || result;
        processEntry(qrTicket, scannedPassword);
    }
  };

  // --- Render ---

  return (
    <div className="max-w-md mx-auto p-4 bg-gray-50 min-h-screen pb-20 relative">
      <header className="mb-6">
        <div className="flex justify-between items-center mb-2">
           <div className="flex items-center gap-2">
               <h1 className="text-xl font-bold text-blue-900">予約・整理券 & 注文</h1>
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

      {/* チケット一覧 */}
      {activeTickets.length > 0 && (
        <div className="mb-8 space-y-4">
          <p className="text-blue-900 text-sm font-bold">🎟️ あなたのチケット / 注文</p>
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

      {/* 店舗選択リスト または 詳細画面 */}
      {!selectedShop ? (
        <ShopList shops={attractions} onSelect={setSelectedShop} />
      ) : (
        <div className="bg-white rounded-xl p-4 shadow-lg border border-gray-200">
             <button onClick={() => { setSelectedShop(null); setDraftBooking(null); setIsOrderMode(false); }} className="mb-4 text-sm text-gray-500 hover:text-gray-800">
                ← 戻る
             </button>
            
            {!isOrderMode ? (
                // 通常モード（店舗詳細・予約・注文入り口）
                <>
                    <ShopDetail 
                        shop={selectedShop} 
                        activeTickets={activeTickets}
                        onBack={() => { /* Handled above */ }} 
                        onSelectTime={handleSelectTime}
                        onJoinQueue={handleJoinQueue}
                    />
                    
                    {/* 注文機能への入り口: menuコレクションがある場合のみ表示したいが、簡易的にボタンを表示 */}
                    {/* ※実際の運用ではshopにhasMenuフラグなどを持たせるのが良い */}
                    <div className="mt-6 pt-6 border-t border-dashed border-gray-300">
                        <h3 className="font-bold text-gray-800 mb-2">🍔 モバイルオーダー</h3>
                        <p className="text-xs text-gray-500 mb-3">並ばずにスマホから商品を注文し、カウンターで受け取れます。</p>
                        <button 
                            onClick={() => setIsOrderMode(true)}
                            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-lg shadow transition flex items-center justify-center gap-2"
                        >
                            <span>🍽️ メニューを見て注文する</span>
                        </button>
                    </div>
                </>
            ) : (
                // 注文モード（メニュー一覧 & カート）
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <h2 className="text-lg font-bold text-orange-600 mb-4 flex items-center justify-between">
                        <span>{selectedShop.name} メニュー</span>
                        <span className="text-xs text-black bg-orange-100 px-2 py-1 rounded">先払い制</span>
                    </h2>

                    <div className="space-y-3 mb-20">
                        {menuItems.length === 0 && <p className="text-gray-500 text-center py-4">メニュー読み込み中、または商品がありません。</p>}
                        {menuItems.map(item => {
                            const inCart = cart.find(c => c.id === item.id);
                            const qty = inCart ? inCart.quantity : 0;
                            const isSoldOut = item.stock <= 0;

                            return (
                                <div key={item.id} className={`flex justify-between items-center p-3 rounded border ${isSoldOut ? 'bg-gray-100 border-gray-200 opacity-60' : 'bg-white border-orange-100'}`}>
                                    <div>
                                        <div className="font-bold text-gray-800">{item.name}</div>
                                        <div className="text-sm text-gray-500">¥{item.price} <span className="text-xs ml-2 text-gray-400">残: {item.stock}</span></div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {isSoldOut ? (
                                            <span className="text-red-500 font-bold text-xs">売り切れ</span>
                                        ) : (
                                            <>
                                                {qty > 0 && (
                                                    <>
                                                        <button onClick={() => removeFromCart(item.id)} className="w-8 h-8 bg-gray-200 rounded-full text-gray-600 font-bold">-</button>
                                                        <span className="font-bold w-4 text-center">{qty}</span>
                                                    </>
                                                )}
                                                <button onClick={() => addToCart(item)} className="w-8 h-8 bg-orange-500 text-white rounded-full font-bold shadow">+</button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* カートフッター */}
                    {cart.length > 0 && (
                        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-xl z-50 safe-area-bottom">
                            <div className="max-w-md mx-auto flex justify-between items-center">
                                <div>
                                    <div className="text-xs text-gray-500">合計 {cart.reduce((a,c)=>a+c.quantity,0)}点</div>
                                    <div className="text-xl font-bold text-gray-900">¥{cart.reduce((a,c)=>a+(c.price*c.quantity),0).toLocaleString()}</div>
                                </div>
                                <button onClick={submitOrder} className="bg-black text-white px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-gray-800 transition">
                                    注文を確定する
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
      )}
      
      {/* 申し込み確認モーダル (既存) */}
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

      {/* ★QRコードリーダー モーダル */}
      {qrTicket && (
          <QrModal onScan={handleQrScan} onClose={() => setQrTicket(null)} />
      )}

    </div>
  );
}
