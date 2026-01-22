// app/debug/ShopDetail.tsx
"use client";
import React, { useEffect, useState } from "react";
import { db } from "../../firebase"; 
import { collection, onSnapshot, doc, runTransaction, Timestamp, orderBy, query } from "firebase/firestore";

// --- Constants (仕様書 Section 2) ---
const LIMIT_TIME_MINUTES = 30;

// --- Types ---
type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

type Order = {
  id: string; // Document ID
  ticketId: string;
  items: OrderItem[];
  totalAmount: number;
  status: "ordered" | "paying" | "completed" | "cancelled" | "force_cancelled";
  createdAt: Timestamp;
};

type Props = {
  shop: any;
  setExpandedShopId: (id: string | null) => void;
  setIsEditing: (v: boolean) => void;
  startEdit: (shop: any) => void;
  handleDeleteVenue: (id: string) => void;
  searchUserId: string;
  // 既存のアクション (予約・順番待ち用)
  toggleReservationStatus: (shop: any, res: any, status: "reserved" | "used") => void;
  cancelReservation: (shop: any, res: any) => void;
  handleQueueAction: (shop: any, ticket: any, action: "call" | "enter" | "cancel") => void;
};

export default function ShopDetail({
  shop,
  setExpandedShopId,
  setIsEditing,
  startEdit,
  handleDeleteVenue,
  searchUserId,
  toggleReservationStatus,
  cancelReservation,
  handleQueueAction
}: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [now, setNow] = useState(new Date());

  // --- 1. 注文データのリアルタイム監視 (Module 2: subscribeToOrders) ---
  useEffect(() => {
    // 1分ごとに現在時刻を更新（遅延判定用）
    const timer = setInterval(() => setNow(new Date()), 60000);

    // sub-collection "orders" を監視すると仮定
    const q = query(collection(db, "attractions", shop.id, "orders"), orderBy("createdAt", "asc"));
    
    const unsub = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as Order[];
      setOrders(fetchedOrders);
    });

    return () => {
      clearInterval(timer);
      unsub();
    };
  }, [shop.id]);

  // --- 2. アクション処理 (Module 2 Logic) ---

  // 支払い完了処理
  const handleCompletePayment = async (orderId: string) => {
    if(!confirm("支払いを完了し、商品を引き渡しますか？")) return;
    try {
      const orderRef = doc(db, "attractions", shop.id, "orders", orderId);
      await runTransaction(db, async (transaction) => {
        transaction.update(orderRef, { status: "completed" });
      });
    } catch (e) {
      console.error(e);
      alert("更新に失敗しました");
    }
  };

  // キャンセル処理 (通常キャンセル & 強制キャンセル共通ロジック)
  // 在庫復元処理を含む (Atomic Increment)
  const executeCancel = async (order: Order, isForce: boolean) => {
    const confirmMsg = isForce 
      ? "【期限切れ強制キャンセル】\n在庫を戻し、ステータスを更新しますか？" 
      : "注文をキャンセルし、在庫を戻しますか？";
    
    if (!confirm(confirmMsg)) return;

    try {
      const shopRef = doc(db, "attractions", shop.id);
      const orderRef = doc(db, "attractions", shop.id, "orders", order.id);

      await runTransaction(db, async (transaction) => {
        // 1. 最新の店舗データ(メニュー在庫)を取得
        const shopDoc = await transaction.get(shopRef);
        if (!shopDoc.exists()) throw new Error("Shop not found");
        
        const currentMenu = shopDoc.data().menu || [];

        // 2. 在庫復元ロジック (メモリ上で計算して配列ごと更新)
        const updatedMenu = currentMenu.map((menuItem: any) => {
          const targetItem = order.items.find(i => i.id === menuItem.id);
          if (targetItem) {
            // 在庫を加算 (Atomicな挙動としてTransaction内で処理)
            return { ...menuItem, stock: menuItem.stock + targetItem.quantity };
          }
          return menuItem;
        });

        // 3. 書き込み
        transaction.update(shopRef, { menu: updatedMenu });
        transaction.update(orderRef, { 
          status: isForce ? "force_cancelled" : "cancelled" 
        });
      });
    } catch (e) {
      console.error(e);
      alert("キャンセル処理に失敗しました");
    }
  };

  // --- 3. ソートとレンダリング準備 (Module 2: sortAndRenderOrders) ---
  const activeOrders = orders.filter(o => ["ordered", "paying"].includes(o.status));
  const historyOrders = orders.filter(o => ["completed", "cancelled", "force_cancelled"].includes(o.status));

  // ソート: paying(最優先) -> ordered(古い順)
  activeOrders.sort((a, b) => {
    if (a.status === "paying" && b.status !== "paying") return -1;
    if (b.status === "paying" && a.status !== "paying") return 1;
    return a.createdAt.toMillis() - b.createdAt.toMillis();
  });
  
  // 履歴は新しい順
  historyOrders.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());


  // 遅延判定ヘルパー
  const getDelayInfo = (createdAt: Timestamp) => {
    const createdDate = createdAt.toDate();
    const diffMs = now.getTime() - createdDate.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const isDelayed = diffMinutes >= LIMIT_TIME_MINUTES;
    return { diffMinutes, isDelayed };
  };

  // 既存の予約データを時間ごとにグループ化するヘルパー
  const getReservationsByTime = (targetShop: any) => {
    const grouped: any = {};
    Object.keys(targetShop.slots || {}).sort().forEach(time => {
      grouped[time] = [];
    });
    if (targetShop.reservations) {
      targetShop.reservations.forEach((res: any) => {
        if (grouped[res.time]) {
          grouped[res.time].push(res);
        }
      });
    }
    return grouped;
  };
  const groupedReservations = getReservationsByTime(shop);


  return (
    <div className="animate-fade-in pb-20">
      {/* 戻るヘッダー */}
      <button onClick={() => { setExpandedShopId(null); setIsEditing(false); }} className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white">
        ← 会場一覧に戻る
      </button>

      <div className="bg-gray-800 rounded-xl border border-gray-600 overflow-hidden">
        {/* タイトルバー */}
        <div className="bg-gray-700 p-4 flex justify-between items-start relative overflow-hidden">
          {shop.imageUrl && (
            <div className="absolute inset-0 z-0 opacity-20">
              <img src={shop.imageUrl} className="w-full h-full object-cover" alt="" />
            </div>
          )}

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-yellow-400 font-mono font-bold text-xl">{shop.id}</span>
              <span className={`text-xs px-2 py-0.5 rounded border backdrop-blur-sm ${shop.systemMode === "open" ? "bg-green-600 border-green-400 text-white" : "bg-gray-600 border-gray-400 text-gray-200"}`}>
                {shop.systemMode === "open" ? "営業中" : (shop.systemMode === "pre_open" ? "開店準備中" : "受付終了")}
              </span>
            </div>
            <h2 className="text-2xl font-bold flex items-center gap-2 text-white drop-shadow-md">
              {shop.name}
            </h2>
            <p className="text-xs text-gray-300 mt-1 drop-shadow-md">Pass: **** | Menu: {shop.menu?.length || 0}種</p>
          </div>

          <div className="flex gap-2 relative z-10">
            <button onClick={() => startEdit(shop)} className="bg-blue-600 text-xs px-3 py-2 rounded hover:bg-blue-500 font-bold shadow-lg">⚙️ 設定編集</button>
            <button onClick={() => handleDeleteVenue(shop.id)} className="bg-red-600 text-xs px-3 py-2 rounded hover:bg-red-500 shadow-lg">削除</button>
          </div>
        </div>

        {/* ================================================================================== */}
        {/* Module 2: Admin Dashboard (Order Monitor) */}
        {/* ================================================================================== */}
        <div className="p-4 border-b border-gray-700 bg-gray-900/50">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-blue-300">
            📊 オーダーモニター
            <span className="text-sm bg-blue-900 text-blue-200 px-2 py-1 rounded-full">{activeOrders.length}件 待機中</span>
          </h3>

          <div className="space-y-4">
            {activeOrders.length === 0 ? (
                <div className="p-8 text-center text-gray-500 border border-gray-700 border-dashed rounded">
                    現在、対応が必要な注文はありません
                </div>
            ) : (
                activeOrders.map((order) => {
                    const { diffMinutes, isDelayed } = getDelayInfo(order.createdAt);
                    const isPaying = order.status === "paying";
                    
                    // ハイライト判定 (Paying: 黄色点滅 / Delayed: 赤枠 / Normal: グレー)
                    let cardClass = "bg-gray-800 border-gray-600";
                    if (isPaying) cardClass = "bg-yellow-900/30 border-yellow-500 animate-pulse-slow"; // 支払い中を目立たせる
                    else if (isDelayed) cardClass = "bg-red-900/20 border-red-500"; // 遅延

                    return (
                        <div key={order.id} className={`p-4 rounded border-l-4 shadow-lg flex flex-col md:flex-row justify-between gap-4 ${cardClass}`}>
                            {/* 左側: 注文情報 */}
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="bg-gray-700 text-white font-mono font-bold px-2 py-1 rounded text-lg">
                                        No.{order.ticketId}
                                    </span>
                                    {isPaying && <span className="bg-yellow-500 text-black font-bold px-2 py-1 rounded text-xs animate-bounce">支払い提示中</span>}
                                    {isDelayed && <span className="bg-red-600 text-white font-bold px-2 py-1 rounded text-xs">⚠️ {diffMinutes}分経過 (期限超過)</span>}
                                    {!isPaying && !isDelayed && <span className="text-gray-400 text-xs">経過: {diffMinutes}分</span>}
                                </div>
                                
                                <div className="text-sm space-y-1 mb-2">
                                    {order.items.map((item, idx) => (
                                        <div key={idx} className="flex justify-between border-b border-gray-700 pb-1">
                                            <span>{item.name} x{item.quantity}</span>
                                            <span className="text-gray-400">¥{(item.price * item.quantity).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="text-right font-bold text-lg text-white">
                                    合計: ¥{order.totalAmount.toLocaleString()}
                                </div>
                            </div>

                            {/* 右側: アクションボタン */}
                            <div className="flex flex-col gap-2 justify-center min-w-[150px]">
                                {/* 完了ボタン */}
                                <button 
                                    onClick={() => handleCompletePayment(order.id)}
                                    className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded shadow-lg transition-transform active:scale-95"
                                >
                                    💰 支払い完了
                                </button>

                                {/* キャンセル系 */}
                                <div className="flex gap-2">
                                    {isDelayed ? (
                                        <button 
                                            onClick={() => executeCancel(order, true)}
                                            className="flex-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-2 px-2 rounded border border-red-400"
                                        >
                                            ⚡ 強制キャンセル
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => executeCancel(order, false)}
                                            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs py-2 px-2 rounded"
                                        >
                                            キャンセル
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })
            )}
          </div>

          {/* 履歴・完了済み (折りたたみまたは下部表示) */}
          {historyOrders.length > 0 && (
            <div className="mt-8 pt-4 border-t border-gray-700">
                <h4 className="text-sm font-bold text-gray-500 mb-2">直近の履歴 ({historyOrders.length}件)</h4>
                <div className="space-y-2 opacity-60 hover:opacity-100 transition-opacity">
                    {historyOrders.slice(0, 5).map(order => (
                        <div key={order.id} className="flex justify-between items-center bg-gray-800 p-2 rounded text-xs">
                            <span className="text-gray-400">No.{order.ticketId}</span>
                            <span className={`px-2 py-0.5 rounded ${
                                order.status === 'completed' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
                            }`}>
                                {order.status === 'completed' ? '完了' : 'キャンセル'}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
          )}
        </div>


        {/* ================================================================================== */}
        {/* 既存UI: 予約・順番待ち管理 (Order Systemと併用またはフォールバック) */}
        {/* ================================================================================== */}
        <div className="p-4 space-y-6 opacity-80">
          <div className="flex items-center gap-2 mb-4">
              <div className="h-px bg-gray-600 flex-1"></div>
              <span className="text-xs text-gray-400">Legacy: 予約/順番待ち管理エリア</span>
              <div className="h-px bg-gray-600 flex-1"></div>
          </div>

          {shop.description && (
            <div className="bg-gray-900/50 p-3 rounded border border-gray-700 text-sm text-gray-300 whitespace-pre-wrap">
              {shop.description}
            </div>
          )}

          {/* A. 順番待ちモード (Queue Mode) */}
          {shop.isQueueMode ? (
            <div>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span>🔢 待機列の管理</span>
                <span className="text-sm bg-gray-700 px-2 py-1 rounded text-gray-300 font-normal">現在: {shop.queue?.length || 0}組</span>
              </h3>

              <div className="bg-gray-900/50 rounded border border-gray-700 p-2 min-h-[200px]">
                {(!shop.queue || shop.queue.length === 0) ? (
                  <div className="text-gray-500 text-center py-10">待機している人はいません</div>
                ) : (
                  <div className="space-y-2">
                    {shop.queue.map((ticket: any, index: number) => {
                      const isMatch = searchUserId && (ticket.userId?.includes(searchUserId.toUpperCase()) || ticket.ticketId?.includes(searchUserId.toUpperCase()));
                      const isReady = ticket.status === "ready";

                      return (
                        <div key={ticket.ticketId} className={`flex items-center p-3 rounded border ${isMatch ? "bg-pink-900/30 border-pink-500" : (isReady ? "bg-yellow-900/20 border-yellow-600" : "bg-gray-800 border-gray-600")}`}>
                          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center font-bold mr-3 text-sm">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-lg text-yellow-400">No.{ticket.ticketId}</span>
                              {isReady && <span className="text-[10px] bg-yellow-600 text-black px-1 rounded font-bold animate-pulse">呼出中</span>}
                            </div>
                            <div className="text-xs text-gray-400">ID: {ticket.userId} / {ticket.people}名</div>
                          </div>
                          
                          <div className="flex gap-1">
                            <button 
                              onClick={() => handleQueueAction(shop, ticket, "call")}
                              className={`px-3 py-1 rounded text-xs font-bold ${isReady ? "bg-gray-600 text-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500"}`}
                              disabled={isReady}
                            >
                              🔔 呼出
                            </button>
                            <button 
                              onClick={() => handleQueueAction(shop, ticket, "enter")}
                              className="px-3 py-1 rounded text-xs font-bold bg-green-600 hover:bg-green-500"
                            >
                              ✅ 入場
                            </button>
                            <button 
                              onClick={() => handleQueueAction(shop, ticket, "cancel")}
                              className="px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-700 hover:text-red-400"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* B. 時間予約モード */
            <div>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span>🕒 予約枠の管理</span>
              </h3>
              <div className="grid gap-4 grid-cols-1">
                {Object.keys(groupedReservations).map((time) => {
                  const resList = groupedReservations[time];
                  const usedCount = resList.filter((r: any) => r.status === "used").length;
                  const totalCount = resList.length;
                  
                  return (
                    <div key={time} className="bg-gray-900/50 rounded border border-gray-700 overflow-hidden">
                      <div className="bg-gray-800 px-3 py-2 flex justify-between items-center border-b border-gray-700">
                        <span className="font-mono text-lg font-bold text-blue-300">{time}</span>
                        <div className="text-xs text-gray-400">
                          予約: {totalCount} / 入場済: {usedCount}
                        </div>
                      </div>
                      
                      <div className="p-2 space-y-2">
                        {resList.length === 0 ? (
                          <div className="text-center text-xs text-gray-600 py-2">予約なし</div>
                        ) : (
                          resList.map((res: any, idx: number) => {
                            const isMatch = searchUserId && res.userId?.includes(searchUserId.toUpperCase());
                            const isUsed = res.status === "used";

                            return (
                              <div key={idx} className={`flex justify-between items-center p-2 rounded border ${isMatch ? "bg-pink-900/30 border-pink-500" : "bg-gray-800 border-gray-600"} ${isUsed ? "opacity-50" : ""}`}>
                                <div>
                                  <div className="font-mono text-sm font-bold text-yellow-500">{res.userId}</div>
                                  <div className="text-xs text-gray-400">{res.people}名 {isUsed && "(入場済)"}</div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => toggleReservationStatus(shop, res, isUsed ? "reserved" : "used")}
                                    className={`px-3 py-1 rounded text-xs font-bold ${isUsed ? "bg-gray-600 hover:bg-gray-500" : "bg-green-600 hover:bg-green-500"}`}
                                  >
                                    {isUsed ? "戻す" : "入場"}
                                  </button>
                                  <button
                                    onClick={() => cancelReservation(shop, res)}
                                    className="px-2 py-1 rounded text-xs bg-red-900/50 text-red-400 hover:bg-red-900 border border-red-900"
                                  >
                                    削除
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
