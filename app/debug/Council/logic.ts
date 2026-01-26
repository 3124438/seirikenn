import React, { useState } from 'react';

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

// --- 既存コンポーネント ---

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

// --- 新規コンポーネント (Module 1 & 2) ---

/**
 * Module 1: メニュー管理コンポーネント
 */
export const MenuManagementView = ({ menuItems, onAddMenu, onUpdateStock, onDeleteMenu }: any) => {
    const [newItem, setNewItem] = useState({ name: "", price: 100, stock: 50, limit: 5 });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onAddMenu(newItem.name, Number(newItem.price), Number(newItem.stock), Number(newItem.limit));
        setNewItem({ name: "", price: 100, stock: 50, limit: 5 });
    };

    return (
        <div className="space-y-6">
            {/* 追加フォーム */}
            <form onSubmit={handleSubmit} className="bg-gray-800 p-4 rounded-lg border border-gray-700 shadow-md">
                <h3 className="text-md font-bold text-gray-300 mb-3">🍽 新規メニュー追加</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <input 
                        type="text" placeholder="商品名" required value={newItem.name}
                        onChange={e => setNewItem({...newItem, name: e.target.value})}
                        className="bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2 w-full"
                    />
                    <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-xs">¥</span>
                        <input 
                            type="number" placeholder="価格" required value={newItem.price}
                            onChange={e => setNewItem({...newItem, price: Number(e.target.value)})}
                            className="bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2 w-full"
                        />
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-xs">在庫</span>
                        <input 
                            type="number" placeholder="初期在庫" required value={newItem.stock}
                            onChange={e => setNewItem({...newItem, stock: Number(e.target.value)})}
                            className="bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2 w-full"
                        />
                    </div>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded py-2 text-sm transition-colors">
                        追加
                    </button>
                </div>
            </form>

            {/* メニューリスト */}
            <div className="grid gap-3">
                {menuItems.length === 0 && <div className="text-center text-gray-500 py-4">メニューがありません</div>}
                {menuItems.map((item: any) => (
                    <div key={item.id} className="bg-gray-900/50 p-3 rounded-lg border border-gray-700 flex items-center justify-between">
                        <div>
                            <div className="font-bold text-white text-lg">{item.name}</div>
                            <div className="text-xs text-gray-400">単価: ¥{item.price} / 上限: {item.limit}個</div>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* 在庫管理コントロール */}
                            <div className="flex flex-col items-center bg-gray-800 rounded px-2 py-1 border border-gray-600">
                                <span className="text-[10px] text-gray-400 mb-0.5">現在庫</span>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => onUpdateStock(item.id, -1)} className="w-6 h-6 flex items-center justify-center bg-red-900/50 text-red-200 rounded hover:bg-red-800">-</button>
                                    <span className={`font-mono text-lg font-bold w-10 text-center ${item.stock === 0 ? 'text-red-500' : 'text-white'}`}>
                                        {item.stock}
                                    </span>
                                    <button type="button" onClick={() => onUpdateStock(item.id, 1)} className="w-6 h-6 flex items-center justify-center bg-blue-900/50 text-blue-200 rounded hover:bg-blue-800">+</button>
                                </div>
                            </div>
                            
                            <button onClick={() => onDeleteMenu(item.id)} className="text-gray-500 hover:text-red-400 p-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

/**
 * Module 2: 注文監視・決済ダッシュボード
 */
export const OrderDashboardView = ({ sortedOrders, onCompletePayment, onCancelOrder, isOrderDelayed }: any) => {
    
    if (!sortedOrders || sortedOrders.length === 0) {
        return <div className="text-center py-12 text-gray-500 bg-gray-900/50 rounded-xl border-2 border-dashed border-gray-700">現在、注文はありません</div>;
    }

    return (
        <div className="space-y-4">
            {sortedOrders.map((order: any) => {
                const isPaying = order.status === 'paying';
                const isDelayed = isOrderDelayed(order);
                
                // 視覚効果の切り替え
                const containerClass = isPaying
                    ? "bg-yellow-900/20 border-yellow-500/80 shadow-[0_0_15px_rgba(234,179,8,0.3)] transform scale-[1.02] z-10 my-6" // 会計待ち：拡大・強調
                    : isDelayed
                        ? "bg-red-900/10 border-red-500/80 shadow-[0_0_10px_rgba(239,68,68,0.2)]" // 遅延：赤枠
                        : "bg-gray-800 border-gray-700"; // 通常

                return (
                    <div key={order.id} className={`relative p-4 rounded-xl border-2 transition-all duration-300 ${containerClass}`}>
                        
                        {/* バッジ表示 */}
                        <div className="absolute -top-3 left-4 flex gap-2">
                            {isPaying && (
                                <span className="bg-yellow-500 text-black font-bold px-3 py-1 text-xs rounded-full shadow-lg animate-pulse">
                                    💰 会計待ち
                                </span>
                            )}
                            {isDelayed && !isPaying && (
                                <span className="bg-red-600 text-white font-bold px-3 py-1 text-xs rounded-full shadow-lg">
                                    ⚠ 30分経過
                                </span>
                            )}
                            {!isPaying && !isDelayed && (
                                <span className="bg-blue-600 text-white font-bold px-3 py-1 text-xs rounded-full shadow-lg">
                                    👨‍🍳 調理中
                                </span>
                            )}
                        </div>

                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mt-2 gap-4">
                            {/* チケット情報 */}
                            <div className="flex items-center gap-4">
                                <div className={`font-mono text-3xl font-bold tracking-wider ${isPaying ? 'text-yellow-400' : 'text-gray-300'}`}>
                                    {order.ticketId}
                                </div>
                                <div>
                                    <div className="text-xs text-gray-400">注文時刻: {order.createdAt?.toDate().toLocaleTimeString()}</div>
                                    <div className="font-bold text-xl text-white">¥{order.totalAmount?.toLocaleString()}</div>
                                </div>
                            </div>

                            {/* 注文内容 */}
                            <div className="flex-1 bg-gray-900/50 p-2 rounded text-sm text-gray-300 w-full md:w-auto">
                                <ul className="list-disc list-inside space-y-1">
                                    {order.items?.map((item: any, idx: number) => (
                                        <li key={idx} className="flex justify-between">
                                            <span>{item.name}</span>
                                            <span className="font-mono text-white">x{item.quantity}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* アクションボタン */}
                            <div className="flex gap-2 w-full md:w-auto justify-end">
                                {isPaying ? (
                                    <button 
                                        onClick={() => onCompletePayment(order.id)}
                                        className="bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold py-3 px-6 rounded-lg shadow-lg transform active:scale-95 transition-all w-full md:w-auto"
                                    >
                                        受渡完了
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => onCompletePayment(order.id)}
                                        className="bg-green-700 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg shadow transition-all"
                                    >
                                        提供完了
                                    </button>
                                )}
                                
                                <button 
                                    onClick={() => onCancelOrder(order)}
                                    className="bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 px-4 rounded-lg border border-gray-600 transition-all text-xs md:text-sm"
                                >
                                    キャンセル
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
