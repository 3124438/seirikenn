import React, { useState, useEffect } from 'react';

// ==========================================
// 2. 共通設定 (Constants)
// ==========================================
const LIMIT_TIME_MINUTES = 30; // 受取期限の分数

// 注文データの型定義（仕様書 DB設計に基づく）
type Order = {
  orderId: string;
  ticketId: string;
  cartItems: any[]; // 商品リスト
  totalAmount: number;
  status: 'ordered' | 'paying' | 'completed' | 'cancelled' | 'force_cancelled';
  createdAt: string; // ISO String想定
};

type OrderMonitoringListProps = {
  orders: Order[];
  onCompletePayment: (orderId: string) => void;
  onForceCancel: (orderId: string, cartItems: any[]) => void;
  onCancel: (orderId: string, cartItems: any[]) => void;
};

// ==========================================
// Module 2: Admin [運営・リアルタイム監視] コンポーネント
// ==========================================
export const OrderMonitoringList: React.FC<OrderMonitoringListProps> = ({
  orders,
  onCompletePayment,
  onForceCancel,
  onCancel,
}) => {
  // リアルタイムで経過時間を再計算するためのステート
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000); // 10秒ごとに更新
    return () => clearInterval(timer);
  }, []);

  // ------------------------------------------
  // sortAndRenderOrders ロジックの実装
  // ------------------------------------------
  const sortedOrders = [...orders]
    // 完了・キャンセル済みは除外（または別タブ扱いとする仕様のため）
    .filter((o) => ['ordered', 'paying'].includes(o.status))
    .sort((a, b) => {
      // 1. 最優先: paying (支払い提示中)
      if (a.status === 'paying' && b.status !== 'paying') return -1;
      if (a.status !== 'paying' && b.status === 'paying') return 1;

      // 2. 通常: ordered (注文時刻順 = 古い順)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  if (sortedOrders.length === 0) {
    return <div className="text-gray-500 text-center py-8">現在進行中のオーダーはありません</div>;
  }

  return (
    <div className="space-y-4">
      {sortedOrders.map((order) => {
        // 時間計算ロジック
        const created = new Date(order.createdAt);
        const diffMs = now.getTime() - created.getTime();
        const diffMinutes = Math.floor(diffMs / 60000);
        
        // 警告判定: LIMIT_TIME_MINUTES 超過
        const isTimeLimitExceeded = diffMinutes > LIMIT_TIME_MINUTES;
        const overdueMinutes = diffMinutes - LIMIT_TIME_MINUTES;

        // ステータス判定
        const isPaying = order.status === 'paying';

        // ------------------------------------------
        // UI更新: カードのスタイル決定
        // ------------------------------------------
        let containerClass = "p-4 rounded-xl border flex flex-col md:flex-row justify-between items-center gap-4 transition-all ";
        let timeDisplay = null;

        if (isPaying) {
          // 最優先表示: 赤/黄色の強調・点滅
          containerClass += "bg-yellow-900/30 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)] animate-pulse";
        } else if (isTimeLimitExceeded) {
          // 警告表示: 赤枠・赤文字
          containerClass += "bg-red-900/20 border-red-500 text-red-200";
        } else {
          // 通常表示
          containerClass += "bg-gray-800 border-gray-600 text-white";
        }

        // 時間表示テキスト生成
        if (isTimeLimitExceeded && !isPaying) {
            timeDisplay = (
                <span className="text-red-400 font-bold text-sm bg-red-900/50 px-2 py-1 rounded border border-red-500 animate-bounce">
                    ⚠️ 経過: {diffMinutes}分 (+{overdueMinutes}分超過)
                </span>
            );
        } else {
            timeDisplay = <span className="text-gray-400 text-xs">経過: {diffMinutes}分</span>;
        }

        return (
          <div key={order.orderId} className={containerClass}>
            {/* 左側: 注文情報 */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-2xl font-mono font-bold text-yellow-400">
                  #{order.ticketId}
                </span>
                {isPaying && (
                  <span className="text-xs font-bold bg-yellow-500 text-black px-2 py-0.5 rounded animate-pulse">
                    支払い提示中
                  </span>
                )}
                {timeDisplay}
              </div>
              
              <div className="text-sm text-gray-300">
                <div className="font-bold">合計: ¥{order.totalAmount.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-1 line-clamp-1">
                    {order.cartItems.map(item => item.name).join(', ')}
                </div>
              </div>
            </div>

            {/* 右側: アクションボタン (Module 2 操作) */}
            <div className="flex gap-2 items-center">
              
              {/* Force Cancel Button: 期限切れの場合のみ目立つように表示 */}
              {isTimeLimitExceeded && !isPaying && (
                <button
                  onClick={() => {
                    if(window.confirm(`チケット #${order.ticketId} を強制キャンセルし、在庫を戻しますか？`)) {
                      onForceCancel(order.orderId, order.cartItems);
                    }
                  }}
                  className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-3 py-3 rounded border border-red-400 shadow-lg whitespace-nowrap"
                >
                  ⚡ 強制キャンセル
                  <span className="block text-[10px] font-normal">(在庫戻し)</span>
                </button>
              )}

              {/* 通常キャンセル (まだ期限内、または支払い中の場合) */}
              {!isTimeLimitExceeded && (
                 <button
                 onClick={() => {
                   if(window.confirm('この注文をキャンセルしますか？')) {
                     onCancel(order.orderId, order.cartItems);
                   }
                 }}
                 className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-3 rounded whitespace-nowrap"
               >
                 キャンセル
               </button>
              )}

              {/* 支払い完了ボタン (completePayment) */}
              <button
                onClick={() => onCompletePayment(order.orderId)}
                className={`font-bold px-6 py-3 rounded shadow-lg transition whitespace-nowrap ${
                    isPaying 
                    ? "bg-green-600 hover:bg-green-500 text-white scale-105" 
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                }`}
              >
                💰 支払い完了
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
