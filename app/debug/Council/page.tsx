// app/debug/Council/page.tsx
"use client"; // ★必須: これを追加することでReactフックが使用可能になります

import React, { useState, useEffect } from 'react';

// --- 定数定義 (仕様書 Section 2) ---
const LIMIT_TIME_MINUTES = 30;

// --- 型定義 (仕様書 Section 3準拠) ---
type OrderStatus = 'ordered' | 'paying' | 'completed' | 'cancelled' | 'force_cancelled';

interface CartItem {
  id: string;
  name: string;
  quantity: number;
}

interface Order {
  id: string;        // Order ID
  ticketId: string;  // Ticket ID (表示用)
  items: CartItem[];
  totalPrice: number;
  status: OrderStatus;
  createdAt: number; // Timestamp (millis)
}

// --- ダミーデータ (動作確認用) ---
// 実際にはFirestoreからsubscribeToOrdersで取得します
const MOCK_ORDERS: Order[] = [
  {
    id: 'o1', ticketId: 'A-001', items: [{ id: 'm1', name: '絶叫コースター', quantity: 2 }], 
    totalPrice: 2000, status: 'paying', createdAt: Date.now() - 1000 * 60 * 5 // 5分前
  },
  {
    id: 'o2', ticketId: 'B-012', items: [{ id: 'm2', name: 'お化け屋敷', quantity: 1 }], 
    totalPrice: 800, status: 'ordered', createdAt: Date.now() - 1000 * 60 * 10 // 10分前
  },
  {
    id: 'o3', ticketId: 'C-005', items: [{ id: 'm1', name: '絶叫コースター', quantity: 3 }], 
    totalPrice: 3000, status: 'ordered', createdAt: Date.now() - 1000 * 60 * 45 // 45分前 (遅延対象)
  },
  {
    id: 'o4', ticketId: 'D-008', items: [{ id: 'm3', name: '観覧車', quantity: 2 }], 
    totalPrice: 1200, status: 'completed', createdAt: Date.now() - 1000 * 60 * 60 
  },
];

