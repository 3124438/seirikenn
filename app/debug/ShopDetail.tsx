"use client";
import React, { useState, useEffect } from "react";

// ★仕様書: 共通設定 (受取期限の分数)
const LIMIT_TIME_MINUTES = 30;

type Props = {
  shop: any;
  setExpandedShopId: (id: string | null) => void;
  setIsEditing: (v: boolean) => void;
  startEdit: (shop: any) => void;
  handleDeleteVenue: (id: string) => void;
  searchUserId: string;
  // アクション
  toggleReservationStatus: (shop: any, res: any, status: "reserved" | "used") => void;
  cancelReservation: (shop: any, res: any) => void;
  handleQueueAction: (shop: any, ticket: any, action: "call" | "enter" | "cancel") => void;
  // ★追加: オーダー操作用アクション
  handleOrderAction?: (shop: any, order: any, action: "payment" | "force_cancel") => void;
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
  handleQueueAction,
  handleOrderAction // ★追加
}: Props) {

  // ★追加: リアルタイム監視用の現在時刻ステート (1分毎更新)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // 予約データを時間ごとにグループ化するヘルパー
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
    <div className="animate-fade-in">
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
              {shop.department && (
                <span className="text-xs bg-black/50 text-white px-2 py-0.5 rounded backdrop-blur-sm border border-white/20">
                  {shop.department}
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded border backdrop-blur-sm ${shop.isQueueMode ? "bg-green-600/50 border-green-400 text-white" : "bg-blue-600/50 border-blue-400 text-white"}`}>
                {shop.isQueueMode ? "順番待ち制" : "時間予約制"}
              </span>
            </div>
            <h2 className="text-2xl font-bold flex items-center gap-2 text-white drop-shadow-md">
              {shop.name}
            </h2>
            <p className="text-xs text-gray-300 mt-1 drop-shadow-md">Pass: **** | 定員: {shop.capacity}組</p>
          </div>

          <div className="flex gap-2 relative z-10">
            <button onClick={() => startEdit(shop)} className="bg-blue-600 text-xs px-3 py-2 rounded hover:bg-blue-500 font-bold shadow-lg">⚙️ 設定編集</button>
            <button onClick={() => handleDeleteVenue(shop.id)} className="bg-red-600 text-xs px-3 py-2 rounded hover:bg-red-500 shadow-lg">削除</button>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {shop.description && (
            <div className="bg-gray-900/50 p-3 rounded border border-gray-700 text-sm text-gray-300 whitespace-pre-wrap">
              {shop.description}
            </div>
          )}

          {/* ★★★ Module 2: オーダー監視機能 (追加実装) ★★★ */}
          {shop.orders && shop.orders.length > 0 && (
            <div>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-orange-300">
                <span>🍔 オーダー監視・対応</span>
                <span className="text-sm bg-gray-700 px-2 py-1 rounded text-gray-300 font-normal">
                  未完了: {shop.orders.filter((o:any) => o.status === 'ordered' || o.status === 'paying').length}件
                </span>
              </h3>
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {shop.orders.map((order: any) => {
                    // 1. 時刻計算ロジック
                    const createdAtMs = order.createdAt?.toMillis ? order.createdAt.toMillis() : new Date(order.createdAt).getTime();
                    const elapsedMinutes = Math.floor((now - createdAtMs) / (1000 * 60));
                    
                    // 2. 警告判定
                    const isOverdue = elapsedMinutes > LIMIT_TIME_MINUTES;
                    const overdueMinutes = elapsedMinutes - LIMIT_TIME_MINUTES;
                    const isActive = order.status === 'ordered' || order.status === 'paying';

                    // 3. 表示スタイル変更
                    const cardClass = isActive && isOverdue 
                        ? "border-red-500 bg-red-900/20" 
                        : "border-gray-600 bg-gray-800";
                    const textClass = isActive && isOverdue 
                        ? "text-red-400 font-bold" 
                        : "text-gray-400";

                    return (
                        <div key={order.id} className={`border rounded p-3 flex flex-col ${cardClass}`}>
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-mono bg-gray-900 px-2 rounded text-white text-xs py-1">#{order.ticketId}</span>
                                <span className="font-bold text-white">¥{order.totalAmount?.toLocaleString()}</span>
                            </div>

                            {/* 情報: 遅延時間の明示 */}
                            <div className={`text-xs mb-2 ${textClass}`}>
                                {isActive && isOverdue ? (
                                    <span className="flex items-center gap-1 animate-pulse">
                                        ⚠️ 経過: {elapsedMinutes}分 (+{overdueMinutes}分超過)
                                    </span>
                                ) : (
                                    <span>経過: {elapsedMinutes}分</span>
                                )}
                            </div>

                            <div className="text-xs text-gray-300 mb-3 flex-1 space-y-1">
                                {order.items?.map((item: any, i: number) => (
                                    <div key={i} className="flex justify-between border-b border-gray-600/50 pb-1">
                                        <span>{item.name}</span>
                                        <span>x{item.count}</span>
                                    </div>
                                ))}
                            </div>

                            {/* 操作ボタン */}
                            <div className="flex flex-col gap-2 mt-auto">
                                {isActive ? (
                                    <>
                                        {/* 強制キャンセル（在庫戻し） */}
                                        <button
                                            onClick={() => {
                                                if(window.confirm("【重要】強制キャンセルしますか？\n在庫が元に戻ります。")) {
                                                    handleOrderAction?.(shop, order, "force_cancel");
                                                }
                                            }}
                                            className={`w-full py-1 text-xs font-bold border rounded transition
                                                ${isOverdue 
                                                    ? "bg-red-600 border-red-500 text-white hover:bg-red-700 shadow-md shadow-red-900/50" 
                                                    : "border-red-800 text-red-500 hover:bg-red-900/30"
                                                }`}
                                        >
                                            {isOverdue ? "強制キャンセル (在庫戻し)" : "注文取消"}
                                        </button>
                                        
                                        {/* 支払い完了 */}
                                        <button
                                            onClick={() => handleOrderAction?.(shop, order, "payment")}
                                            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded"
                                        >
                                            支払い完了
                                        </button>
                                    </>
                                ) : (
                                    <div className="w-full text-center text-xs text-gray-500 py-2 bg-gray-900/50 rounded">
                                        {order.status === 'completed' ? "受渡完了" : "キャンセル済"}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
              </div>
            </div>
          )}

          <hr className="border-gray-700" />

          {/* ★★★ モード別表示 (既存コード) ★★★ */}

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
                      // 検索ハイライト
                      const isMatch = searchUserId && (ticket.userId?.includes(searchUserId.toUpperCase()) || ticket.ticketId?.includes(searchUserId.toUpperCase()));
                      const isReady = ticket.status === "ready"; // 呼び出し済み

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
                            {/* 呼出ボタン */}
                            <button 
                              onClick={() => handleQueueAction(shop, ticket, "call")}
                              className={`px-3 py-1 rounded text-xs font-bold ${isReady ? "bg-gray-600 text-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500"}`}
                              disabled={isReady}
                            >
                              🔔 呼出
                            </button>
                            {/* 入場ボタン */}
                            <button 
                              onClick={() => handleQueueAction(shop, ticket, "enter")}
                              className="px-3 py-1 rounded text-xs font-bold bg-green-600 hover:bg-green-500"
                            >
                              ✅ 入場
                            </button>
                            {/* 取消ボタン */}
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
