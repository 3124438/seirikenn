// app/debug/Council
import React, { useState } from 'react';

// --- Constants ---
const LIMIT_TIME_MINUTES = 30;

// --- Helpers ---

// 既存: キューリスト取得ヘルパー
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

// 既存: 予約リスト取得ヘルパー
const getReservationsByTime = (shop: any) => {
    const grouped: any = {};
    Object.keys(shop.slots || {}).sort().forEach(time => { grouped[time] = []; });
    shop.reservations?.forEach((res: any) => { if(grouped[res.time]) grouped[res.time].push(res); });
    return grouped;
};

// 新規: 注文リストソート・遅延判定ヘルパー
const getOrderList = (shop: any) => {
    if (!shop.orders) return [];
    
    // 表示対象のステータス
    const activeOrders = shop.orders.filter((o: any) => ['paying', 'ordered'].includes(o.status));

    // ソートロジック
    // 1. Status: paying (会計待ち) が最上位
    // 2. Status: ordered (調理待ち) は古い順 (FIFO)
    activeOrders.sort((a: any, b: any) => {
        if (a.status === 'paying' && b.status !== 'paying') return -1;
        if (a.status !== 'paying' && b.status === 'paying') return 1;
        
        // どちらも同じステータスの場合はチケットID（または作成日時）の昇順
        const idA = a.ticketId || "";
        const idB = b.ticketId || "";
        return idA.localeCompare(idB);
    });

    return activeOrders;
};

// 新規: 遅延判定 (30分経過)
const isDelayed = (createdAt: any) => {
    if (!createdAt) return false;
    const createdTime = typeof createdAt.toDate === 'function' ? createdAt.toDate() : new Date(createdAt);
    const diffMs = Date.now() - createdTime.getTime();
    const diffMins = diffMs / (1000 * 60);
    return diffMins > LIMIT_TIME_MINUTES;
};

// --- Components ---

/**
 * 既存: 順番待ち管理ビュー
 */
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

/**
 * 既存: 予約管理ビュー
 */
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

/**
 * 新規: メニュー管理ビュー (Module 1)
 */
