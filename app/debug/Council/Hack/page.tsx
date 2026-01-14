"use client";
import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../../../firebase"; 
import { collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, increment, Timestamp } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

// --- 型定義 ---
type Reservation = {
  userId: string;
  time: string;
  timestamp: number;
  status: "reserved" | "used";
  count: number;
};

type QueueTicket = {
  userId: string;
  ticketId: string;
  status: "waiting" | "ready" | "done";
  count: number;
  createdAt: any;
};

// --- ヘルパー関数 ---
const convertGoogleDriveLink = (url: string) => {
  if (!url) return "";
  if (!url.includes("drive.google.com") || url.includes("export=view")) {
    return url;
  }
  try {
    const id = url.split("/d/")[1].split("/")[0];
    return `https://drive.google.com/uc?export=view&id=${id}`;
  } catch (e) {
    return url;
  }
};

export default function AdminPage() {
  const [attractions, setAttractions] = useState<any[]>([]);
  const [myUserId, setMyUserId] = useState("");

  // 表示・編集モード管理
  const [expandedShopId, setExpandedShopId] = useState<string | null>(null); 
  
  // --- 強制追加用ステート ---
  const [forceUserId, setForceUserId] = useState("");
  const [forceCount, setForceCount] = useState(1);
  const [forceTime, setForceTime] = useState("");
  const [forceMode, setForceMode] = useState<"slot" | "queue">("slot");

  // --- 初期化 ---
  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));

    let stored = localStorage.getItem("bunkasai_user_id");
    if (!stored) {
        stored = "ADMIN-" + Math.random().toString(36).substring(2, 8).toUpperCase();
        localStorage.setItem("bunkasai_user_id", stored);
    }
    setMyUserId(stored);

    const unsub = onSnapshot(collection(db, "attractions"), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // 名前順などでソート
      data.sort((a: any, b: any) => a.name.localeCompare(b.name));
      setAttractions(data);
    });
    return () => unsub();
  }, []);

  // --- 統計データ ---
  const stats = useMemo(() => {
      const totalVenues = attractions.length;
      const pausedVenues = attractions.filter(a => a.isPaused).length;
      const totalReservations = attractions.reduce((sum, shop) => {
        // 順番待ちの場合
        if (shop.isQueueMode && shop.queue) {
             return sum + shop.queue.filter((t: any) => ['waiting', 'ready'].includes(t.status)).length;
        }
        // 時間枠の場合
        return sum + (shop.reservations?.filter((r:any) => r.status === 'reserved').length || 0);
      }, 0);

      return {
          totalVenues,
          pausedVenues,
          totalReservations,
      };
  }, [attractions]);


  // --- アクション関数群 ---

  // 1. 強制追加 (Force Add)
  const handleForceAdd = async (shop: any) => {
    if (!forceUserId) return alert("ユーザーIDを入力してください");
    
    try {
        const shopRef = doc(db, "attractions", shop.id);

        if (forceMode === "queue") {
            // --- 順番待ちへの追加 ---
            if (!shop.isQueueMode) {
                if(!confirm("この会場は「順番待ち制」ではありませんが、無理やりキューに追加しますか？")) return;
            }

            const currentQueue = shop.queue || [];
            let maxId = 0;
            currentQueue.forEach((q: any) => {
                const num = parseInt(q.ticketId || "0");
                if (num > maxId) maxId = num;
            });
            const nextTicketId = String(maxId + 1).padStart(6, '0');

            const queueData = {
                userId: forceUserId,
                ticketId: nextTicketId,
                count: forceCount,
                status: "waiting",
                createdAt: Timestamp.now()
            };

            await updateDoc(shopRef, {
                queue: arrayUnion(queueData)
            });
            alert(`順番待ちに追加しました (No.${nextTicketId})`);

        } else {
            // --- 時間枠への追加 ---
            if (!forceTime) return alert("時間枠を選択してください");
            
            const reservationData = {
                userId: forceUserId,
                time: forceTime,
                timestamp: Date.now(),
                status: "reserved",
                count: forceCount
            };

            const currentSlotCount = shop.slots?.[forceTime] || 0;
            
            await updateDoc(shopRef, {
                [`slots.${forceTime}`]: currentSlotCount + 1, // 強制的に枠を消費
                reservations: arrayUnion(reservationData)
            });
            alert(`${forceTime} に予約を追加しました`);
        }

        // リセット
        setForceUserId("");
        setForceCount(1);
    } catch (e) {
        console.error(e);
        alert("追加エラーが発生しました");
    }
  };

  // 2. 予約(時間枠)の状態変更・キャンセル
  const toggleReservationStatus = async (shop: any, res: Reservation, newStatus: "reserved" | "used") => {
    try {
      const shopRef = doc(db, "attractions", shop.id);
      await updateDoc(shopRef, { reservations: arrayRemove(res) });
      await updateDoc(shopRef, { reservations: arrayUnion({ ...res, status: newStatus }) });
    } catch(e) { console.error(e); alert("更新失敗"); }
  };

  const cancelReservation = async (shop: any, res: Reservation) => {
    if(!confirm("本当に削除しますか？")) return;
    try {
      const shopRef = doc(db, "attractions", shop.id);
      await updateDoc(shopRef, { 
        reservations: arrayRemove(res),
        [`slots.${res.time}`]: increment(-1)
      });
    } catch(e) { console.error(e); alert("削除失敗"); }
  };

  // 3. 順番待ち(Queue)の状態変更・削除
  const updateQueueStatus = async (shop: any, ticket: QueueTicket, newStatus: string) => {
    try {
        const shopRef = doc(db, "attractions", shop.id);
        // 一旦削除して新しいステータスで追加（更新）
        await updateDoc(shopRef, { queue: arrayRemove(ticket) });
        
        // done以外なら更新して戻す、doneなら削除扱いで履歴に残す等は仕様次第だがここでは更新
        if (newStatus !== "delete") {
            await updateDoc(shopRef, { 
                queue: arrayUnion({ ...ticket, status: newStatus }) 
            });
        }
    } catch (e) { console.error(e); alert("更新失敗"); }
  };

  // 4. 受付停止/再開
  const togglePause = async (shop: any) => {
      const shopRef = doc(db, "attractions", shop.id);
      await updateDoc(shopRef, { isPaused: !shop.isPaused });
  };


  // --- 描画用ヘルパー ---
  const targetShop = attractions.find(s => s.id === expandedShopId);

  // 時間枠ごとに予約をグループ化
  const getReservationsByTime = (shop: any) => {
    if (!shop.reservations) return {};
    const grouped: any = {};
    // 枠順にソートするためにスロットキーを使う
    Object.keys(shop.slots || {}).sort().forEach(time => {
        grouped[time] = shop.reservations.filter((r: any) => r.time === time);
    });
    return grouped;
  };

  // 順番待ちリストの整理
  const getQueueList = (shop: any) => {
      const q = shop.queue || [];
      const waiting = q.filter((t:any) => t.status === 'waiting').sort((a:any, b:any) => parseInt(a.ticketId) - parseInt(b.ticketId));
      const ready = q.filter((t:any) => t.status === 'ready').sort((a:any, b:any) => parseInt(a.ticketId) - parseInt(b.ticketId));
      return { waiting, ready };
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans pb-20">
      {/* --- ヘッダー --- */}
      <header className="bg-gray-800 border-b border-gray-700 p-4 sticky top-0 z-10 shadow-md">
          <div className="max-w-4xl mx-auto flex justify-between items-center">
              <div>
                  <h1 className="text-xl font-bold text-white">管理ダッシュボード</h1>
                  <p className="text-xs text-gray-400">Total Venues: {stats.totalVenues} | Active Requests: {stats.totalReservations}</p>
              </div>
              <div className="text-right">
                  <div className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300">ID: {myUserId}</div>
              </div>
          </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        
        {/* --- 一覧画面 (詳細が開いていない時) --- */}
        {!expandedShopId && (
            <div className="grid gap-4">
                {attractions.map((shop) => (
                    <div key={shop.id} onClick={() => setExpandedShopId(shop.id)} className="bg-gray-800 p-4 rounded-xl border border-gray-700 hover:border-blue-500 cursor-pointer transition shadow-sm group">
                        <div className="flex justify-between items-start">
                            <div className="flex gap-4">
                                {shop.imageUrl && (
                                    <img src={convertGoogleDriveLink(shop.imageUrl)} className="w-16 h-16 object-cover rounded bg-gray-700" alt="" />
                                )}
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h2 className="font-bold text-lg text-white group-hover:text-blue-400 transition">{shop.name}</h2>
                                        {shop.isPaused && <span className="text-[10px] bg-red-900 text-red-200 px-1.5 py-0.5 rounded border border-red-700">停止中</span>}
                                        {shop.isQueueMode && <span className="text-[10px] bg-orange-900 text-orange-200 px-1.5 py-0.5 rounded border border-orange-700">順番待ち</span>}
                                    </div>
                                    <p className="text-xs text-gray-400">{shop.department}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-2xl font-bold text-gray-200">
                                    {shop.isQueueMode 
                                        ? (shop.queue?.filter((q:any)=>['waiting','ready'].includes(q.status)).length || 0)
                                        : (shop.reservations?.filter((r:any)=>r.status==='reserved').length || 0)
                                    }
                                </span>
                                <span className="text-xs text-gray-500 block">Active</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {/* --- 詳細・操作画面 --- */}
        {expandedShopId && targetShop && (
            <div className="animate-fade-in">
                <button onClick={() => setExpandedShopId(null)} className="mb-4 text-sm text-gray-400 hover:text-white flex items-center gap-1">
                    ← 戻る
                </button>

                <div className="bg-gray-800 rounded-xl border border-gray-600 overflow-hidden mb-8 shadow-xl">
                    {/* 上部: 情報＆基本操作 */}
                    <div className="p-6 border-b border-gray-700 bg-gray-850">
                        <div className="flex justify-between items-start mb-4">
                            <h2 className="text-2xl font-bold">{targetShop.name}</h2>
                            <button 
                                onClick={(e) => { e.stopPropagation(); togglePause(targetShop); }}
                                className={`px-3 py-1 text-xs font-bold rounded border ${targetShop.isPaused ? 'bg-red-600 text-white border-red-500' : 'bg-gray-700 text-gray-300 border-gray-600'}`}
                            >
                                {targetShop.isPaused ? "受付再開する" : "受付停止する"}
                            </button>
                        </div>
                        <div className="flex gap-2 text-sm text-gray-400">
                             <span className="bg-gray-700 px-2 py-0.5 rounded">Password: {targetShop.password}</span>
                             <span>{targetShop.isQueueMode ? "順番待ち制" : "時間予約制"}</span>
                        </div>
                    </div>

                    {/* ★★★ 強制追加フォーム (ここがリクエスト箇所) ★★★ */}
                    <div className="bg-gray-900/80 p-5 border-b border-gray-700">
                        <h3 className="text-sm font-bold text-yellow-500 mb-3 flex items-center gap-2">
                            ⚡ 強制追加 (Force Add)
                        </h3>
                        <div className="flex flex-wrap items-end gap-3 bg-gray-800 p-3 rounded-lg border border-gray-700">
                            {/* モード切替 */}
                            <div className="flex bg-gray-900 rounded p-1 border border-gray-700">
                                <button 
                                    onClick={() => setForceMode("slot")}
                                    className={`px-3 py-1.5 rounded text-xs font-bold transition ${forceMode === "slot" ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-700"}`}
                                >
                                    時間予約
                                </button>
                                <button 
                                    onClick={() => setForceMode("queue")}
                                    className={`px-3 py-1.5 rounded text-xs font-bold transition ${forceMode === "queue" ? "bg-orange-600 text-white" : "text-gray-400 hover:bg-gray-700"}`}
                                >
                                    順番待ち
                                </button>
                            </div>

                            {/* ユーザーID入力 */}
                            <div className="flex-1 min-w-[150px]">
                                <p className="text-[10px] text-gray-400 mb-1">User ID</p>
                                <input 
                                    type="text" 
                                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                                    placeholder="ユーザーIDを入力"
                                    value={forceUserId}
                                    onChange={(e) => setForceUserId(e.target.value)}
                                />
                            </div>

                            {/* 人数 */}
                            <div className="w-16">
                                <p className="text-[10px] text-gray-400 mb-1">人数</p>
                                <input 
                                    type="number" min="1"
                                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-center text-white"
                                    value={forceCount}
                                    onChange={(e) => setForceCount(Number(e.target.value))}
                                />
                            </div>

                            {/* 時間選択 (slotモードのみ) */}
                            {forceMode === "slot" && (
                                <div className="w-24">
                                    <p className="text-[10px] text-gray-400 mb-1">時間</p>
                                    <select 
                                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
                                        value={forceTime}
                                        onChange={(e) => setForceTime(e.target.value)}
                                    >
                                        <option value="">選択</option>
                                        {Object.keys(targetShop.slots || {}).sort().map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <button 
                                onClick={() => handleForceAdd(targetShop)}
                                className={`px-4 py-1.5 rounded text-sm font-bold text-white shadow-lg transition ${forceMode === 'queue' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-blue-600 hover:bg-blue-500'}`}
                            >
                                追加
                            </button>
                        </div>
                        {/* 警告メッセージ */}
                        {forceMode === "queue" && !targetShop.isQueueMode && (
                            <p className="text-red-400 text-xs mt-2 pl-1">⚠ この会場は「時間予約制」です。順番待ちへの追加は通常行いません。</p>
                        )}
                        {forceMode === "slot" && targetShop.isQueueMode && (
                            <p className="text-red-400 text-xs mt-2 pl-1">⚠ この会場は「順番待ち制」です。時間予約の追加は通常行いません。</p>
                        )}
                    </div>

                    {/* リスト表示エリア */}
                    <div className="p-6 min-h-[400px]">
                        
                        {/* --- 順番待ちモードの表示 --- */}
                        {targetShop.isQueueMode ? (
                            <div>
                                {(() => {
                                    const { waiting, ready } = getQueueList(targetShop);
                                    return (
                                        <div className="grid md:grid-cols-2 gap-8">
                                            {/* 呼び出し中リスト */}
                                            <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-4">
                                                <h4 className="font-bold text-red-400 mb-4 flex items-center gap-2">
                                                    🔔 呼び出し中 (Ready) <span className="bg-red-600 text-white text-xs px-2 rounded-full">{ready.length}</span>
                                                </h4>
                                                <div className="space-y-2">
                                                    {ready.map((t:any) => (
                                                        <div key={t.ticketId} className="bg-gray-800 p-3 rounded border border-red-800 flex justify-between items-center">
                                                            <div>
                                                                <span className="text-2xl font-mono font-bold text-white block">{t.ticketId}</span>
                                                                <span className="text-xs text-gray-400">{t.userId} ({t.count}名)</span>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button onClick={() => updateQueueStatus(targetShop, t, 'done')} className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded">完了</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {ready.length === 0 && <p className="text-gray-500 text-sm">なし</p>}
                                                </div>
                                            </div>

                                            {/* 待機中リスト */}
                                            <div className="bg-blue-900/20 border border-blue-900/50 rounded-lg p-4">
                                                <h4 className="font-bold text-blue-400 mb-4 flex items-center gap-2">
                                                    👥 待機中 (Waiting) <span className="bg-blue-600 text-white text-xs px-2 rounded-full">{waiting.length}</span>
                                                </h4>
                                                <div className="space-y-2">
                                                    {waiting.map((t:any) => (
                                                        <div key={t.ticketId} className="bg-gray-800 p-3 rounded border border-gray-700 flex justify-between items-center">
                                                            <div>
                                                                <span className="text-xl font-mono font-bold text-gray-300 block">{t.ticketId}</span>
                                                                <span className="text-xs text-gray-500">{t.userId} ({t.count}名)</span>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button onClick={() => updateQueueStatus(targetShop, t, 'ready')} className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded font-bold">呼出</button>
                                                                <button onClick={() => updateQueueStatus(targetShop, t, 'delete')} className="px-2 py-1 text-red-500 hover:bg-red-900/30 text-xs rounded">✕</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {waiting.length === 0 && <p className="text-gray-500 text-sm">待ちなし</p>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        ) : (
                            /* --- 時間予約モードの表示 --- */
                            <div className="space-y-6">
                                {Object.entries(getReservationsByTime(targetShop)).map(([time, list]: any) => (
                                    <div key={time} className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
                                        <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex justify-between items-center">
                                            <h4 className="font-mono font-bold text-lg text-blue-400">{time}</h4>
                                            <span className="text-xs text-gray-400">{list.length} 件の予約</span>
                                        </div>
                                        <div className="p-2 space-y-2">
                                            {list.map((res: any) => (
                                                <div key={`${res.userId}_${res.timestamp}`} className="flex items-center justify-between bg-gray-800 p-3 rounded border border-gray-700">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-2 h-2 rounded-full ${res.status === 'used' ? 'bg-gray-500' : 'bg-green-500'}`} />
                                                        <div>
                                                            <p className="text-sm font-bold text-gray-200">{res.userId}</p>
                                                            <p className="text-xs text-gray-500">{res.count}名 / {new Date(res.timestamp).toLocaleTimeString()}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        {res.status === 'reserved' ? (
                                                            <button 
                                                                onClick={() => toggleReservationStatus(targetShop, res, 'used')} 
                                                                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded"
                                                            >
                                                                入場済にする
                                                            </button>
                                                        ) : (
                                                            <button 
                                                                onClick={() => toggleReservationStatus(targetShop, res, 'reserved')} 
                                                                className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-gray-200 text-xs rounded"
                                                            >
                                                                未入場に戻す
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={() => cancelReservation(targetShop, res)} 
                                                            className="px-2 py-1 text-red-400 hover:text-red-300 text-xs border border-transparent hover:border-red-900 rounded"
                                                        >
                                                            削除
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {list.length === 0 && <p className="text-gray-500 text-xs text-center py-2">予約なし</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
}
