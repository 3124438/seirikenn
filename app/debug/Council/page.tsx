//app/debug/Council/page.tsx
"use client";
import React, { useState } from 'react';
import { useAdminLogic, convertGoogleDriveLink } from "./logic";
import { QueueListView, ReservationListView } from "./components";

// --- Sub Components for New Order System ---

// 1. Menu Management Component
const MenuManager = ({ menuItems, onAdd, onUpdateStock, onDelete }: any) => {
  const [newItem, setNewItem] = useState({ name: '', price: 0, stock: 0, limit: 5 });

  const handleAdd = () => {
    if (!newItem.name) return;
    onAdd(newItem);
    setNewItem({ name: '', price: 0, stock: 0, limit: 5 });
  };

  return (
    <div className="space-y-6">
      {/* Add Form */}
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h4 className="font-bold text-gray-300 mb-3">🍔 新規メニュー追加</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div className="col-span-2 md:col-span-2">
            <label className="text-xs text-gray-500 block mb-1">商品名</label>
            <input className="w-full bg-gray-700 p-2 rounded text-sm text-white" 
              value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="例: 焼きそば" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">価格</label>
            <input type="number" className="w-full bg-gray-700 p-2 rounded text-sm text-white" 
              value={newItem.price} onChange={e => setNewItem({...newItem, price: Number(e.target.value)})} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">初期在庫</label>
            <input type="number" className="w-full bg-gray-700 p-2 rounded text-sm text-white" 
              value={newItem.stock} onChange={e => setNewItem({...newItem, stock: Number(e.target.value)})} />
          </div>
          <button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded text-sm">追加</button>
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
                <td className="px-4 py-3 text-right">¥{item.price}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => onUpdateStock(item.id, Math.max(0, item.stock - 1))} className="w-6 h-6 bg-gray-700 rounded text-white hover:bg-red-900">-</button>
                    <span className={`font-mono text-lg w-12 text-center ${item.stock === 0 ? 'text-red-500 font-bold' : 'text-white'}`}>{item.stock}</span>
                    <button onClick={() => onUpdateStock(item.id, item.stock + 1)} className="w-6 h-6 bg-gray-700 rounded text-white hover:bg-green-900">+</button>
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

// 2. Order Dashboard Component
const OrderDashboard = ({ sortedOrders, onComplete, onCancel }: any) => {
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


export default function SuperAdminPage() {
  const {
    attractions, myUserId,
    expandedShopId, setExpandedShopId,
    isEditing, setIsEditing, originalId,
    manualId, setManualId, newName, setNewName, password, setPassword,
    department, setDepartment, imageUrl, setImageUrl, description, setDescription,
    groupLimit, setGroupLimit, openTime, setOpenTime, closeTime, setCloseTime,
    duration, setDuration, capacity, setCapacity, isPaused, setIsPaused,
    isQueueMode, setIsQueueMode,
    searchUserId, setSearchUserId,
    stats,
    handleBulkPause, handleBulkDeleteReservations, handleBulkDeleteVenues,
    resetForm, startEdit, handleSave, handleDeleteVenue,
    toggleReservationStatus, cancelReservation, updateQueueStatus,
    targetShop,
    // New Order System Hooks
    menuItems, orders, sortedOrders,
    addMenuItem, updateMenuStock, deleteMenuItem,
    completePayment, cancelOrder
  } = useAdminLogic();

  // Tab State for Detail View
  const [detailTab, setDetailTab] = useState<'order' | 'menu' | 'entry' | 'settings'>('order');

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex justify-between items-center sticky top-0 z-50 shadow-md">
          <div className="text-xs text-gray-400">Logged in as:</div>
          <div className="font-mono font-bold text-yellow-400 text-lg tracking-wider">{myUserId || "---"}</div>
      </div>

      <div className="max-w-4xl mx-auto p-4 pb-32">
        <div className="mb-6 border-b border-gray-700 pb-4">
          <h1 className="text-2xl font-bold text-red-500 mb-4">生徒会・実行委員用 (Full Access)</h1>
            
          <details className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4" open={isEditing}>
              <summary className="cursor-pointer font-bold text-blue-400">➕ 新規会場の作成 / 設定フォーム</summary>
              <div className="mt-4 pt-4 border-t border-gray-700">
                  <h3 className="text-sm font-bold mb-2 text-gray-300">{isEditing ? `✏️ ${originalId} を編集中` : "新規作成"}</h3>
                  
                  <div className="grid gap-2 md:grid-cols-3 mb-2">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">会場ID (3文字)</label>
                        <input className={`w-full p-2 rounded text-white bg-gray-700 ${isEditing && manualId !== originalId ? 'ring-2 ring-yellow-500' : ''}`}
                             placeholder="例: 3B" maxLength={3} value={manualId} onChange={e => setManualId(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">会場名</label>
                        <input className="w-full bg-gray-700 p-2 rounded text-white" placeholder="会場名" value={newName} onChange={e => setNewName(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Pass (5桁)</label>
                        <input className="w-full bg-gray-700 p-2 rounded text-white" placeholder="数字5桁" maxLength={5} value={password} onChange={e => setPassword(e.target.value)} />
                      </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2 mb-2">
                      <div>
                          <label className="text-xs text-gray-400 block mb-1">団体名/クラス</label>
                          <input className="w-full bg-gray-700 p-2 rounded text-white" placeholder="例: 3年B組" value={department} onChange={e => setDepartment(e.target.value)} />
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 block mb-1">画像URL</label>
                          <input className="w-full bg-gray-700 p-2 rounded text-white" placeholder="URL" value={imageUrl} onChange={e => setImageUrl(convertGoogleDriveLink(e.target.value))} />
                      </div>
                  </div>

                  <div className="mb-2">
                      <label className="text-xs text-gray-500 mb-1 block">会場説明文 (任意: 最大500文字)</label>
                      <textarea 
                          className="w-full bg-gray-700 p-2 rounded text-white h-24 text-sm border border-gray-600 focus:border-blue-500 outline-none"
                          placeholder="会場のアピールポイントや注意事項を入力してください。"
                          maxLength={500}
                          value={description}
                          onChange={e => setDescription(e.target.value)}
                      />
                      <div className="text-right text-xs text-gray-500">{description.length}/500</div>
                  </div>

                  {isEditing && manualId !== originalId && <div className="text-xs text-yellow-400 font-bold mb-2">⚠️ IDが変更されています。</div>}

                  {/* ★ 運用モード選択スイッチ */}
                  <div className="bg-gray-900 p-3 rounded border border-gray-600 mb-3">
                      <label className="text-xs text-gray-400 mb-2 block font-bold">運用モード:</label>
                      <div className="flex gap-4">
                          <label className={`flex items-center gap-2 cursor-pointer p-2 rounded w-1/2 justify-center border ${!isQueueMode ? 'bg-blue-900 border-blue-500' : 'bg-gray-800 border-gray-700 opacity-50'}`}>
                              <input type="radio" name="mode" checked={!isQueueMode} onChange={() => setIsQueueMode(false)} className="hidden" />
                              📅 時間予約制
                          </label>
                          <label className={`flex items-center gap-2 cursor-pointer p-2 rounded w-1/2 justify-center border ${isQueueMode ? 'bg-purple-900 border-purple-500' : 'bg-gray-800 border-gray-700 opacity-50'}`}>
                              <input type="radio" name="mode" checked={isQueueMode} onChange={() => setIsQueueMode(true)} className="hidden" />
                              🚶‍♂️ 順番待ち制 (列)
                          </label>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3 bg-gray-900 p-3 rounded border border-gray-600">
                      <div>
                          <label className="text-xs text-gray-400 block mb-1 font-bold">開始時刻</label>
                          <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} className="w-full bg-gray-700 p-2 rounded text-sm"/>
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 block mb-1 font-bold">終了時刻</label>
                          <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} className="w-full bg-gray-700 p-2 rounded text-sm"/>
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 block mb-1 font-bold">1枠の時間(分)</label>
                          <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full bg-gray-700 p-2 rounded text-sm" placeholder="分"/>
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 block mb-1 font-bold">枠ごとの定員(組)</label>
                          <input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} className="w-full bg-gray-700 p-2 rounded text-sm" placeholder="定員"/>
                      </div>
                  </div>

                  <div className="flex items-center gap-3 mb-3 bg-gray-900 p-3 rounded border border-gray-600">
                      <div>
                          <label className="text-xs text-gray-400 block mb-1 font-bold">1組の最大人数</label>
                          <input type="number" value={groupLimit} onChange={e => setGroupLimit(Number(e.target.value))} className="w-20 bg-gray-700 p-2 rounded text-sm" />
                      </div>
                      <div className="flex-1 flex items-center justify-end">
                        <label className="cursor-pointer text-sm text-red-300 font-bold flex items-center gap-2 bg-red-900/30 px-4 py-2 rounded border border-red-800">
                            <input type="checkbox" checked={isPaused} onChange={e => setIsPaused(e.target.checked)} className="w-4 h-4" /> 
                            🚫 受付を停止する
                        </label>
                      </div>
                  </div>

                  <div className="flex gap-2">
                      <button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-500 py-3 rounded font-bold shadow-lg transition">{isEditing ? "変更を保存" : "会場を作成"}</button>
                      {isEditing && <button onClick={resetForm} className="bg-gray-600 px-6 rounded hover:bg-gray-500 transition">キャンセル</button>}
                  </div>
              </div>
          </details>

          <div className="flex gap-2 items-center bg-gray-800 p-2 rounded border border-gray-600 mb-6">
              <span className="text-xl">🔍</span>
              <input className="flex-1 bg-transparent text-white outline-none" placeholder="ユーザーID検索..." value={searchUserId} onChange={e => setSearchUserId(e.target.value)} />
          </div>

          <div className="bg-black border border-gray-600 rounded-xl p-4 mb-6 shadow-xl">
              <h2 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Dashboard & Global Actions</h2>
              <div className="flex justify-between items-center mb-6 bg-gray-900 p-4 rounded-lg border border-gray-800">
                  <div className="text-center"><div className="text-xs text-gray-500 mb-1">TOTAL VENUES</div><div className="text-3xl font-mono font-bold text-white tracking-widest">{stats.totalVenues}</div></div>
                  <div className="text-center border-l border-r border-gray-700 px-6"><div className="text-xs text-gray-500 mb-1">PAUSED SHOPS</div><div className="text-3xl font-mono font-bold text-red-500 tracking-widest">{stats.pausedVenues}</div></div>
                  <div className="text-center"><div className="text-xs text-gray-500 mb-1">ACTIVE GUESTS</div><div className="text-3xl font-mono font-bold text-green-500 tracking-widest">{stats.totalReservations}</div></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <button onClick={() => handleBulkPause(true)} className="bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-800 py-2 rounded text-xs font-bold transition">🛑 一斉停止</button>
                  <button onClick={() => handleBulkPause(false)} className="bg-green-900/50 hover:bg-green-800 text-green-200 border border-green-800 py-2 rounded text-xs font-bold transition">▶️ 一斉再開</button>
                  <button onClick={handleBulkDeleteReservations} className="bg-orange-900/50 hover:bg-orange-800 text-orange-200 border border-orange-800 py-2 rounded text-xs font-bold transition">🗑️ データ全削除</button>
                  <button onClick={handleBulkDeleteVenues} className="bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 py-2 rounded text-xs font-bold transition">💀 会場全削除</button>
              </div>
          </div>
        </div>

        {!expandedShopId && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {attractions.map(shop => {
                    let hasUser = false;
                    let totalCount = 0;
                    if (shop.isQueueMode) {
                        hasUser = searchUserId && shop.queue?.some((t:any) => t.userId?.includes(searchUserId.toUpperCase()));
                        totalCount = shop.queue?.filter((t:any) => ['waiting', 'ready'].includes(t.status)).length || 0;
                    } else {
                        hasUser = searchUserId && shop.reservations?.some((r:any) => r.userId?.includes(searchUserId.toUpperCase()));
                        totalCount = shop.reservations?.length || 0;
                    }

                    return (
                        <button key={shop.id} onClick={() => setExpandedShopId(shop.id)} className={`p-4 rounded-xl border text-left flex justify-between items-center hover:bg-gray-800 transition ${hasUser ? 'bg-pink-900/40 border-pink-500' : 'bg-gray-800 border-gray-600'}`}>
