// app/components.tsx
"use client";
import React, { useState, useEffect } from "react"; // useState, useEffectを追加
import { QrReader } from 'react-qr-reader';
import { Ticket, Shop, DraftBooking } from "./types";

// ★追加：共通設定
const LIMIT_TIME_MINUTES = 30;

// --- サブコンポーネント: 通知設定パネル ---
// (変更なし)
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

// --- サブコンポーネント: チケットカード ---
export const TicketCard = ({ t, onManualEnter, onCancel, onOpenQr }: { t: Ticket, onManualEnter: (t: Ticket) => void, onCancel: (t: Ticket) => void, onOpenQr: (t: Ticket) => void }) => {
  const isReady = t.status === 'ready';
  const isOrder = t.isOrder; // オーダーかどうか判定

  // ★追加: カウントダウン用ステート
  const [timeLeftStr, setTimeLeftStr] = useState("");
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    // 注文以外、または完了/キャンセル済みならタイマー不要
    if (!isOrder || t.status === 'completed' || t.status === 'canceled' || t.status === 'force_cancelled') return;

    const interval = setInterval(() => {
        const now = Date.now();
        const limitMs = LIMIT_TIME_MINUTES * 60 * 1000;
        const passed = now - t.timestamp; // Ticket作成時のtimestampを使用
        const remain = limitMs - passed;

        if (remain <= 0) {
            setIsExpired(true);
            setTimeLeftStr("00:00");
            clearInterval(interval);
        } else {
            const m = Math.floor(remain / 60000);
            const s = Math.floor((remain % 60000) / 1000);
            setTimeLeftStr(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
        }
    }, 1000);

    return () => clearInterval(interval);
  }, [t, isOrder]);

  // クラス定義
  let cardClass = "bg-white border-l-4 border-green-500 shadow-lg";
  
  // ★変更: スタイル分岐（強制キャンセル > 期限切れ > 呼び出し中 > 通常）
  if (t.status === 'force_cancelled') {
      cardClass = "bg-gray-100 border-l-4 border-gray-400 shadow-md opacity-70 grayscale";
  } else if (isOrder && isExpired) {
      cardClass = "bg-red-50 border-l-4 border-red-500 shadow-lg";
  } else if (isReady) {
      cardClass = "bg-red-50 border-l-4 border-red-500 shadow-xl ring-2 ring-red-400 animate-pulse-slow";
  } else if (isOrder) {
      cardClass = "bg-yellow-50 border-l-4 border-yellow-500 shadow-lg";
  }

  return (
    <div className={`${cardClass} p-4 rounded relative`}>
      <div className="flex justify-between items-start mb-3">
        <div className="w-full">
          {t.shopDepartment && (
            <p className="text-xs font-bold text-gray-500 mb-0.5">{t.shopDepartment}</p>
          )}
          <h2 className="font-bold text-lg flex items-center gap-2 leading-tight">
            {t.shopName}
            {!isOrder && (
                <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full border border-green-200 whitespace-nowrap">
                {t.count}名
                </span>
            )}
          </h2>

          {/* ★追加: 強制キャンセル時の表示 */}
          {t.status === 'force_cancelled' && (
              <div className="mt-2 bg-gray-600 text-white text-sm font-bold p-2 rounded text-center">
                  期限切れのためキャンセルされました
              </div>
          )}
          
          {isOrder ? (
            /* --- オーダー表示エリア --- */
            <div className="mt-2 w-full">
                 {/* ★追加: カウントダウンタイマー */}
                 {t.status !== 'completed' && t.status !== 'force_cancelled' && (
                    <div className={`mb-2 text-sm font-bold flex justify-between items-center ${isExpired ? "text-red-600" : "text-orange-600"}`}>
                        <span>受取期限まで:</span>
                        <span className="font-mono text-lg">{timeLeftStr}</span>
                    </div>
                )}
                {/* ★追加: 期限切れ警告 */}
                {isExpired && t.status !== 'completed' && t.status !== 'force_cancelled' && (
                    <p className="text-xs text-red-600 font-bold mb-2 bg-red-100 p-2 rounded border border-red-200">
                        ⚠️ お受け取り期限を過ぎています。<br/>スタッフに状況をお伝えください。<br/>(在庫が確保されていない可能性があります)
                    </p>
                )}

                {/* 金額・ID表示 */}
                <div className="flex justify-between items-end border-b border-gray-200 pb-2 mb-2">
                    <span className="font-bold text-gray-600">合計</span>
                    <span className="text-2xl font-bold text-gray-900">¥{t.totalPrice?.toLocaleString()}</span>
                </div>
                 <div className="mt-1 bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded inline-block">
                    Order No: {t.ticketId}
                </div>
            </div>
          ) : (
            /* --- 整理券/予約表示エリア --- */
            <>
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
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          {/* 手動入力/お支払いへボタン */}
          <button 
              onClick={() => onManualEnter(t)} 
              disabled={(t.isQueue && !isReady) || t.status === 'force_cancelled'} 
              className={`flex-1 font-bold py-3 rounded-lg shadow transition text-sm
              ${((t.isQueue && !isReady) || t.status === 'force_cancelled')
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed" 
                  : isOrder 
                      ? "bg-yellow-500 text-white hover:bg-yellow-600" // オーダー時は黄色
                      : "bg-blue-600 text-white hover:bg-blue-500"
              }`}
          >
              {isOrder 
                  ? "💴 お支払い画面へ" 
                  : (t.isQueue && !isReady) ? "待機中..." : "パスワード入力で入場"
              }
          </button>
          
          {/* キャンセルボタン (完了や強制キャンセル以外で表示) */}
          {t.status !== 'completed' && t.status !== 'force_cancelled' && (
              <button onClick={() => onCancel(t)} className="px-4 text-red-500 border border-red-200 rounded-lg text-xs hover:bg-red-50">
                  削除
              </button>
          )}
        </div>

        {/* QRコードで入場ボタン (整理券のみ) */}
        {!isOrder && t.status !== 'force_cancelled' && (
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
        )}
      </div>
    </div>
  );
};

// --- サブコンポーネント: 店舗リスト (変更なし) ---
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

// --- サブコンポーネント: 店舗詳細・予約画面 (変更なし) ---
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

// --- サブコンポーネント: 予約確認モーダル (変更なし) ---
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

// --- サブコンポーネント: QRリーダーモーダル (変更なし) ---
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