export default function CouncilPage() {
  const [systemMode, setSystemMode] = useState<string>('open'); // Module 1: 開店中など
  const [orders, setOrders] = useState<Order[]>(MOCK_ORDERS);
  const [now, setNow] = useState<number>(Date.now());

  // --- Module 2: リアルタイム監視 (時計の更新) ---
  useEffect(() => {
    // 1秒ごとに現在時刻を更新し、遅延判定を再レンダリングさせる
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // --- Module 2: 監視ロジック (subscribeToOrders想定) ---
  // 本来はここでFirestoreのonSnapshotを設定します

  // --- アクション関数 ---

  // Module 1: システムモード更新
  const updateSystemMode = (mode: string) => {
    setSystemMode(mode);
    alert(`システムモードを「${mode}」に変更しました`);
    // TODO: Firestoreのシステム設定を更新
  };

  // Module 2: 支払い完了処理
  const completePayment = (orderId: string) => {
    if (!confirm('支払いを完了としてマークしますか？')) return;
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'completed' } : o));
    // TODO: Firestore update status -> 'completed'
  };

  // Module 2: 通常キャンセル (在庫戻し)
  const cancelOrder = (orderId: string, items: CartItem[]) => {
    if (!confirm('この注文をキャンセルしますか？\n（在庫は自動的に戻ります）')) return;
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' } : o));
    console.log('Stock restored for:', items); 
    // TODO: Firestore update status -> 'cancelled', atomic increment stock
  };

  // Module 2: 強制キャンセル (期限切れ)
  const forceCancelOrder = (orderId: string, items: CartItem[]) => {
    if (!confirm('【警告】受取期限切れのため強制キャンセルします。\nよろしいですか？')) return;
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'force_cancelled' } : o));
    console.log('Stock restored (Force) for:', items);
    // TODO: Firestore update status -> 'force_cancelled', atomic increment stock
  };

  // --- 表示・ソートロジック (sortAndRenderOrders) ---
  const getSortedOrders = () => {
    return [...orders].sort((a, b) => {
        // 1. 最優先: paying
        if (a.status === 'paying' && b.status !== 'paying') return -1;
        if (a.status !== 'paying' && b.status === 'paying') return 1;
        
        // 2. Ordered (古い順)
        if (a.status === 'ordered' && b.status === 'ordered') {
            return a.createdAt - b.createdAt;
        }
        
        // そのほかは新しい順などで適当に
        return b.createdAt - a.createdAt;
    });
  };

  // 遅延判定ヘルパー
  const checkDelay = (createdAt: number) => {
    const elapsedMinutes = Math.floor((now - createdAt) / 60000);
    const isDelayed = elapsedMinutes >= LIMIT_TIME_MINUTES;
    return { isDelayed, elapsedMinutes, overMinutes: elapsedMinutes - LIMIT_TIME_MINUTES };
  };

  const sortedOrders = getSortedOrders();

  return (
    <div className="min-h-screen bg-gray-100 p-6 text-gray-800">
      {/* --- Module 1: Admin Header --- */}
      <div className="mb-8 flex justify-between items-center bg-white p-4 rounded-xl shadow">
        <div>
            <h1 className="text-2xl font-bold text-gray-800">運営管理ダッシュボード</h1>
            <p className="text-sm text-gray-500">Real-time Order Monitor</p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={() => updateSystemMode('pre_open')}
                className={`px-4 py-2 rounded-lg font-bold border ${systemMode === 'pre_open' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'}`}
            >
                開店準備
            </button>
            <button 
                onClick={() => updateSystemMode('open')}
                className={`px-4 py-2 rounded-lg font-bold border ${systemMode === 'open' ? 'bg-green-600 text-white' : 'bg-white text-green-600'}`}
            >
                営業中
            </button>
            <button 
                onClick={() => updateSystemMode('closed')}
                className={`px-4 py-2 rounded-lg font-bold border ${systemMode === 'closed' ? 'bg-red-600 text-white' : 'bg-white text-red-600'}`}
            >
                受付終了
            </button>
        </div>
      </div>

      {/* --- Module 2: Order List --- */}
      <div className="grid gap-4 max-w-4xl mx-auto">
        {sortedOrders.map((order) => {
          // 遅延チェック
          const { isDelayed, elapsedMinutes, overMinutes } = checkDelay(order.createdAt);
          
          // スタイル決定
          let cardClass = "bg-white border-l-4 shadow-sm p-4 rounded-r-lg transition-all";
          let statusLabel = <span className="text-gray-500 font-bold bg-gray-100 px-2 py-1 rounded text-xs">その他</span>;

          if (order.status === 'paying') {
              // 最優先: 会計待ち (赤/黄色で強調・点滅)
              cardClass = "bg-yellow-50 border-l-8 border-yellow-500 shadow-lg ring-2 ring-yellow-400 animate-pulse-slow p-6 rounded";
              statusLabel = <span className="text-yellow-900 font-bold bg-yellow-200 px-3 py-1 rounded-full text-sm animate-pulse">会計待ち (画面提示中)</span>;
          } else if (order.status === 'ordered') {
              if (isDelayed) {
                  // 遅延警告 (赤)
                  cardClass = "bg-red-50 border-l-4 border-red-600 shadow-md p-4 rounded";
                  statusLabel = (
                    <span className="text-red-700 font-bold bg-red-100 px-2 py-1 rounded text-xs flex items-center gap-1">
                        ⚠️ 遅延: {elapsedMinutes}分 (+{overMinutes}分超過)
                    </span>
                  );
              } else {
                  // 通常
                  cardClass = "bg-white border-l-4 border-green-500 shadow p-4 rounded";
                  statusLabel = <span className="text-green-700 font-bold bg-green-100 px-2 py-1 rounded text-xs">確保済み (経過: {elapsedMinutes}分)</span>;
              }
          } else if (order.status === 'completed') {
               cardClass = "bg-gray-50 border-l-4 border-gray-300 opacity-60 p-4 rounded";
               statusLabel = <span className="text-gray-500 font-bold border border-gray-300 px-2 py-1 rounded text-xs">受渡完了</span>;
          } else if (order.status.includes('cancelled')) {
               cardClass = "bg-gray-100 border-l-4 border-gray-400 opacity-50 grayscale p-4 rounded";
               statusLabel = <span className="text-gray-500 font-bold bg-gray-200 px-2 py-1 rounded text-xs">キャンセル済</span>;
          }

          return (
            <div key={order.id} className={cardClass}>
              <div className="flex justify-between items-start mb-2">
                <div>
                   <div className="flex items-center gap-3 mb-1">
                       <span className="font-mono text-xl font-bold text-gray-800 bg-gray-200 px-2 rounded">
                           {order.ticketId}
                       </span>
                       {statusLabel}
                   </div>
                   <div className="text-sm text-gray-600">
                       {order.items.map((item, idx) => (
                           <div key={idx}>・{item.name} × {item.quantity}</div>
                       ))}
                   </div>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">¥{order.totalPrice.toLocaleString()}</p>
                    <p className="text-xs text-gray-400 mt-1">Order ID: {order.id}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 mt-4 border-t pt-3">
                  {order.status === 'paying' && (
                      <button 
                        onClick={() => completePayment(order.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded shadow-lg transform active:scale-95 transition"
                      >
                          支払い完了・受渡
                      </button>
                  )}

                  {order.status === 'ordered' && (
                      <>
                        <button 
                            onClick={() => completePayment(order.id)}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
                        >
                            支払い完了
                        </button>
                        
                        {isDelayed ? (
                            <button 
                                onClick={() => forceCancelOrder(order.id, order.items)}
                                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded shadow border-2 border-red-800"
                            >
                                強制キャンセル (在庫戻し)
                            </button>
                        ) : (
                            <button 
                                onClick={() => cancelOrder(order.id, order.items)}
                                className="text-red-500 hover:bg-red-50 font-bold py-2 px-4 rounded border border-red-200"
                            >
                                キャンセル
                            </button>
                        )}
                      </>
                  )}
              </div>
            </div>
          );
        })}
        
        {sortedOrders.length === 0 && (
            <div className="text-center text-gray-400 py-10">
                注文データがありません
            </div>
        )}
      </div>
    </div>
  );
}
