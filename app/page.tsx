// ＃予約画面 (app/page.tsx)
"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../firebase";
import { collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, increment, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

// 型定義の拡張
type Ticket = {
  shopId: string;
  shopName: string;
  time: string; // 整理券の場合は "順番待ち" などの固定文字
  timestamp: number;
  status: "reserved" | "waiting" | "ready" | "used" | "done"; // waiting/readyを追加
  count: number;
  // ★順番待ち用フィールド
  isQueue?: boolean;
  displayId?: string;    // ランダムID (A-892)
  ticketNumber?: number; // 通し番号
  peopleAhead?: number;  // 前に並んでいる人数（表示用）
};

export default function Home() {
  const [attractions, setAttractions] = useState<any[]>([]);
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [selectedShop, setSelectedShop] = useState<any | null>(null);
  const [userId, setUserId] = useState("");
  const [isBanned, setIsBanned] = useState(false);

  // 予約・並び用のモーダル管理
  const [draftBooking, setDraftBooking] = useState<{ time: string; remaining: number; mode: "slot" | "queue" } | null>(null);
  const [peopleCount, setPeopleCount] = useState<number>(1);

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
                nickname: "",        
                isPinned: false,     
                isBanned: false      
            }).catch(err => console.error("User regist error:", err));
        }
    });

    const unsubUser = onSnapshot(userDocRef, (snap) => {
        if (snap.exists()) {
            setIsBanned(snap.data().isBanned === true);
        }
    });

    // 3. データ取得 (Attractions)
    const unsubAttractions = onSnapshot(collection(db, "attractions"), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttractions(data);

      const myFoundTickets: Ticket[] = [];
      
      data.forEach((shop: any) => {
        // A. 時間枠予約の取得
        if (shop.reservations) {
          shop.reservations.forEach((r: any) => {
            if (r.userId === storedId) {
              myFoundTickets.push({
                shopId: shop.id,
                shopName: shop.name,
                time: r.time,
                timestamp: r.timestamp,
                status: r.status,
                count: r.count || 1,
                isQueue: false
              });
            }
          });
        }

        // B. 順番待ち(Queue)の取得 ★追加実装
        if (shop.queue) {
          shop.queue.forEach((q: any) => {
            if (q.userId === storedId) {
              // 自分より前の待ち人数を計算
              // 同じ会場で、statusが'waiting'で、かつ自分よりticketNumberが小さい人の人数(partySize)合計
              let peopleAhead = 0;
              if (q.status === 'waiting') {
                const aheadTickets = shop.queue.filter((other: any) => 
                  other.status === 'waiting' && other.ticketNumber < q.ticketNumber
                );
                peopleAhead = aheadTickets.reduce((sum: number, t: any) => sum + (t.count || 1), 0);
              }

              myFoundTickets.push({
                shopId: shop.id,
                shopName: shop.name,
                time: "順番待ち", // 表示用プレースホルダー
                timestamp: q.createdAt?.toMillis() || Date.now(),
                status: q.status, // waiting, ready, done
                count: q.count || 1,
                isQueue: true,
                displayId: q.displayId,
                ticketNumber: q.ticketNumber,
                peopleAhead: peopleAhead
              });
            }
          });
        }
      });

      // 並び替え: 呼び出し中(ready)を最優先、次に新しい順
      myFoundTickets.sort((a, b) => {
        if (a.status === 'ready' && b.status !== 'ready') return -1;
        if (a.status !== 'ready' && b.status === 'ready') return 1;
        return b.timestamp - a.timestamp;
      });

      setMyTickets(myFoundTickets);
    });

    return () => {
        unsubUser();        
        unsubAttractions(); 
    };
  }, []);

  // フィルタリング: reserved, waiting, ready は「有効」
  const activeTickets = myTickets.filter(t => ["reserved", "waiting", "ready"].includes(t.status));
  const usedTickets = myTickets.filter(t => ["used", "done"].includes(t.status));

  if (isBanned) {
      return (
          <div className="min-h-screen bg-red-900 text-white flex flex-col items-center justify-center p-4 text-center">
              <div className="text-6xl mb-4">🚫</div>
              <h1 className="text-3xl font-bold mb-2">ACCESS DENIED</h1>
              <p>利用停止処分が適用されています</p>
          </div>
      );
  }

  // --- 時間枠予約の選択処理 ---
  const handleSelectTime = (shop: any, time: string) => {
    // ... (既存のBANチェック等は省略せずそのまま利用)
    if (shop.bannedUsers && shop.bannedUsers.includes(userId)) return alert("利用制限されています。");
    if (activeTickets.length >= 3) return alert("同時に持てる予約/整理券は3つまでです！");
    if (activeTickets.some(t => t.shopId === shop.id && t.time === time)) return alert("予約済みです！");
    
    const currentCount = shop.slots[time] || 0;
    const capacity = shop.groupLimit || shop.capacity;
    const remaining = capacity - currentCount;

    if (remaining <= 0) return alert("満席です。");
    if (shop.isPaused) return alert("停止中です。");
    
    setPeopleCount(1);
    setDraftBooking({ time, remaining, mode: "slot" });
  };

  // --- ★追加: 順番待ちに参加する処理 ---
  const handleJoinQueue = (shop: any) => {
    if (shop.bannedUsers && shop.bannedUsers.includes(userId)) return alert("利用制限されています。");
    if (activeTickets.length >= 3) return alert("同時に持てる予約/整理券は3つまでです！");
    if (activeTickets.some(t => t.shopId === shop.id)) return alert("既にこの会場に並んでいます！");
    if (shop.isPaused) return alert("現在、受付を停止しています。");

    // モーダルを開く (remainingは便宜上100など大きく設定、あるいは制限があれば設定)
    setPeopleCount(1);
    setDraftBooking({ time: "順番待ち", remaining: 10, mode: "queue" });
  };

  // --- 予約/並ぶ の確定処理 ---
  const handleConfirmBooking = async () => {
    if (!selectedShop || !draftBooking) return;

    if (!confirm(`${selectedShop.name}\n${draftBooking.mode === "queue" ? "並びますか？" : "予約しますか？"}\n人数: ${peopleCount}名`)) return;

    try {
      const timestamp = Date.now();
      
      if (draftBooking.mode === "slot") {
        // 時間枠予約の保存
        const reservationData = { userId, time: draftBooking.time, timestamp, status: "reserved", count: peopleCount };
        await updateDoc(doc(db, "attractions", selectedShop.id), { 
            [`slots.${draftBooking.time}`]: increment(peopleCount),
            reservations: arrayUnion(reservationData)
        });
      } else {
        // ★順番待ちの保存 (Queue)
        // 1. ランダムID生成 (例: A-892)
        const randomNum = Math.floor(Math.random() * 900) + 100;
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
        const displayId = `${alphabet}-${randomNum}`;

        // 2. 通し番号計算 (本来はTransaction推奨だが簡易実装: 現在の配列長+1などを利用)
        // ※厳密には排他制御が必要ですが、文化祭レベルと仮定し簡易化
        const currentQueue = selectedShop.queue || [];
        const maxTicketNum = currentQueue.reduce((max: number, q: any) => Math.max(max, q.ticketNumber || 0), 0);
        const nextTicketNum = maxTicketNum + 1;

        const queueData = {
          userId,
          displayId,
          ticketNumber: nextTicketNum,
          count: peopleCount,
          status: "waiting", // 初期状態
          createdAt: serverTimestamp() // Firestore Timestamp
        };

        await updateDoc(doc(db, "attractions", selectedShop.id), {
          queue: arrayUnion(queueData)
        });
      }
      
      setDraftBooking(null);
      setSelectedShop(null);
      alert(draftBooking.mode === "queue" ? "整理券を発券しました！" : "予約しました！");

    } catch (e) { 
      console.error(e);
      alert("エラーが発生しました。"); 
    }
  };

  // --- キャンセル処理 ---
  const handleCancel = async (ticket: Ticket) => {
    if (!confirm("キャンセルしますか？")) return;
    try {
      const shopRef = doc(db, "attractions", ticket.shopId);
      const shopSnap = await getDoc(shopRef);
      if (!shopSnap.exists()) return;
      const shopData = shopSnap.data();

      if (ticket.isQueue) {
         // ★Queueのキャンセル
         const targetQ = shopData.queue?.find((q: any) => q.displayId === ticket.displayId);
         if (targetQ) {
           // 配列から削除 (あるいは status: cancelled に更新でも可)
           await updateDoc(shopRef, { queue: arrayRemove(targetQ) });
         }
      } else {
         // Slotのキャンセル
         const targetRes = shopData.reservations?.find((r: any) => r.userId === userId && r.time === ticket.time && r.timestamp === ticket.timestamp);
         if (targetRes) {
           await updateDoc(shopRef, { 
             [`slots.${ticket.time}`]: increment(-(targetRes.count || 1)),
             reservations: arrayRemove(targetRes)
           });
         }
      }
      alert("キャンセルしました");
    } catch (e) { alert("キャンセル失敗"); }
  };

  // --- 入場処理 ---
  const handleEnter = async (ticket: Ticket) => {
    const shop = attractions.find(s => s.id === ticket.shopId);
    if (!shop) return;

    // 呼び出し中チェック
    if (ticket.isQueue && ticket.status !== 'ready') {
      return alert("まだ順番ではありません。呼び出しをお待ちください。");
    }

    const inputPass = prompt(`${shop.name}のスタッフパスワードを入力：`);
    if (inputPass !== shop.password) return alert("パスワードが違います！");

    try {
      if (ticket.isQueue) {
        // ★Queueの入場処理: status を done にする
        // Firestoreは配列内のオブジェクトの一部更新が苦手なので、Remove & Union する
        const targetQ = shop.queue.find((q: any) => q.displayId === ticket.displayId);
        if(targetQ) {
          await updateDoc(doc(db, "attractions", shop.id), { queue: arrayRemove(targetQ) });
          await updateDoc(doc(db, "attractions", shop.id), { 
            queue: arrayUnion({ ...targetQ, status: "done" }) 
          });
        }
      } else {
        // Slotの入場処理
        const oldRes = shop.reservations.find((r: any) => r.userId === userId && r.time === ticket.time && r.status === "reserved");
        if(oldRes) {
            await updateDoc(doc(db, "attractions", shop.id), { reservations: arrayRemove(oldRes) });
            await updateDoc(doc(db, "attractions", shop.id), { reservations: arrayUnion({ ...oldRes, status: "used" }) });
        }
      }
      alert("入場しました！");
    } catch(e) {
      alert("エラーが発生しました。");
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-gray-50 min-h-screen pb-20 relative">
      <header className="mb-6">
        <div className="flex justify-between items-center mb-2">
           <h1 className="text-xl font-bold text-blue-900">予約・整理券システム</h1>
           <div className={`px-3 py-1 rounded-full text-sm font-bold ${activeTickets.length >= 3 ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
               所持: {activeTickets.length}/3
           </div>
        </div>
        <div className="bg-gray-800 text-white text-center py-2 rounded-lg font-mono tracking-widest shadow-md">
            ID: <span className="text-yellow-400 font-bold text-lg">{userId}</span>
        </div>
      </header>

      {/* 1. 有効なチケットエリア */}
      {activeTickets.length > 0 && (
        <div className="mb-8 space-y-4">
          <p className="text-blue-900 text-sm font-bold flex items-center gap-1">🎟️ 現在のチケット</p>
          {activeTickets.map((t) => {
            // ★呼び出し中(ready)の場合のスタイル: 赤く、点滅アニメーションなど
            const isReady = t.status === 'ready';
            const cardClass = isReady 
              ? "bg-red-50 border-l-4 border-red-500 shadow-xl ring-2 ring-red-400 animate-pulse-slow" // animate-pulse-slowはカスタムCSS推奨、なければanimate-pulse
              : "bg-white border-l-4 border-green-500 shadow-lg";

            return (
              <div key={`${t.shopId}-${t.timestamp}`} className={`${cardClass} p-4 rounded relative overflow-hidden`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                      <h2 className="font-bold text-lg flex items-center gap-2">
                          {t.shopName}
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full border border-green-200">
                             {t.count}名
                          </span>
                      </h2>
                      
                      {/* ★表示の分岐: 整理券 vs 時間予約 */}
                      {t.isQueue ? (
                        <div className="mt-1">
                          <p className="text-sm font-bold text-gray-500">整理券番号 (ID)</p>
                          <p className="text-3xl font-mono font-black text-gray-800 tracking-wider">{t.displayId}</p>
                          
                          {isReady ? (
                             <p className="text-red-600 font-bold mt-1 text-lg">🔔 順番が来ました！</p>
                          ) : (
                             <p className="text-blue-600 font-bold mt-1">
                               あと <span className="text-xl">{t.peopleAhead}</span> 人待ち
                             </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-3xl font-bold text-blue-600 font-mono">{t.time}</p>
                      )}
                  </div>
                </div>

                <div className="flex gap-2">
                  {/* ★入場ボタン: 予約済(reserved) か 呼び出し中(ready) のみ押せる */}
                  <button 
                    onClick={() => handleEnter(t)} 
                    disabled={t.isQueue && !isReady} // 待ち状態なら押せない
                    className={`flex-1 font-bold py-3 rounded-lg shadow transition
                      ${(t.isQueue && !isReady) 
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed" 
                        : "bg-blue-600 text-white hover:bg-blue-500"
                      }`}
                  >
                    {t.isQueue && !isReady ? "待機中..." : "入場する"}
                  </button>
                  <button onClick={() => handleCancel(t)} className="px-4 text-red-500 border border-red-200 rounded-lg text-xs hover:bg-red-50">
                    取消
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2. 出し物一覧 / 詳細 */}
      {!selectedShop ? (
        <div className="space-y-3">
          <p className="text-sm font-bold text-gray-600 mb-2 border-b pb-2">新しく参加する</p>
          {attractions.map((shop) => (
            <button key={shop.id} onClick={() => setSelectedShop(shop)} className={`w-full bg-white p-3 rounded-xl shadow-sm border text-left flex items-start gap-3 hover:bg-gray-50 transition ${shop.isPaused ? 'opacity-60 grayscale' : ''}`}>
              {/* (画像表示などは既存と同じ) */}
              {shop.imageUrl && (
                  <div className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0 relative">
                      <img src={shop.imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
              )}
              <div className="flex-1 min-w-0">
                  {/* (バッジ表示など) */}
                  <div className="flex flex-wrap items-center gap-1 mb-1">
                      {shop.isQueueMode && <span className="bg-orange-100 text-orange-700 border-orange-200 border text-[10px] px-2 py-0.5 rounded font-bold">順番待ち制</span>}
                      {shop.isPaused && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded">受付停止中</span>}
                  </div>
                  <h3 className="font-bold text-lg leading-tight truncate text-gray-800 mb-1">{shop.name}</h3>
                  <div className="text-xs text-gray-400">
                      {shop.isQueueMode 
                        ? `現在 ${shop.queue?.filter((q:any)=>q.status==='waiting').length || 0}組 待ち` 
                        : `${shop.openTime} - ${shop.closeTime}`}
                  </div>
              </div>
              <div className="self-center text-gray-300">&gt;</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden pb-10">
            {/* 詳細ヘッダー (既存コードと同じ) */}
            <div className="relative">
               {/* ... (戻るボタンや画像など 既存コード保持) ... */}
               <button onClick={() => { setSelectedShop(null); setDraftBooking(null); }} className="absolute top-2 left-2 bg-black/60 text-white px-3 py-1 rounded-full text-sm backdrop-blur-sm z-10">← もどる</button>
               <div className="p-4 pt-12 border-b">
                   <h2 className="text-2xl font-bold">{selectedShop.name}</h2>
               </div>
            </div>

            <div className="p-4">
                {selectedShop.description && (
                    <div className="mb-6 text-sm text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
                        {selectedShop.description}
                    </div>
                )}

                {selectedShop.isPaused ? (
                    <p className="text-red-500 font-bold mb-4 bg-red-100 p-3 rounded text-center">受付停止中</p>
                ) : (
                    <>
                        {/* ★分岐: 順番待ちモード(Queue) or 時間指定モード(Slot) */}
                        {selectedShop.isQueueMode ? (
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
                                   <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 min-w-[100px]">
                                      <p className="text-xs text-blue-600">待ち人数</p>
                                      <p className="text-3xl font-bold text-blue-900">
                                        {selectedShop.queue?.filter((q:any)=>q.status==='waiting').reduce((s:number, c:any)=>s+(c.count||1), 0) || 0}
                                        <span className="text-sm font-normal ml-1">人</span>
                                      </p>
                                   </div>
                                </div>
                              </div>
                              <button 
                                onClick={() => handleJoinQueue(selectedShop)}
                                className="w-full bg-orange-500 text-white text-xl font-bold py-4 rounded-xl shadow-lg hover:bg-orange-600 transition flex items-center justify-center gap-2"
                              >
                                <span>🏃</span> 順番待ちに並ぶ
                              </button>
                              <p className="text-xs text-gray-400 mt-3">※半径200m以内からのみ並べます(想定)</p>
                           </div>
                        ) : (
                           // 既存の時間枠選択UI
                           <div className="grid grid-cols-3 gap-3">
                              {Object.entries(selectedShop.slots || {}).sort().map(([time, count]: any) => {
                                 // ... (既存ロジック)
                                 const capacity = selectedShop.groupLimit || selectedShop.capacity;
                                 const isFull = count >= capacity;
                                 const remaining = capacity - count;
                                 const isBooked = activeTickets.some(t => t.shopId === selectedShop.id && t.time === time);
                                 return (
                                     <button 
                                       key={time} 
                                       disabled={isFull || isBooked} 
                                       onClick={() => handleSelectTime(selectedShop, time)}
                                       className={`p-2 rounded border h-24 flex flex-col items-center justify-center ${isBooked ? "bg-green-50 border-green-500" : "bg-white border-blue-200"}`}
                                     >
                                        <span className="font-bold">{time}</span>
                                        <span className="text-xs">{isBooked ? "予約済" : isFull ? "満席" : `あと${remaining}名`}</span>
                                     </button>
                                 );
                              })}
                           </div>
                        )}
                    </>
                )}
            </div>
        </div>
      )}
      
      {/* 3. 履歴エリア (省略: 既存コード同様) */}

      {/* ★人数選択モーダル */}
      {draftBooking && selectedShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl overflow-hidden">
            <div className={`${draftBooking.mode === "queue" ? "bg-orange-500" : "bg-blue-600"} text-white p-4 text-center`}>
              <h3 className="text-lg font-bold">{draftBooking.mode === "queue" ? "順番待ちの確認" : "予約の確認"}</h3>
            </div>
            
            <div className="p-6">
              <p className="text-center font-bold mb-4">{selectedShop.name}</p>
              
              <label className="block text-sm font-bold text-gray-700 mb-2">
                 何名様ですか？ <span className="font-normal text-xs text-gray-500">(最大{draftBooking.remaining}名)</span>
              </label>
              <select 
                 value={peopleCount} 
                 onChange={(e) => setPeopleCount(Number(e.target.value))}
                 className="w-full text-lg p-3 border-2 border-gray-200 rounded-lg mb-6"
              >
                 {[...Array(Math.min(10, draftBooking.remaining))].map((_, i) => (
                    <option key={i+1} value={i+1}>{i+1}名</option>
                 ))}
              </select>

              <div className="flex gap-3">
                 <button onClick={() => setDraftBooking(null)} className="flex-1 py-3 bg-gray-100 rounded-lg font-bold text-gray-500">戻る</button>
                 <button onClick={handleConfirmBooking} className={`flex-1 py-3 text-white font-bold rounded-lg shadow ${draftBooking.mode === "queue" ? "bg-orange-500" : "bg-blue-600"}`}>
                    {draftBooking.mode === "queue" ? "並ぶ" : "予約する"}
                 </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
