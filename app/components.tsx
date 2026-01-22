// app/components.tsx
"use client";
import React, { useEffect, useState } from "react";
import { QrReader } from 'react-qr-reader';
import { Ticket, Shop, DraftBooking, MenuItem, CartItem, Order } from "./types";

// ========================================================================
// Constants (仕様書 Section 2)
// ========================================================================
const LIMIT_TIME_MINUTES = 30;

// ========================================================================
// Existing Components (既存システム - 変更なし)
// ========================================================================

// --- サブコンポーネント: 通知設定パネル ---
export const NotificationPanel = ({
  enableSound, setEnableSound,
  enableVibrate, setEnableVibrate,
  onTestSound
}: {
  enableSound: boolean; setEnableSound: (v: boolean) => void;
  enableVibrate: boolean; setEnableVibrate: (v: boolean) => void;
  onTestSound: () => void;
}) => (
  <div className="bg-white p-2 rounded-lg border shadow-sm flex items-center justify-between">
    <span className="text-xs font-bold text-gray-500 pl-2">呼び出し通知</span>
    <div className="flex gap-2">
      <button 
        onClick={() => setEnableSound(!enableSound)}
        className={`px-2 py-1.5 rounded text-xs font-bold border transition-colors flex items-center gap-1 ${enableSound ? "bg-blue-500 text-white border-blue-600" : "bg-gray-100 text-gray-400 border-gray-200"}`}
      >
        {enableSound ? "🔊 音ON" : "🔇 音OFF"}
      </button>
      <button 
        onClick={() => setEnableVibrate(!enableVibrate)}
        className={`px-2 py-1.5 rounded text-xs font-bold border transition-colors flex items-center gap-1 ${enableVibrate ? "bg-blue-500 text-white border-blue-600" : "bg-gray-100 text-gray-400 border-gray-200"}`}
      >
        {enableVibrate ? "📳 振動ON" : "📴 振動OFF"}
      </button>
      <button 
        onClick={onTestSound} 
        className="px-2 py-1.5 rounded text-xs border bg-gray-200 text-gray-600 active:bg-gray-300"
      >
        🔔 テスト
      </button>
    </div>
  </div>
);

