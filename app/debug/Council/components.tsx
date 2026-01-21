import React, { useState, useEffect } from 'react';

// ★仕様書: 共通設定
const LIMIT_TIME_MINUTES = 30;

// キューリスト取得ヘルパー
const getQueueList = (shop: any) => {
    if (!shop.queue) return { active: [], history: [] };
    const active = shop.queue.filter((t: any) => ['waiting', 'ready'].includes(t.status));
    const history = shop.queue.filter((t: any) => ['completed', 'canceled'].includes(t.status));
    
    active.sort((a: any, b: any) => {
        if (a.status === 'ready' && b.status !== 'ready') return -1;
        if (a.status !== 'ready' && b.status === 'ready') return 1;
        return (a.ticketId || "0").localeCompare(b.ticketId || "0");
    });
    return { active, history };
};

// 予約リスト取得ヘルパー
const getReservationsByTime = (shop: any) => {
    const grouped: any = {};
    Object.keys(shop.slots || {}).sort().forEach(time => { grouped[time] = []; });
    shop.reservations?.forEach((res: any) => { if(grouped[res.time]) grouped[res.time].push(res); });
    return grouped;
};

// --- コンポーネント定義 ---

// ★Module 2: Admin [運営・リアルタイム監視] 実装
export const OrderListView = ({ shop, searchUserId, onOrderAction }: any) => {
    // リアルタイム監視用タイマー (10秒更新で十分な精度)
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 10000);
        return () => clearInterval(timer);
    }, []);

    // アクティブなオーダー（未完了）のみを抽出
    const activeOrders = shop.orders?.filter((o: any) => ['ordered', 'paying'].includes(o.status)) || [];

    // ★仕様書: ソートロジック
    // 1. 最優先 (Status: paying)
    // 2. 通常 (createdAt 昇順 = 古い順)
    activeOrders.sort((a: any, b: any) => {
        // Paying 優先
        if (a.status === 'paying' && b.status !== 'paying') return -1;
        if (a.status !== 'paying' && b.status === 'paying') return 1;

        // 時刻順
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
        return tA - tB;
    });

    if (activeOrders.length === 0) return <div className="text-center py-8 text-gray-500 bg-gray-900/50 rounded-lg">現在進行中のオーダーはありません。</div>;

    return (
        <div className="space-y-4">
            {activeOrders.map((order: any) => {
                // 経過時間計算
                const createdAtMs = order.createdAt?.toMillis ? order.createdAt.toMillis() : new Date(order.createdAt).getTime();
                const elapsedMinutes = Math.floor((now - createdAtMs) / (1000 * 60));
                
                // ★仕様書: 遅延判定ロジック
                const isOverdue = elapsedMinutes > LIMIT_TIME_MINUTES;
                const overdueMinutes = Math.max(0, elapsedMinutes - LIMIT_TIME_MINUTES);
                const isPaying = order.status === 'paying';

                // 検索ハイライト
                const isMatch = searchUserId && order.userId?.includes(searchUserId.toUpperCase());

                // カードのスタイル設定
                let cardClass = "p-4 rounded-xl border transition-all flex flex-col md:flex-row justify-between items-center gap-4 ";
                
                if (isPaying) {
                    // ★仕様書: 会計待ち強調表示 (赤や黄色で点滅)
                    cardClass += "bg-yellow-900/40 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)] animate-pulse ring-1 ring-yellow-400";
                } else if (isOverdue) {
                    // ★仕様書: 警告表示 (枠線や文字色を赤)
                    cardClass += "bg-red-900/20 border-red-500 shadow-[0_0_10px_rgba(220,38,38,0.3)]";
                } else {
                    cardClass += "bg-gray-800 border-gray-600";
                }
                
                if (isMatch) cardClass += " ring-2 ring-pink-500";

                return (
                    <div key={order.id} className={cardClass}>
                        {/* 左側: 情報エリア */}
                        <div className="flex-1 min-w-0 w-full">
                            <div className="flex items-center gap-3 mb-2">
                                <span className={`font-mono text-2xl font-bold ${isPaying ? 'text-yellow-400' : 'text-white'}`}>
                                    #{order.ticketId}
                                </span>
                                
                                {isPaying && (
                                    <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded">
                                        支払い提示中
                                    </span>
                                )}
                                
                                <div className="text-sm">
                                    {isOverdue ? (
                                        <span className="text-red-400 font-bold">
                                            経過: {elapsedMinutes}分 (+{overdueMinutes}分超過)
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">
                                            経過: {elapsedMinutes}分 / リミット: {LIMIT_TIME_MINUTES}分
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* 商品リスト */}
                            <div className="text-sm text-gray-300 bg-black/20 p-2 rounded">
                                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-1">
                                    {order.items?.map((item: any, idx: number) => (
                                        <span key={idx} className="whitespace-nowrap">
                                            {item.name} <span className="font-mono text-gray-400">x{item.count}</span>
                                        </span>
                                    ))}
                                </div>
                                <div className="font-bold text-white border-t border-white/10 pt-1 mt-1">
                                    合計: ¥{order.totalAmount?.toLocaleString()}
                                </div>
                            </div>
                        </div>

                        {/* 右側: アクションボタンエリア */}
                        <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto">
                            {/* 支払い完了ボタン (常に表示) */}
                            <button 
                                onClick={() => onOrderAction(shop, order, 'payment')} 
                                className={`font-bold py-3 px-6 rounded shadow-lg whitespace-nowrap flex items-center justify-center gap-2 transition-transform
                                    ${isPaying 
                                        ? 'bg-green-600 hover:bg-green-500 text-white scale-105' 
                                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                                    }`}
                            >
                                <span>💰</span> 支払い完了
                            </button>

                            <div className="flex gap-2 w-full">
                                {/* ★仕様書: 強制キャンセルボタン (期限切れ時のみ表示) */}
                                {isOverdue && !isPaying && (
                                    <button 
                                        onClick={() => onOrderAction(shop, order, 'force_cancel')}
                                        className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 px-3 rounded border border-red-400 shadow-lg whitespace-nowrap"
                                    >
                                        ⚡ 強制キャンセル
                                    </button>
                                )}

                                {/* 通常キャンセル (期限切れ前・未支払い時) */}
                                {!isOverdue && !isPaying && (
                                    <button 
                                        onClick={() => onOrderAction(shop, order, 'cancel')}
                                        className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs py-2 px-3 rounded border border-gray-600 whitespace-nowrap"
                                    >
                                        キャンセル
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export const QueueListView = ({ shop, searchUserId, onUpdateStatus }: any) => {
    const { active } = getQueueList(shop);

    if (active.length === 0) return <div className="text-center py-8 text-gray-500 bg-gray-900/50 rounded-lg">現在待機しているユーザーはいません。</div>;

    return (
        <div className="space-y-2">
            {active.map((ticket: any, index: number) => {
                const isReady = ticket.status === 'ready';
                const isMatch = searchUserId && ticket.userId?.includes(searchUserId.toUpperCase());
                
                return (
                    <div key={ticket.userId || index} className={`flex items-center justify-between p-3 rounded-lg border ${isReady ? 'bg-red-900/30 border-red-500 animate-pulse-slow' : 'bg-gray-700 border-gray-600'} ${isMatch ? 'ring-2 ring-pink-500' : ''}`}>
                        <div className="flex items-center gap-4">
                            <div className={`text-2xl font-mono font-bold w-20 text-center ${isReady ? 'text-red-400' : 'text-gray-400'}`}>
                                {ticket.ticketId ? ticket.ticketId : `#${index + 1}`}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-lg text-white">{ticket.userId}</span>
                                    <span className="bg-gray-800 text-xs px-2 py-0.5 rounded text-gray-300 border border-gray-600">{ticket.count || 1}名</span>
                                </div>
                                <div className="text-xs mt-1">
                                    {isReady ? 
                                        <span className="text-red-400 font-bold flex items-center gap-1">🔔 呼び出し中...</span> : 
                                        <span className="text-gray-400">待機中 (受付: {new Date(ticket.timestamp).toLocaleTimeString()})</span>
                                    }
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {isReady ? (
                                <button onClick={() => onUpdateStatus(shop, ticket, 'completed')} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded shadow-lg text-sm">✅ 入場処理</button>
                            ) : (
                                <button onClick={() => onUpdateStatus(shop, ticket, 'ready')} className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded shadow-lg text-sm">🔔 呼び出し</button>
                            )}
                            <button onClick={() => onUpdateStatus(shop, ticket, 'canceled')} className="bg-gray-600 hover:bg-gray-500 text-white text-xs py-2 px-3 rounded">取消</button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export const ReservationListView = ({ shop, searchUserId, onToggleStatus, onCancel }: any) => {
    const grouped = getReservationsByTime(shop);

    return (
        <div className="space-y-6">
            {Object.keys(grouped).map(time => {
                const list = grouped[time];
                if (list.length === 0) return null;

                return (
                    <div key={time} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                        <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-1">
                            <h4 className="text-lg font-mono font-bold text-blue-300">⏰ {time}</h4>
                            <span className="text-xs text-gray-500">{list.length}組 予約済み</span>
                        </div>
                        <div className="space-y-2">
                            {list.map((res: any) => {
                                const isMatch = searchUserId && res.userId?.includes(searchUserId.toUpperCase());
                                return (
                                    <div key={res.timestamp} className={`flex items-center justify-between bg-gray-700 p-2 rounded border border-gray-600 ${isMatch ? 'ring-2 ring-pink-500' : ''}`}>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className={`font-mono font-bold ${res.status === 'used' ? 'text-gray-500 line-through' : 'text-white'}`}>{res.userId}</span>
                                                <span className="bg-gray-800 text-[10px] px-1.5 py-0.5 rounded text-gray-400 border border-gray-600">{res.people}名</span>
                                            </div>
                                            {res.status === 'used' && <span className="text-[10px] text-green-400">● 入場済み</span>}
                                        </div>
                                        <div className="flex gap-2">
                                            {res.status === 'used' ? (
                                                <button onClick={() => onToggleStatus(shop, res, "reserved")} className="bg-gray-600 text-[10px] px-2 py-1 rounded">未入場に戻す</button>
                                            ) : (
                                                <button onClick={() => onToggleStatus(shop, res, "used")} className="bg-green-600 hover:bg-green-500 text-[10px] px-3 py-1 rounded font-bold shadow">入場</button>
                                            )}
                                            <button onClick={() => onCancel(shop, res)} className="bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-800 text-[10px] px-2 py-1 rounded">削除</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
