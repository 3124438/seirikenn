//app/debug/ShopList.tsx
"use client";
import React from "react";

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
   
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {attractions.map(shop => {
        // 検索ヒット判定 (既存: 予約/順番待ち)
        const hitInRes = shop.reservations?.some((r: any) => r.userId?.includes(searchUserId.toUpperCase()));
        const hitInQueue = shop.queue?.some((q: any) => q.userId?.includes(searchUserId.toUpperCase()) || q.ticketId?.includes(searchUserId.toUpperCase()));
        
        // 検索ヒット判定 (新規: オーダーシステム) 
        // ※リストデータに orders が含まれている場合を考慮
        const hitInOrders = shop.orders?.some((o: any) => o.ticketId?.includes(searchUserId.toUpperCase()));

        const hasUser = searchUserId && (hitInRes || hitInQueue || hitInOrders);

        const blacklisted = isUserBlacklisted(shop);
        const notWhitelisted = isUserNotWhitelisted(shop);
        const adminRestricted = isAdminRestrictedAndNotAllowed(shop);
        const isLocked = blacklisted || notWhitelisted || adminRestricted;

        // Module 1: System Mode (オーダーシステムの営業モード)
        const systemMode = shop.systemMode || "closed"; // default
        const hasMenu = shop.menu && shop.menu.length > 0;

        return (
          <button
            key={shop.id}
            onClick={() => handleExpandShop(shop.id)}
            className={`group p-4 rounded-xl border text-left flex items-start gap-4 transition hover:bg-gray-800 relative overflow-hidden
              ${hasUser ? 'bg-pink-900/40 border-pink-500' : 'bg-gray-800 border-gray-600'}
              ${isLocked ? 'opacity-70 bg-gray-900 grayscale' : ''}
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

                {/* 状態表示バッジ (既存) */}
                {blacklisted && <span className="text-xs bg-red-900 text-red-200 border border-red-700 px-2 py-0.5 rounded font-bold">⛔ BAN指定</span>}
                {notWhitelisted && <span className="text-xs bg-gray-700 text-gray-300 border border-gray-500 px-2 py-0.5 rounded font-bold">🔒 許可外</span>}
                {(!blacklisted && !notWhitelisted && adminRestricted) && <span className="text-xs bg-purple-900 text-purple-200 border border-purple-700 px-2 py-0.5 rounded font-bold">🛡️ スタッフ限</span>}

                {/* 既存モード表示 */}
                {shop.isQueueMode ? (
                  <span className="text-xs bg-green-900/60 text-green-300 border border-green-700 px-2 py-0.5 rounded">🔢 順番待ち</span>
                ) : (
                  <span className="text-xs bg-blue-900/60 text-blue-300 border border-blue-700 px-2 py-0.5 rounded">🕒 時間予約</span>
                )}

                {/* 新規: オーダーシステムの状態表示 (Module 1) */}
                {hasMenu && (
                  <>
                    {systemMode === 'open' && <span className="text-xs bg-orange-600 text-white border border-orange-400 px-2 py-0.5 rounded font-bold animate-pulse-slow">🛒 営業中</span>}
                    {systemMode === 'pre_open' && <span className="text-xs bg-yellow-600 text-black border border-yellow-400 px-2 py-0.5 rounded font-bold">⚠️ 準備中</span>}
                    {systemMode === 'closed' && <span className="text-xs bg-gray-700 text-gray-400 border border-gray-500 px-2 py-0.5 rounded">🚫 受付終了</span>}
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold text-lg truncate w-full">{shop.name}</span>
                {shop.isPaused && <span className="text-xs bg-red-600 px-2 py-0.5 rounded text-white whitespace-nowrap">停止中</span>}
              </div>
              
              <div className="text-xs text-gray-400 mt-1 flex gap-3">
                {/* 既存ステータス */}
                {shop.isQueueMode ? (
                  <span>待機: {shop.queue?.length || 0}組</span>
                ) : (
                  <span>予約: {shop.reservations?.length || 0}件</span>
                )}

                {/* 新規: メニュー数表示 */}
                {hasMenu && (
                  <span className="text-orange-300 border-l border-gray-600 pl-3">
                    Menu: {shop.menu.length}種
                  </span>
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
