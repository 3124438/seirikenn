"use client";
import React, { useState, useEffect } from "react";

// ★共通設定 (Module 2: Constants)
const LIMIT_TIME_MINUTES = 30;

type Props = {
  attractions: any[];
  searchUserId: string;
  handleExpandShop: (id: string) => void;
  // 権限チェック関数を受け取る
  isUserBlacklisted: (shop: any) => boolean;
  isUserNotWhitelisted: (shop: any) => boolean;
  isAdminRestrictedAndNotAllowed: (shop: any) => boolean;
};

export default function ShopList({ 
  attractions, 
  searchUserId, 
  handleExpandShop, 
  isUserBlacklisted, 
  isUserNotWhitelisted, 
  isAdminRestrictedAndNotAllowed 
}: Props) {
  
  // ★Module 2: リアルタイム監視用の現在時刻ステート (1分毎更新)
  // これにより一覧画面を開いたままでも「経過時間超過」がリアルタイムに反映される
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {attractions.map(shop => {
        // 検索ヒット判定
        const hitInRes = shop.reservations?.some((r: any) => r.userId?.includes(searchUserId.toUpperCase()));
        const hitInQueue = shop.queue?.some((q: any) => q.userId?.includes(searchUserId.toUpperCase()) || q.ticketId?.includes(searchUserId.toUpperCase()));
        const hasUser = searchUserId && (hitInRes || hitInQueue);

        const blacklisted = isUserBlacklisted(shop);
        const notWhitelisted = isUserNotWhitelisted(shop);
        const adminRestricted = isAdminRestrictedAndNotAllowed(shop);
        const isLocked = blacklisted || notWhitelisted || adminRestricted;

        // ★Module 2: 遅延オーダーの集計と監視
        // 未完了(ordered/paying)かつ制限時間を超えているオーダーの件数をカウントする
        const overdueOrdersCount = shop.orders?.filter((order: any) => {
            const isActive = order.status === 'ordered' || order.status === 'paying';
            if (!isActive) return false;

            // タイムスタンプ形式の差異に対応 (Firestore Timestamp / Date / number)
            const createdAtMs = order.createdAt?.toMillis 
                ? order.createdAt.toMillis() 
                : (order.createdAt instanceof Date ? order.createdAt.getTime() : new Date(order.createdAt).getTime());
            
            // 経過時間計算
            const elapsedMinutes = Math.floor((now - createdAtMs) / (1000 * 60));
            
            // 警告判定
            return elapsedMinutes > LIMIT_TIME_MINUTES;
        }).length || 0;

        return (
          <button
            key={shop.id}
            onClick={() => handleExpandShop(shop.id)}
            className={`group p-4 rounded-xl border text-left flex items-start gap-4 transition hover:bg-gray-800 relative overflow-hidden
              ${hasUser ? 'bg-pink-900/40 border-pink-500' : 'bg-gray-800 border-gray-600'}
              ${isLocked ? 'opacity-70 bg-gray-900 grayscale' : ''}
              ${/* ★Module 2: 遅延がある場合は枠線を赤くして注意を促す */ overdueOrdersCount > 0 && !hasUser ? 'border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.2)]' : ''}
            `}
          >
            {/* 画像サムネイル */}
            {shop.imageUrl ? (
              <img src={shop.imageUrl} alt="" className="w-16 h-16 rounded object-cover bg-gray-700 flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded bg-gray-700 flex items-center justify-center text-2xl flex-shrink-0">🎪</div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-yellow-400 font-bold font-mono text-xl">{shop.id}</span>
                
                {shop.department && (
                  <span className="text-xs bg-blue-900/50 text-blue-200 px-2 py-0.5 rounded border border-blue-800/50 truncate max-w-[100px]">
                    {shop.department}
                  </span>
                )}

                {/* 状態表示バッジ */}
                {blacklisted && <span className="text-xs bg-red-900 text-red-200 border border-red-700 px-2 py-0.5 rounded font-bold">⛔ BAN指定</span>}
                {notWhitelisted && <span className="text-xs bg-gray-700 text-gray-300 border border-gray-500 px-2 py-0.5 rounded font-bold">🔒 許可外</span>}
                {(!blacklisted && !notWhitelisted && adminRestricted) && <span className="text-xs bg-purple-900 text-purple-200 border border-purple-700 px-2 py-0.5 rounded font-bold">🛡️ スタッフ限</span>}
                
                {/* ★Module 2: 遅延警告バッジ */}
                {overdueOrdersCount > 0 && (
                  <span className="text-xs bg-red-600 text-white border border-red-400 px-2 py-0.5 rounded font-bold animate-pulse shadow-md flex items-center gap-1">
                    ⚠️ 遅延:{overdueOrdersCount}件
                  </span>
                )}

                {shop.isQueueMode ? (
                  <span className="text-xs bg-green-900/60 text-green-300 border border-green-700 px-2 py-0.5 rounded">🔢 順番待ち</span>
                ) : (
                  <span className="text-xs bg-blue-900/60 text-blue-300 border border-blue-700 px-2 py-0.5 rounded">🕒 時間予約</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold text-lg truncate w-full">{shop.name}</span>
                {shop.isPaused && <span className="text-xs bg-red-600 px-2 py-0.5 rounded text-white whitespace-nowrap">停止中</span>}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {shop.isQueueMode ? (
                  <span>待機: {shop.queue?.length || 0}組</span>
                ) : (
                  <span>予約: {shop.reservations?.length || 0}件</span>
                )}
              </div>
            </div>

            <div className="self-center text-gray-400 text-2xl group-hover:text-white transition-transform group-hover:translate-x-1">
              ›
            </div>
          </button>
        );
      })}
    </div>
  );
}
