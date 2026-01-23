//app/debug/Council/page.tsx
"use client";
import React, { useState } from 'react';
import { useAdminLogic, convertGoogleDriveLink } from "./logic";
import { QueueListView, ReservationListView, MenuManager, OrderDashboard } from "./components";

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
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex justify-between items-center sticky top-0 z-50 shadow-md">
          <div className="text-xs text-gray-400">Logged in as:</div>
          <div className="font-mono font-bold text-yellow-400 text-lg tracking-wider">{myUserId || "---"}</div>
      </div>

      <div className="max-w-4xl mx-auto p-4 pb-32">
        <div className="mb-6 border-b border-gray-700 pb-4">
          <h1 className="text-2xl font-bold text-red-500 mb-4">生徒会・実行委員用 (Full Access)</h1>
          
          {/* Create / Edit Form */}
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
                  </div>

                  {/* Mode Switch */}
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

                  {/* Time Settings */}
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

          {/* Search Bar */}
          <div className="flex gap-2 items-center bg-gray-800 p-2 rounded border border-gray-600 mb-6">
              <span className="text-xl">🔍</span>
              <input className="flex-1 bg-transparent text-white outline-none" placeholder="ユーザーID検索..." value={searchUserId} onChange={e => setSearchUserId(e.target.value)} />
          </div>

          {/* Dashboard Stats */}
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

        {/* --- List View or Detail View Switch --- */}
        {!expandedShopId ? (
          /* List View */
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
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-2xl font-bold text-white">{shop.id}</span>
                            <span className="text-sm text-gray-400 bg-gray-900 px-2 py-0.5 rounded border border-gray-700">{shop.name}</span>
                          </div>
                          <div className="text-xs text-gray-500">{shop.department}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-mono font-bold text-white">{totalCount} <span className="text-xs text-gray-500 font-sans font-normal">組待機</span></div>
                          <div className="text-[10px] text-gray-400">{shop.isQueueMode ? '列並び' : '時間予約'}</div>
                        </div>
                      </button>
                  );
              })}
              {attractions.length === 0 && <div className="col-span-2 text-center text-gray-500 py-10">会場がありません</div>}
          </div>
        ) : (
          /* Detail View */
          <div className="bg-gray-900 rounded-xl min-h-[500px]">
            {/* Detail Header */}
            <div className="flex items-center gap-4 mb-6">
              <button onClick={() => setExpandedShopId(null)} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded border border-gray-600">
                ← 戻る
              </button>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <span className="font-mono text-yellow-400">{targetShop?.id}</span>
                  {targetShop?.name}
                </h2>
                <div className="text-xs text-gray-400 flex gap-2">
                  <span>{targetShop?.department}</span>
                  {targetShop?.isPaused && <span className="text-red-400 font-bold">🚫 受付停止中</span>}
                </div>
              </div>
              <button onClick={() => startEdit(targetShop)} className="text-blue-400 underline text-sm">設定変更</button>
              <button onClick={() => handleDeleteVenue(targetShop.id)} className="text-red-500 underline text-sm ml-2">削除</button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-700 mb-6 overflow-x-auto pb-2">
               <button onClick={() => setDetailTab('order')} className={`px-4 py-2 rounded-t-lg font-bold text-sm whitespace-nowrap ${detailTab === 'order' ? 'bg-yellow-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                 👨‍🍳 注文・会計
               </button>
               <button onClick={() => setDetailTab('menu')} className={`px-4 py-2 rounded-t-lg font-bold text-sm whitespace-nowrap ${detailTab === 'menu' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                 🍔 メニュー管理
               </button>
               <button onClick={() => setDetailTab('entry')} className={`px-4 py-2 rounded-t-lg font-bold text-sm whitespace-nowrap ${detailTab === 'entry' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                 🚪 入場・待機列
               </button>
            </div>

            {/* Content */}
            <div>
              {detailTab === 'order' && (
                <OrderDashboard 
                  sortedOrders={sortedOrders} 
                  onComplete={completePayment} 
                  onCancel={cancelOrder} 
                />
              )}
              {detailTab === 'menu' && (
                <MenuManager 
                  menuItems={menuItems} 
                  onAdd={addMenuItem} 
                  onUpdateStock={updateMenuStock} 
                  onDelete={deleteMenuItem} 
                />
              )}
              {detailTab === 'entry' && (
                targetShop?.isQueueMode ? (
                  <QueueListView 
                    shop={targetShop} 
                    searchUserId={searchUserId} 
                    onUpdateStatus={updateQueueStatus} 
                  />
                ) : (
                  <ReservationListView 
                    shop={targetShop} 
                    searchUserId={searchUserId} 
                    onToggleStatus={toggleReservationStatus} 
                    onCancel={cancelReservation} 
                  />
                )
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
