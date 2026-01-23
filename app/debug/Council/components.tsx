import React, { useState } from 'react';

// --- Queue List Component (Existing) ---
export const QueueListView = ({ shop, searchUserId, onUpdateStatus }: any) => {
    if (!shop.queue) return <div>データなし</div>;
    const active = shop.queue.filter((t: any) => ['waiting', 'ready'].includes(t.status));
    
    // Sort
    active.sort((a: any, b: any) => {
        if (a.status === 'ready' && b.status !== 'ready') return -1;
        if (a.status !== 'ready' && b.status === 'ready') return 1;
        return (a.ticketId || "0").localeCompare(b.ticketId || "0");
    });

    if (active.length === 0) return <div className="text-center py-8 text-gray-500 bg-gray-900/50 rounded-lg">待機ユーザーなし</div>;

    return (
        <div className="space-y-2">
            {active.map((ticket: any, index: number) => {
                const isReady = ticket.status === 'ready';
                const isMatch = searchUserId && ticket.userId?.includes(searchUserId.toUpperCase());
                return (
                    <div key={index} className={`flex justify-between items-center p-3 rounded border ${isReady ? 'bg-red-900/30 border-red-500' : 'bg-gray-700 border-gray-600'} ${isMatch ? 'ring-2 ring-pink-500' : ''}`}>
                        <div>
                            <div className="font-mono text-xl font-bold text-white">{ticket.ticketId || `#${index+1}`}</div>
                            <div className="text-sm text-gray-400">{ticket.userId} ({ticket.count}名)</div>
                        </div>
                        <div className="flex gap-2">
                            {isReady ? (
                                <button onClick={() => onUpdateStatus(shop, ticket, 'completed')} className="bg-green-600 text-white px-4 py-2 rounded font-bold">入場</button>
                            ) : (
                                <button onClick={() => onUpdateStatus(shop, ticket, 'ready')} className="bg-red-600 text-white px-4 py-2 rounded font-bold">呼出</button>
                            )}
                            <button onClick={() => onUpdateStatus(shop, ticket, 'canceled')} className="bg-gray-600 text-white px-2 py-2 rounded text-xs">取消</button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// --- Reservation List Component (Existing) ---
export const ReservationListView = ({ shop, searchUserId, onToggleStatus, onCancel }: any) => {
    const grouped: any = {};
    shop.reservations?.forEach((res: any) => {
        if(!grouped[res.time]) grouped[res.time] = [];
        grouped[res.time].push(res);
    });

    return (
        <div className="space-y-4">
            {Object.keys(grouped).sort().map(time => (
                <div key={time} className="bg-gray-900/50 p-3 rounded border border-gray-700">
                    <h4 className="font-bold text-blue-300 mb-2">{time}</h4>
                    <div className="space-y-2">
                        {grouped[time].map((res: any, idx: number) => {
                             const isMatch = searchUserId && res.userId?.includes(searchUserId.toUpperCase());
                             return (
                                <div key={idx} className={`flex justify-between items-center bg-gray-700 p-2 rounded ${isMatch ? 'ring-2 ring-pink-500' : ''}`}>
                                    <div className={res.status === 'used' ? 'opacity-50 line-through' : ''}>
                                        <div className="font-bold text-white">{res.userId}</div>
                                        <div className="text-xs text-gray-400">{res.people}名</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => onToggleStatus(shop, res, res.status === 'used' ? 'reserved' : 'used')} 
                                            className={`px-2 py-1 rounded text-xs ${res.status === 'used' ? 'bg-gray-600' : 'bg-green-600'}`}>
                                            {res.status === 'used' ? '戻す' : '入場'}
                                        </button>
                                        <button onClick={() => onCancel(shop, res)} className="bg-red-900/50 text-red-200 px-2 py-1 rounded text-xs">削除</button>
                                    </div>
                                </div>
                             );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

// --- Menu Management Component ---
export const MenuManager = ({ menuItems, onAdd, onUpdateStock, onDelete }: any) => {
  // 修正: 入力しやすいように、一時的に空文字('')を許容します
  const [newItem, setNewItem] = useState({ name: '', price: '', stock: '' });

  const handleAdd = () => {
    if (!newItem.name) return;
    onAdd({
        name: newItem.name,
        price: Number(newItem.price || 0), // 送信時に数値へ変換
        stock: Number(newItem.stock || 0), // 送信時に数値へ変換
        limit: 5
    });
    setNewItem({ name: '', price: '', stock: '' }); // フォームをリセット
  };

  return (
    <div className="space-y-6">
      {/* Add Form */}
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h4 className="font-bold text-gray-300 mb-3">🍔 新規メニュー追加</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div className="col-span-2 md:col-span-2">
            <label className="text-xs text-gray-500 block mb-1">商品名</label>
            <input className="w-full bg-gray-700 p-2 rounded text-sm text-white border border-gray-600 focus:border-blue-500 outline-none" 
              value={newItem.name} 
              onChange={e => setNewItem({...newItem, name: e.target.value})} 
              placeholder="例: 焼きそば" 
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">価格 (円)</label>
            <input 
              type="number" 
              min="0"
              className="w-full bg-gray-700 p-2 rounded text-sm text-white border border-gray-600 focus:border-blue-500 outline-none" 
              value={newItem.price} 
              onChange={e => setNewItem({...newItem, price: e.target.value})} // ここでは文字列のまま保存
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">初期在庫 (個)</label>
            <input 
              type="number" 
              min="0"
              className="w-full bg-gray-700 p-2 rounded text-sm text-white border border-gray-600 focus:border-blue-500 outline-none" 
              value={newItem.stock} 
              onChange={e => setNewItem({...newItem, stock: e.target.value})} // ここでは文字列のまま保存
              placeholder="0"
            />
          </div>
          <button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded text-sm transition">追加</button>
        </div>
      </div>

      {/* Menu List */}
      <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
        <table className="w-full text-sm text-left text-gray-400">
          <thead className="text-xs text-gray-500 uppercase bg-gray-800">
            <tr>
              <th className="px-4 py-3">Menu Name</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-center">Stock</th>
              <th className="px-4 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {menuItems.map((item: any) => (
              <tr key={item.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                <td className="px-4 py-3 font-bold text-white">{item.name}</td>
                <td className="px-4 py-3 text-right">¥{Number(item.price).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => onUpdateStock(item.id, Math.max(0, Number(item.stock) - 1))} className="w-6 h-6 flex items-center justify-center bg-gray-700 rounded text-white hover:bg-red-900 transition">-</button>
                    <span className={`font-mono text-lg w-12 text-center ${item.stock === 0 ? 'text-red-500 font-bold' : 'text-white'}`}>{item.stock}</span>
                    <button onClick={() => onUpdateStock(item.id, Number(item.stock) + 1)} className="w-6 h-6 flex items-center justify-center bg-gray-700 rounded text-white hover:bg-green-900 transition">+</button>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => onDelete(item.id)} className="text-red-500 hover:text-red-300 text-xs underline">削除</button>
                </td>
              </tr>
            ))}
            {menuItems.length === 0 && (
              <tr><td colSpan={4} className="p-4 text-center text-gray-600">メニューが登録されていません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Order Dashboard Component ---
export const OrderDashboard = ({ sortedOrders, onComplete, onCancel }: any) => {
  const { active } = sortedOrders;

  if (active.length === 0) {
    return <div className="p-8 text-center text-gray-500 border border-dashed border-gray-700 rounded-xl">現在、アクティブな注文はありません。</div>;
  }

  return (
    <div className="space-y-4 pb-20">
      {active.map((order: any) => {
        const isPaying = order.status === 'paying';
        const isDelayed = order.isDelayed;
        
        return (
          <div key={order.id} 
            className={`relative rounded-xl overflow-hidden transition-all duration-300 
              ${isPaying ? 'transform scale-100 md:scale-105 border-4 border-yellow-400 bg-gray-800 shadow-[0_0_30px_rgba(250,204,21,0.3)] z-10 my-6' 
                         : isDelayed ? 'border-2 border-red-500 bg-red-900/10' : 'border border-gray-700 bg-gray-800'}`}
          >
            {/* Status Header */}
            <div className={`px-4 py-2 flex justify-between items-center ${isPaying ? 'bg-yellow-500/20' : 'bg-gray-900'}`}>
              <div className="flex items-center gap-3">
                <span className={`font-mono font-bold text-2xl ${isPaying ? 'text-yellow-400' : 'text-white'}`}>
                  #{order.ticketId}
                </span>
                {isPaying && <span className="bg-yellow-400 text-black text-xs font-bold px-2 py-1 rounded animate-pulse">会計待ち (PAYING)</span>}
                {!isPaying && isDelayed && <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded">遅延 ({order.delayedMinutes}分)</span>}
                {!isPaying && !isDelayed && <span className="text-gray-400 text-xs font-bold bg-gray-700 px-2 py-1 rounded">調理中</span>}
              </div>
              <div className="text-xs text-gray-400 font-mono">
                {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}
              </div>
            </div>

            {/* Content */}
            <div className="p-4">
              <div className="space-y-2 mb-4">
                {order.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm border-b border-gray-700/50 pb-1 last:border-0">
                    <span className="text-gray-200">{item.name} <span className="text-gray-500">x{item.quantity}</span></span>
                    <span className="font-mono text-gray-400">¥{item.price * item.quantity}</span>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-between items-end border-t border-gray-700 pt-3">
                <div className="text-right flex-1">
                  <span className="text-xs text-gray-500 mr-2">合計</span>
                  <span className="text-2xl font-bold text-white">¥{order.totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-2 bg-gray-900/50 flex gap-2">
              {isPaying ? (
                <button onClick={() => onComplete(order.id)} 
                  className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 rounded text-lg shadow-lg transition">
                  💰 支払い完了・商品受渡
                </button>
              ) : (
                <button onClick={() => onComplete(order.id)} 
                  className="flex-1 bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded transition">
                  ✅ 受渡完了 (Skip Payment)
                </button>
              )}
              
              <button onClick={() => onCancel(order)} 
                className="px-4 bg-gray-700 hover:bg-red-900 text-gray-300 hover:text-white rounded font-bold text-sm transition">
                取下
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

