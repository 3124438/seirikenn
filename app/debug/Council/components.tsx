// app/debug/Council/components.tsx
import React, { useState } from 'react';
import { MenuItem, Order, CartItem } from './logic'; // logic.tsで定義した型を想定

// --- Helper Functions ---
const formatCurrency = (val: number) => `¥${val.toLocaleString()}`;

const formatTime = (dateObj: any) => {
    if (!dateObj) return "--:--";
    const date = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
};

// --- Module 1: Menu Management Component ---

export const MenuManagementView = ({ menuItems, onAdd, onUpdate, onDelete }: any) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newItem, setNewItem] = useState({ name: '', price: 0, stock: 0, limit: 1, displayOrder: 0 });

    const handleAddSubmit = () => {
        if (!newItem.name) return;
        onAdd(newItem);
        setNewItem({ name: '', price: 0, stock: 0, limit: 1, displayOrder: 0 });
        setIsAdding(false);
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-200">📦 メニュー在庫管理</h3>
                <button 
                    onClick={() => setIsAdding(!isAdding)}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm font-bold"
                >
                    {isAdding ? "キャンセル" : "+ 商品追加"}
                </button>
            </div>

            {isAdding && (
                <div className="bg-gray-800 p-4 rounded mb-4 border border-blue-500/50">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                        <input placeholder="商品名" className="bg-gray-700 text-white p-2 rounded" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                        <input type="number" placeholder="価格" className="bg-gray-700 text-white p-2 rounded" value={newItem.price} onChange={e => setNewItem({...newItem, price: Number(e.target.value)})} />
                        <input type="number" placeholder="初期在庫" className="bg-gray-700 text-white p-2 rounded" value={newItem.stock} onChange={e => setNewItem({...newItem, stock: Number(e.target.value)})} />
                        <input type="number" placeholder="購入制限(個/人)" className="bg-gray-700 text-white p-2 rounded" value={newItem.limit} onChange={e => setNewItem({...newItem, limit: Number(e.target.value)})} />
                    </div>
                    <button onClick={handleAddSubmit} className="w-full bg-blue-600 py-2 rounded text-white font-bold">登録</button>
                </div>
            )}

            <div className="grid gap-3">
                {menuItems.map((item: MenuItem) => (
                    <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg border ${item.stock <= 0 ? 'bg-gray-800 border-gray-700 opacity-60' : 'bg-gray-700 border-gray-600'}`}>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-lg text-white">{item.name}</span>
                                {item.stock <= 0 && <span className="text-red-500 text-xs font-bold border border-red-500 px-1 rounded">SOLD OUT</span>}
                            </div>
                            <div className="text-sm text-gray-400">
                                {formatCurrency(item.price)} | 制限: {item.limit}個
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                            <div className="text-center">
                                <div className="text-xs text-gray-400">現在在庫</div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => onUpdate(item.id, { stock: Math.max(0, item.stock - 1) })} className="w-6 h-6 bg-gray-600 rounded text-white">-</button>
                                    <span className={`w-12 text-center font-mono font-bold text-lg ${item.stock < 5 ? 'text-red-400' : 'text-green-400'}`}>
                                        {item.stock}
                                    </span>
                                    <button onClick={() => onUpdate(item.id, { stock: item.stock + 1 })} className="w-6 h-6 bg-gray-600 rounded text-white">+</button>
                                </div>
                            </div>
                            <button onClick={() => onDelete(item.id)} className="text-gray-500 hover:text-red-400 text-sm px-2">削除</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Module 2: Order List Component (Dashboard) ---

export const OrderListView = ({ orders, onCompletePayment, onCancelOrder, onForceCancelOrder }: any) => {
    
    if (orders.length === 0) {
        return <div className="text-center py-12 text-gray-500 bg-gray-900/50 rounded-lg">現在の注文はありません</div>;
    }

    return (
        <div className="space-y-4">
            {orders.map((order: any) => {
                const isPaying = order.status === 'paying';
                const isCompleted = order.status === 'completed';
                const isDelayed = order.isDelayed; // logic側で計算済み

                // カードのスタイル定義
                let cardStyle = "bg-gray-700 border-gray-600"; // Default
                let statusBadge = <span className="text-gray-400 text-xs px-2 py-0.5 border border-gray-500 rounded">準備中</span>;

                if (isPaying) {
                    cardStyle = "bg-yellow-900/20 border-yellow-500 ring-1 ring-yellow-500 animate-pulse-slow"; 
                    statusBadge = <span className="bg-yellow-500 text-black font-bold text-xs px-2 py-0.5 rounded animate-pulse">💰 会計待ち</span>;
                } else if (isDelayed) {
                    cardStyle = "bg-red-900/20 border-red-500";
                    statusBadge = <span className="bg-red-600 text-white font-bold text-xs px-2 py-0.5 rounded">⚠️ 受取遅延 (+{order.delayedMinutes}分)</span>;
                } else if (isCompleted) {
                    cardStyle = "bg-green-900/10 border-green-800 opacity-70";
                    statusBadge = <span className="text-green-500 text-xs px-2 py-0.5 border border-green-800 rounded">受渡完了</span>;
                }

                return (
                    <div key={order.id} className={`rounded-lg border p-4 transition-all ${cardStyle}`}>
                        {/* Header: Ticket & Status */}
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3">
                                <div className="text-3xl font-mono font-bold text-white tracking-widest">
                                    {order.ticketId}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-400 font-mono">ID: {order.userId.slice(0, 8)}</span>
                                    <span className="text-xs text-gray-300">
                                        {formatTime(order.createdAt)} 注文
                                    </span>
                                </div>
                            </div>
                            <div>{statusBadge}</div>
                        </div>

                        {/* Body: Items */}
                        <div className="bg-gray-800/50 rounded p-2 mb-3 text-sm">
                            {order.items.map((item: CartItem, idx: number) => (
                                <div key={idx} className="flex justify-between text-gray-300 border-b border-gray-700/50 last:border-0 py-1">
                                    <span>{item.name} <span className="text-xs text-gray-500">x{item.quantity}</span></span>
                                    <span className="font-mono">{formatCurrency(item.price * item.quantity)}</span>
                                </div>
                            ))}
                            <div className="flex justify-end mt-2 pt-2 border-t border-gray-600">
                                <span className="text-gray-400 text-xs mr-2">合計</span>
                                <span className="text-xl font-bold text-white font-mono">{formatCurrency(order.totalAmount)}</span>
                            </div>
                        </div>

                        {/* Footer: Actions */}
                        {!isCompleted && (
                            <div className="flex justify-end gap-2 mt-2">
                                {/* キャンセル系ボタン */}
                                {isDelayed ? (
                                    <button 
                                        onClick={() => onForceCancelOrder(order.id, order.items)}
                                        className="bg-red-900/80 hover:bg-red-800 text-red-100 border border-red-600 text-xs font-bold py-2 px-3 rounded"
                                    >
                                        💣 強制キャンセル (在庫戻し)
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => onCancelOrder(order.id, order.items)}
                                        className="bg-gray-600 hover:bg-gray-500 text-gray-200 text-xs py-2 px-3 rounded"
                                    >
                                        キャンセル
                                    </button>
                                )}

                                {/* 支払い完了ボタン */}
                                <button 
                                    onClick={() => onCompletePayment(order.id)}
                                    className={`font-bold py-2 px-6 rounded shadow-lg flex items-center gap-2 ${isPaying ? 'bg-green-600 hover:bg-green-500 text-white scale-105' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}
                                    disabled={!isPaying}
                                >
                                    {isPaying ? "✅ 支払い・受渡完了" : "提示待ち"}
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// --- Module 1: System Status Panel ---
export const SystemStatusPanel = ({ currentMode, onUpdateMode }: any) => {
    const modes = [
        { id: 'preparation', label: '開店準備', color: 'bg-blue-900' },
        { id: 'open', label: '営業中', color: 'bg-green-600' },
        { id: 'closed', label: '受付終了', color: 'bg-gray-600' },
    ];

    return (
        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 mb-6 flex items-center justify-between">
            <span className="text-gray-400 text-sm font-bold">システムモード:</span>
            <div className="flex gap-1">
                {modes.map(mode => (
                    <button
                        key={mode.id}
                        onClick={() => onUpdateMode(mode.id)}
                        className={`px-3 py-1 text-xs rounded border transition-all ${currentMode === mode.id ? `${mode.color} text-white border-white font-bold` : 'bg-gray-900 text-gray-500 border-gray-700'}`}
                    >
                        {mode.label}
                    </button>
                ))}
            </div>
        </div>
    );
};