// --- サブコンポーネント: チケットカード (既存の整理券システム用) ---
export const TicketCard = ({ t, onManualEnter, onCancel, onOpenQr }: { t: Ticket, onManualEnter: (t: Ticket) => void, onCancel: (t: Ticket) => void, onOpenQr: (t: Ticket) => void }) => {
  const isReady = t.status === 'ready';
  const cardClass = isReady 
    ? "bg-red-50 border-l-4 border-red-500 shadow-xl ring-2 ring-red-400 animate-pulse-slow" 
    : "bg-white border-l-4 border-green-500 shadow-lg";

  return (
    <div className={`${cardClass} p-4 rounded relative`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          {t.shopDepartment && (
            <p className="text-xs font-bold text-gray-500 mb-0.5">{t.shopDepartment}</p>
          )}
          <h2 className="font-bold text-lg flex items-center gap-2 leading-tight">
            {t.shopName}
            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full border border-green-200 whitespace-nowrap">
               {t.count}名
            </span>
          </h2>
           
          {t.isQueue ? (
            <div className="mt-2 p-2 bg-gray-100 rounded border border-gray-200 inline-block">
              <p className="text-xs text-gray-500 font-bold mb-1">整理券番号</p>
              <p className="text-3xl font-mono font-black text-gray-800 tracking-widest leading-none">
                  {t.ticketId}
              </p>
            </div>
          ) : (
            <p className="text-3xl font-bold text-blue-600 font-mono mt-1">{t.time}</p>
          )}
           
          {t.isQueue && (
              <div className="mt-2">
                  {isReady ? (
                    <p className="text-red-600 font-bold text-lg animate-bounce">🔔 呼び出し中です！</p>
                  ) : (
                    <p className="text-blue-600 font-bold text-sm">
                      あなたの前に <span className="text-xl text-blue-800">{t.peopleAhead}</span> 組待ち
                    </p>
                  )}
              </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          {/* 手動入力ボタン */}
          <button 
              onClick={() => onManualEnter(t)} 
              disabled={t.isQueue && !isReady} 
              className={`flex-1 font-bold py-3 rounded-lg shadow transition text-sm
              ${(t.isQueue && !isReady) 
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed" 
                  : "bg-blue-600 text-white hover:bg-blue-500"
              }`}
          >
              {t.isQueue && !isReady ? "待機中..." : "パスワード入力で入場"}
          </button>
          {/* キャンセルボタン */}
          <button onClick={() => onCancel(t)} className="px-4 text-red-500 border border-red-200 rounded-lg text-xs hover:bg-red-50">
              削除
          </button>
        </div>

        {/* ★QRコードで入場ボタン */}
        <button 
          onClick={() => onOpenQr(t)}
          disabled={t.isQueue && !isReady}
          className={`w-full font-bold py-3 rounded-lg border-2 flex items-center justify-center gap-2 transition
              ${(t.isQueue && !isReady)
                  ? "border-gray-300 text-gray-400 cursor-not-allowed bg-gray-50"
                  : "border-black text-black bg-white hover:bg-gray-100"
              }`}
        >
            <span>📷</span> QRコードで入場
        </button>
      </div>
    </div>
  );
};

// --- サブコンポーネント: 店舗リスト ---
export const ShopList = ({ shops, onSelect }: { shops: Shop[], onSelect: (s: Shop) => void }) => (
  <div className="space-y-3">
    <p className="text-sm font-bold text-gray-600 mb-2 border-b pb-2">アトラクションを選ぶ</p>
    {shops.map((shop) => (
      <button key={shop.id} onClick={() => onSelect(shop)} className={`w-full bg-white p-3 rounded-xl shadow-sm border text-left flex items-start gap-3 hover:bg-gray-50 transition ${shop.isPaused ? 'opacity-60 grayscale' : ''}`}>
        {shop.imageUrl && (
            <div className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                <img src={shop.imageUrl} alt="" className="w-full h-full object-cover" />
            </div>
        )}
        <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1 mb-1">
                {shop.isQueueMode && <span className="bg-orange-100 text-orange-700 border-orange-200 border text-[10px] px-2 py-0.5 rounded font-bold">順番待ち制</span>}
                {shop.isPaused && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded">受付停止中</span>}
            </div>
            {shop.department && (
              <p className="text-xs text-blue-600 font-bold mb-0.5">{shop.department}</p>
            )}
            <h3 className="font-bold text-lg leading-tight truncate text-gray-800 mb-1">{shop.name}</h3>
            <div className="text-xs text-gray-400">
                {shop.isQueueMode 
                  ? `待ち: ${shop.queue?.filter((q:any)=>q.status==='waiting').length || 0}組` 
                  : `予約可`}
            </div>
        </div>
        <div className="self-center text-gray-300">&gt;</div>
      </button>
    ))}
  </div>
);

// --- サブコンポーネント: 店舗詳細・予約画面 ---
export const ShopDetail = ({ 
  shop, activeTickets, onBack, onSelectTime, onJoinQueue 
}: { 
  shop: Shop, activeTickets: Ticket[], onBack: () => void, onSelectTime: (s: Shop, t: string) => void, onJoinQueue: (s: Shop) => void 
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden pb-10">
        <div className="relative">
           {shop.imageUrl && (
             <div className="w-full h-56 bg-gray-200">
               <img src={shop.imageUrl} alt={shop.name} className="w-full h-full object-cover" />
             </div>
           )}

           <button 
             onClick={onBack} 
             className="absolute top-3 left-3 bg-black/50 text-white px-4 py-2 rounded-full text-sm backdrop-blur-md z-10 hover:bg-black/70 transition"
           >
             ← 戻る
           </button>

           <div className={`p-5 border-b bg-gray-50 ${!shop.imageUrl ? "pt-14" : ""}`}>
               {shop.department && (
                 <p className="text-sm font-bold text-blue-600 mb-1">{shop.department}</p>
               )}
               <h2 className="text-2xl font-bold leading-tight text-gray-900">{shop.name}</h2>
           </div>
        </div>

        <div className="p-4">
            {shop.description && (
                <div className="mb-6 text-sm text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
                    {shop.description}
                </div>
            )}

            {shop.isPaused ? (
                <p className="text-red-500 font-bold mb-4 bg-red-100 p-3 rounded text-center">現在 受付停止中です</p>
            ) : (
                <>
                    {shop.isQueueMode ? (
                       <div className="text-center py-6">
                          <div className="mb-6">
                            <p className="text-gray-500 text-sm font-bold mb-2">現在の待ち状況</p>
                            <div className="flex justify-center gap-4">
                               <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 min-w-[100px]">
                                  <p className="text-xs text-orange-600">待ち組数</p>
                                  <p className="text-3xl font-bold text-orange-900">
                                    {shop.queue?.filter((q:any)=>q.status==='waiting').length || 0}
                                    <span className="text-sm font-normal ml-1">組</span>
                                  </p>
                               </div>
                            </div>
                          </div>
                          <button 
                            onClick={() => onJoinQueue(shop)}
                            className="w-full bg-orange-500 text-white text-xl font-bold py-4 rounded-xl shadow-lg hover:bg-orange-600 transition flex items-center justify-center gap-2"
                          >
                            <span>🏃</span> 整理券を発券する
                          </button>
                       </div>
                    ) : (
                       <div className="grid grid-cols-3 gap-3">
                          {Object.entries(shop.slots || {}).sort().map(([time, count]: any) => {
                             const limitGroups = shop.capacity || 0; 
                             const isFull = count >= limitGroups;
                             const remaining = limitGroups - count;
                             const isBooked = activeTickets.some(t => t.shopId === shop.id && t.time === time);
                             
                             return (
                                  <button 
                                    key={time} 
                                    disabled={isFull || isBooked} 
                                    onClick={() => onSelectTime(shop, time)}
                                    className={`p-2 rounded border h-24 flex flex-col items-center justify-center ${isBooked ? "bg-green-50 border-green-500" : "bg-white border-blue-200"}`}
                                  >
                                     <span className="font-bold">{time}</span>
                                     <span className="text-xs">{isBooked ? "予約済" : isFull ? "満席" : `あと${remaining}組`}</span>
                                  </button>
                             );
                          })}
                       </div>
                    )}
                </>
            )}
        </div>
    </div>
  );
};

// --- サブコンポーネント: 予約確認モーダル ---
export const BookingModal = ({ 
  draftBooking, shopName, shopDepartment, peopleCount, setPeopleCount, onCancel, onConfirm 
}: { 
  draftBooking: DraftBooking, shopName: string, shopDepartment?: string, peopleCount: number, setPeopleCount: (n: number) => void, onCancel: () => void, onConfirm: () => void 
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
    <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl overflow-hidden">
      <div className={`${draftBooking.mode === "queue" ? "bg-orange-500" : "bg-blue-600"} text-white p-4 text-center`}>
        <h3 className="text-lg font-bold">{draftBooking.mode === "queue" ? "整理券の発券" : "予約の確認"}</h3>
      </div>
      
      <div className="p-6">
        <p className="text-center text-sm font-bold text-gray-500 mb-1">{shopDepartment}</p>
        <p className="text-center font-bold text-xl mb-4">{shopName}</p>
        
        <label className="block text-sm font-bold text-gray-700 mb-2">
            人数を選択してください
        </label>
        <select 
            value={peopleCount} 
            onChange={(e) => setPeopleCount(Number(e.target.value))}
            className="w-full text-lg p-3 border-2 border-gray-200 rounded-lg mb-6"
        >
            {[...Array(draftBooking.maxPeople)].map((_, i) => (
                <option key={i+1} value={i+1}>{i+1}名</option>
            ))}
        </select>

        <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-3 bg-gray-100 rounded-lg font-bold text-gray-500">やめる</button>
            <button onClick={onConfirm} className={`flex-1 py-3 text-white font-bold rounded-lg shadow ${draftBooking.mode === "queue" ? "bg-orange-500" : "bg-blue-600"}`}>
                {draftBooking.mode === "queue" ? "発券する" : "予約する"}
            </button>
        </div>
      </div>
    </div>
  </div>
);

// --- サブコンポーネント: QRリーダーモーダル ---
export const QrModal = ({ onScan, onClose }: { onScan: (result: any) => void, onClose: () => void }) => (
  <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
          <h3 className="text-white font-bold text-center mb-4 text-lg">
              QRコードを読み取ってください
          </h3>
          
          <div className="relative rounded-xl overflow-hidden border-2 border-gray-700 bg-black">
                <QrReader
                  onResult={onScan}
                  constraints={{ facingMode: 'environment' }}
                  className="w-full"
                  scanDelay={500}
                />
                {/* 枠の演出 */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-64 h-64 border-4 border-green-500/50 rounded-lg"></div>
                </div>
          </div>

          <p className="text-gray-400 text-xs text-center mt-4">
              会場のQRコードを枠内に写してください
          </p>
          
          <button 
              onClick={onClose}
              className="w-full mt-6 py-4 bg-gray-800 text-white font-bold rounded-lg border border-gray-600"
          >
              キャンセル
          </button>
      </div>
  </div>
);

// ========================================================================
// New Components (Order System / Module 3 & 4 Implementation)
// ========================================================================

// --- Module 3: Menu List Component ---
export const MenuListView = ({ 
  menuItems, cart, onUpdateCart, onSubmit 
}: { 
  menuItems: MenuItem[];
  cart: CartItem[];
  onUpdateCart: (item: MenuItem, delta: number) => void;
  onSubmit: () => void;
}) => {
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <div className="pb-24">
      <h2 className="text-xl font-bold p-4 bg-white border-b sticky top-0 z-10 shadow-sm">
        メニュー注文
      </h2>
      <div className="p-4 space-y-4">
        {menuItems.map((item) => {
          const cartItem = cart.find(c => c.id === item.id);
          const quantity = cartItem ? cartItem.quantity : 0;
          const isSoldOut = item.stock <= 0;
          const isMaxLimit = quantity >= Math.min(item.limit, item.stock);

          return (
            <div key={item.id} className={`bg-white rounded-xl p-4 border shadow-sm flex gap-4 ${isSoldOut ? "opacity-60 bg-gray-50" : ""}`}>
              {/* 画像エリア (Optional) */}
              <div className="w-20 h-20 bg-gray-200 rounded-lg flex-shrink-0 flex items-center justify-center text-xs text-gray-400 overflow-hidden relative">
                 {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" /> : "No Image"}
                 {isSoldOut && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold transform -rotate-12">SOLD OUT</div>}
              </div>
              
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-gray-800">{item.name}</h3>
                  <p className="text-gray-500 text-sm">¥{item.price.toLocaleString()}</p>
                  {item.limit < 99 && (
                    <p className="text-xs text-orange-600 mt-1">お一人様 {item.limit}個まで</p>
                  )}
                </div>

                {!isSoldOut && (
                  <div className="flex items-center justify-end gap-3 mt-2">
                    <button 
                      onClick={() => onUpdateCart(item, -1)}
                      disabled={quantity === 0}
                      className="w-8 h-8 rounded-full bg-gray-100 border flex items-center justify-center text-lg font-bold text-gray-600 disabled:opacity-30"
                    >
                      -
                    </button>
                    <span className="font-bold w-6 text-center">{quantity}</span>
                    <button 
                      onClick={() => onUpdateCart(item, 1)}
                      disabled={isMaxLimit}
                      className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold disabled:bg-gray-300"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cart Summary / Submit Footer */}
      {totalQuantity > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-2xl z-20 safe-area-bottom">
           <div className="flex justify-between items-end mb-2">
              <span className="text-sm font-bold text-gray-500">{totalQuantity}点の商品</span>
              <span className="text-xl font-bold text-blue-600">合計 ¥{totalPrice.toLocaleString()}</span>
           </div>
           <button 
             onClick={onSubmit}
             className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md active:scale-95 transition"
           >
             注文を確定する (在庫確保)
           </button>
        </div>
      )}
    </div>
  );
};

// --- Module 4: Order Timer Component ---
const OrderTimer = ({ createdAt }: { createdAt: number }) => {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      // LIMIT_TIME_MINUTES (30分)
      const expireTime = createdAt + (LIMIT_TIME_MINUTES * 60 * 1000);
      const diff = expireTime - now;

      if (diff <= 0) {
        setTimeLeft("00:00");
        setIsExpired(true);
        clearInterval(interval);
      } else {
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [createdAt]);

  if (isExpired) {
    return <span className="text-red-600 font-bold">期限切れ</span>;
  }
  return <span className="font-mono text-xl text-blue-600 font-bold">{timeLeft}</span>;
};

// --- Module 4: Order Ticket & Payment View ---
export const OrderTicketView = ({ 
  order, onEnterPaymentMode, onBack 
}: { 
  order: Order;
  onEnterPaymentMode: (id: string) => void;
  onBack?: () => void;
}) => {
  const isPaying = order.status === 'paying';
  const isCompleted = order.status === 'completed';
  const isCancelled = order.status === 'cancelled' || order.status === 'force_cancelled';

  // 1. 支払い画面 (提示モード)
  if (isPaying) {
    return (
      <div className="fixed inset-0 bg-yellow-400 z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-300">
         <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm border-4 border-black">
            <h2 className="text-xl font-bold text-gray-500 mb-2">お支払い金額</h2>
            <p className="text-5xl font-black text-black mb-8">¥{order.totalPrice.toLocaleString()}</p>
            
            <div className="border-t-2 border-dashed border-gray-300 py-6 my-4">
              <p className="text-sm font-bold text-gray-500 mb-1">チケット番号</p>
              <p className="text-6xl font-black tracking-widest text-blue-600">{order.ticketId}</p>
            </div>

            <div className="bg-yellow-100 text-yellow-800 p-4 rounded-lg font-bold text-sm animate-pulse">
               スタッフにこの画面を<br/>ご提示ください
            </div>
         </div>
         <p className="mt-8 text-yellow-900 font-bold opacity-75 text-sm">
           ※支払い完了まで画面を閉じないでください
         </p>
      </div>
    );
  }

  // 2. 完了画面
  if (isCompleted) {
    return (
      <div className="p-8 text-center flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mb-6 shadow-sm">
           ✓
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">受取完了</h2>
        <p className="text-gray-500 mb-8">ご購入ありがとうございました！</p>
        <button onClick={onBack} className="text-blue-600 font-bold underline">ホームへ戻る</button>
      </div>
    );
  }

  // 3. キャンセル/期限切れ画面
  if (isCancelled) {
    return (
       <div className="p-8 text-center flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-24 h-24 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center text-4xl mb-6">
           ✕
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">キャンセルされました</h2>
        <p className="text-sm text-gray-500 mb-8">
           {order.status === 'force_cancelled' 
             ? "受取期限を過ぎたため、自動キャンセルされました。" 
             : "この注文はキャンセルされています。"}
        </p>
        <button onClick={onBack} className="px-6 py-3 bg-gray-800 text-white rounded-lg font-bold">ホームへ戻る</button>
      </div>
    );
  }

  // 4. 注文確約・受取待ち画面 (Default: status == 'ordered')
  return (
    <div className="p-4 max-w-md mx-auto">
       <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 p-4 text-white text-center">
             <p className="text-sm font-bold opacity-90 mb-1">注文確定済み</p>
             <h2 className="text-2xl font-bold">商品受取待ち</h2>
          </div>

          {/* Timer Section */}
          <div className="p-6 text-center border-b bg-blue-50">
             <p className="text-xs font-bold text-gray-500 mb-1">受取期限まで残り</p>
             <OrderTimer createdAt={order.createdAt} />
             <p className="text-[10px] text-gray-400 mt-2">
                ※期限を過ぎると自動キャンセルになる場合があります
             </p>
          </div>

          {/* Order Details */}
          <div className="p-6 space-y-4">
             <div className="flex justify-between items-center">
                <span className="font-bold text-gray-500">チケット番号</span>
                <span className="font-mono text-2xl font-black">{order.ticketId}</span>
             </div>
             
             <div className="border-t border-dashed my-4"></div>

             <div className="space-y-2">
                {order.items.map((item, idx) => (
                   <div key={idx} className="flex justify-between text-sm">
                      <span className="text-gray-700">{item.name} x{item.quantity}</span>
                      <span className="font-bold">¥{(item.price * item.quantity).toLocaleString()}</span>
                   </div>
                ))}
             </div>

             <div className="border-t border-dashed my-4"></div>

             <div className="flex justify-between items-center text-lg">
                <span className="font-bold">合計金額</span>
                <span className="font-bold text-blue-600">¥{order.totalPrice.toLocaleString()}</span>
             </div>
          </div>

          {/* Action Button */}
          <div className="p-4 bg-gray-50 border-t">
             <button 
               onClick={() => onEnterPaymentMode(order.id)}
               className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2"
             >
               <span>💳</span> お支払いへ進む (スタッフ提示)
             </button>
             {onBack && (
               <button onClick={onBack} className="w-full mt-3 text-sm text-gray-400 font-bold">
                 ← 戻る
               </button>
             )}
          </div>
       </div>
    </div>
  );
};