export const MenuManagementView = ({ shop, onAddMenu, onUpdateMenuStock, onDeleteMenu }: any) => {
    const [newItem, setNewItem] = useState({ name: '', price: 0, stock: 10, limit: 5 });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newItem.name) return;
        onAddMenu(shop.id, newItem);
        setNewItem({ name: '', price: 0, stock: 10, limit: 5 });
    };

    const menuList = shop.menu || [];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* メニュー追加フォーム */}
            <div className="md:col-span-1 bg-gray-800 p-4 rounded-lg border border-gray-700 h-fit">
                <h3 className="text-lg font-bold text-gray-200 mb-4 border-b border-gray-600 pb-2">新規メニュー追加</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">商品名</label>
                        <input 
                            type="text" 
                            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                            value={newItem.name}
                            onChange={e => setNewItem({...newItem, name: e.target.value})}
                            placeholder="例: 限定ドリンク"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">価格 (円)</label>
                            <input 
                                type="number" 
                                className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                                value={newItem.price}
                                onChange={e => setNewItem({...newItem, price: Number(e.target.value)})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">購入制限 (個)</label>
                            <input 
                                type="number" 
                                className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                                value={newItem.limit}
                                onChange={e => setNewItem({...newItem, limit: Number(e.target.value)})}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">初期在庫数</label>
                        <input 
                            type="number" 
                            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                            value={newItem.stock}
                            onChange={e => setNewItem({...newItem, stock: Number(e.target.value)})}
                        />
                    </div>
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded mt-2">
                        追加
                    </button>
                </form>
            </div>

            {/* メニュー一覧・在庫管理 */}
            <div className="md:col-span-2 space-y-3">
                <h3 className="text-lg font-bold text-gray-200 mb-2">メニュー在庫管理</h3>
                {menuList.length === 0 ? (
                    <div className="text-gray-500 text-center py-8 bg-gray-800 rounded">メニューが登録されていません</div>
                ) : (
                    menuList.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between bg-gray-800 p-3 rounded border border-gray-700">
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-white text-lg">{item.name}</span>
                                    <span className="text-xs text-gray-400">¥{item.price}</span>
                                </div>
                                <div className="text-xs text-gray-500">制限: {item.limit}個まで</div>
                            </div>
                            
                            <div className="flex items-center gap-6">
                                <div className="flex flex-col items-center">
                                    <span className="text-xs text-gray-400 mb-1">現在在庫</span>
                                    <div className="flex items-center gap-1 bg-gray-900 rounded p-1">
                                        <button 
                                            onClick={() => onUpdateMenuStock(shop.id, item.id, item.stock - 1)}
                                            className="w-8 h-8 flex items-center justify-center bg-red-900/50 text-red-200 hover:bg-red-800 rounded font-bold"
                                        >
                                            -
                                        </button>
                                        <span className="w-12 text-center font-mono text-xl font-bold text-white">{item.stock}</span>
                                        <button 
                                            onClick={() => onUpdateMenuStock(shop.id, item.id, item.stock + 1)}
                                            className="w-8 h-8 flex items-center justify-center bg-blue-900/50 text-blue-200 hover:bg-blue-800 rounded font-bold"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => onDeleteMenu(shop.id, item.id)}
                                    className="text-gray-500 hover:text-red-400 text-sm underline"
                                >
                                    削除
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

/**
 * 新規: 注文監視・決済ダッシュボード (Module 2)
 */
export const OrderDashboardView = ({ shop, onUpdateOrderStatus }: any) => {
    const orders = getOrderList(shop);

    if (orders.length === 0) return <div className="text-center py-12 text-gray-500 bg-gray-900/50 rounded-lg text-lg">現在の注文はありません</div>;

    return (
        <div className="space-y-4">
            {orders.map((order: any) => {
                const isPaying = order.status === 'paying';
                const delayed = !isPaying && isDelayed(order.createdAt);
                
                // 視認性を高めるクラス定義
                const containerClass = isPaying
                    ? "bg-gray-800 border-4 border-yellow-500 transform scale-[1.02] shadow-2xl shadow-yellow-900/20 z-10" // 会計待ち：拡大・強調
                    : delayed
                        ? "bg-gray-800 border-2 border-red-500" // 遅延：赤枠
                        : "bg-gray-800 border border-gray-700"; // 通常

                return (
                    <div key={order.id} className={`flex items-center justify-between p-4 rounded-xl transition-all ${containerClass}`}>
                        
                        {/* 左側: チケット情報・注文内容 */}
                        <div className="flex items-center gap-6">
                            <div className="flex flex-col items-center justify-center w-24">
                                <span className="text-xs text-gray-400 uppercase tracking-wider">Ticket</span>
                                <span className={`font-mono text-3xl font-black ${isPaying ? 'text-yellow-400' : 'text-white'}`}>
                                    {order.ticketId}
                                </span>
                            </div>
                            
                            <div className="h-12 w-px bg-gray-600 mx-2"></div>
                            
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-bold text-lg text-white">¥{order.totalAmount?.toLocaleString()}</span>
                                    {isPaying && <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded animate-pulse">お会計お願いします</span>}
                                    {delayed && <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded">30分経過</span>}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {order.items?.map((item: any, idx: number) => (
                                        <span key={idx} className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded border border-gray-600">
                                            {item.name} ×{item.quantity}
                                        </span>
                                    ))}
                                </div>
                                <div className="text-[10px] text-gray-500 mt-1">
                                    注文時刻: {order.createdAt?.toDate().toLocaleTimeString()}
                                </div>
                            </div>
                        </div>

                        {/* 右側: アクションボタン */}
                        <div className="flex gap-3">
                            {isPaying ? (
                                <button 
                                    onClick={() => onUpdateOrderStatus(shop.id, order.id, 'completed', order.items)}
                                    className="bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-bold py-3 px-6 rounded-lg shadow-lg text-lg transform hover:scale-105 transition-transform"
                                >
                                    受渡・完了
                                </button>
                            ) : (
                                <button 
                                    onClick={() => onUpdateOrderStatus(shop.id, order.id, 'paying', order.items)}
                                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded shadow"
                                >
                                    会計呼出
                                </button>
                            )}
                            
                            <button 
                                onClick={() => onUpdateOrderStatus(shop.id, order.id, 'cancelled', order.items)}
                                className="bg-gray-700 hover:bg-red-900/50 hover:text-red-200 text-gray-400 border border-gray-600 py-2 px-4 rounded font-medium transition-colors"
                            >
                                キャンセル
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// --- Main Container (Default Export) ---

export default function Council({ shop, onUpdateStatus, onToggleStatus, onCancel, onAddMenu, onUpdateMenuStock, onDeleteMenu, onUpdateOrderStatus }: any) {
    const [activeTab, setActiveTab] = useState<'queue' | 'reservation' | 'orders' | 'menu'>('queue');
    const [searchUserId, setSearchUserId] = useState('');

    if (!shop) return null;

    return (
        <div className="flex flex-col h-full bg-gray-900 text-white p-4 space-y-4">
            {/* Header / Tabs */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-800 p-4 rounded-xl border border-gray-700">
                <div className="flex gap-2 bg-gray-900 p-1 rounded-lg">
                    <button 
                        onClick={() => setActiveTab('queue')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'queue' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        順番待ち
                    </button>
                    <button 
                        onClick={() => setActiveTab('reservation')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'reservation' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        予約リスト
                    </button>
                    <button 
                        onClick={() => setActiveTab('orders')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'orders' ? 'bg-yellow-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        オーダー
                    </button>
                    <button 
                        onClick={() => setActiveTab('menu')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'menu' ? 'bg-gray-700 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        メニュー管理
                    </button>
                </div>

                {/* Search Bar (Queue/Reservation/Order共通で利用可能) */}
                {(activeTab !== 'menu') && (
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="ユーザーID検索..." 
                            className="bg-gray-900 border border-gray-600 rounded-full py-2 px-4 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                            value={searchUserId}
                            onChange={(e) => setSearchUserId(e.target.value)}
                        />
                        <span className="absolute left-3 top-2.5 text-gray-500">🔍</span>
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto">
                {activeTab === 'queue' && (
                    <QueueListView 
                        shop={shop} 
                        searchUserId={searchUserId} 
                        onUpdateStatus={onUpdateStatus} 
                    />
                )}
                {activeTab === 'reservation' && (
                    <ReservationListView 
                        shop={shop} 
                        searchUserId={searchUserId} 
                        onToggleStatus={onToggleStatus} 
                        onCancel={onCancel} 
                    />
                )}
                {activeTab === 'orders' && (
                    <OrderDashboardView 
                        shop={shop} 
                        onUpdateOrderStatus={onUpdateOrderStatus}
                    />
                )}
                {activeTab === 'menu' && (
                    <MenuManagementView 
                        shop={shop} 
                        onAddMenu={onAddMenu}
                        onUpdateMenuStock={onUpdateMenuStock}
                        onDeleteMenu={onDeleteMenu}
                    />
                )}
            </div>
        </div>
    );
}
