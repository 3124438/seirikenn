"use client";
import React, { useState, useEffect } from "react";

// ★仕様書: 共通設定 (受取期限の分数)
const LIMIT_TIME_MINUTES = 30;

// GoogleドライブのURLを自動変換する関数
const convertGoogleDriveLink = (url: string) => {
  if (!url) return "";
  if (!url.includes("drive.google.com") || url.includes("export=view")) {
    return url;
  }
  try {
    const id = url.split("/d/")[1].split("/")[0];
    return `https://drive.google.com/uc?export=view&id=${id}`;
  } catch (e) {
    return url;
  }
};

// ★追加: オーダー用型定義
type AdminOrder = {
  id: string;
  ticketId: string;
  items: { name: string; count: number }[];
  totalAmount: number;
  status: string;
  createdAt: any; // Date | number | Firestore Timestamp
};

type Props = {
  isEditing: boolean;
  manualId: string;
  newName: string; setNewName: (v: string) => void;
  department: string;
  imageUrl: string; setImageUrl: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  password: string;
  groupLimit: number; setGroupLimit: (v: number) => void;
  openTime: string; setOpenTime: (v: string) => void;
  closeTime: string; setCloseTime: (v: string) => void;
  duration: number; setDuration: (v: number) => void;
  capacity: number; setCapacity: (v: number) => void;
  isPaused: boolean; setIsPaused: (v: boolean) => void;
  isQueueMode: boolean; setIsQueueMode: (v: boolean) => void;
  handleSave: () => void;
  resetForm: () => void;
  
  // ★追加: オーダー監視用データ・関数
  orders?: AdminOrder[];
  onForceCancel?: (orderId: string) => void; // 強制キャンセル
  onPaymentComplete?: (orderId: string) => void; // 支払い完了
};

export default function AdminEditForm(props: Props) {
  // ★追加: リアルタイム監視用の現在時刻ステート
  const [now, setNow] = useState(Date.now());

  // 1分ごとに現在時刻を更新（経過時間表示のため）
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  if (!props.isEditing) {
    return (
      <div className="bg-gray-800/50 rounded p-3 mb-4 border border-gray-700 text-center text-xs text-gray-500">
        ※設定を変更するには、下のリストから会場を選び「設定編集」ボタンを押してください。
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* === 既存: 設定編集フォーム === */}
      <div className="bg-gray-800 rounded-lg p-4 border border-blue-500 shadow-lg shadow-blue-900/20">
        <h3 className="text-sm font-bold mb-4 text-blue-300 flex items-center gap-2 border-b border-gray-700 pb-2">
          <span>✏️ 設定編集モード</span>
          <span className="text-gray-500 text-xs font-normal ml-auto">ID: {props.manualId}</span>
        </h3>

        {/* 1. 変更不可情報 */}
        <div className="grid gap-4 md:grid-cols-2 mb-4 bg-gray-900/50 p-3 rounded border border-gray-700">
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">会場ID <span className="text-[10px] bg-gray-700 px-1 rounded text-gray-400">変更不可</span></label>
            <input disabled className="bg-gray-800 p-2 rounded text-gray-400 cursor-not-allowed border border-gray-700 font-mono" value={props.manualId} />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">管理者Pass <span className="text-[10px] bg-gray-700 px-1 rounded text-gray-400">変更不可</span></label>
            <input disabled className="bg-gray-800 p-2 rounded text-gray-400 cursor-not-allowed border border-gray-700 font-mono" value={props.password} />
          </div>
        </div>

        {/* 2. 基本情報 */}
        <div className="grid gap-4 md:grid-cols-2 mb-4">
          <div className="flex flex-col">
            <label className="text-xs text-gray-400 mb-1">会場名 <span className="text-red-500 text-[10px] border border-red-500/50 px-1 rounded ml-1">必須</span></label>
            <input className="bg-gray-700 p-2 rounded text-white border border-gray-600 focus:border-blue-500 outline-none" placeholder="会場名" value={props.newName} onChange={e => props.setNewName(e.target.value)} />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">団体・クラス名 <span className="text-[10px] bg-gray-700 px-1 rounded text-gray-400">変更不可</span></label>
            <input disabled className="bg-gray-800 p-2 rounded text-gray-400 cursor-not-allowed border border-gray-700" value={props.department} />
          </div>
        </div>

        {/* 3. 画像URL */}
        <div className="mb-4">
          <div className="flex flex-col">
            <label className="text-xs text-gray-400 mb-1">画像URL (Google Drive等) <span className="text-gray-500 text-[10px] border border-gray-600 px-1 rounded ml-1">任意</span></label>
            <input className="bg-gray-700 p-2 rounded text-white border border-gray-600 focus:border-blue-500 outline-none w-full" placeholder="https://..." value={props.imageUrl} onChange={e => props.setImageUrl(convertGoogleDriveLink(e.target.value))} />
          </div>
        </div>

        {/* 4. 説明文 */}
        <div className="mb-4">
          <label className="text-xs text-gray-400 mb-1 block">会場説明文 <span className="text-gray-500 text-[10px] border border-gray-600 px-1 rounded ml-1">任意</span> <span className="text-[10px] text-gray-500 ml-1">※最大500文字</span></label>
          <textarea
            className="w-full bg-gray-700 p-2 rounded text-white h-24 text-sm border border-gray-600 focus:border-blue-500 outline-none resize-none"
            placeholder="会場のアピールポイントや注意事項を入力してください。"
            maxLength={500}
            value={props.description}
            onChange={e => props.setDescription(e.target.value)}
          />
          <div className="text-right text-xs text-gray-500">{props.description.length}/500</div>
        </div>

        {/* 5. 運用モード設定 */}
        <div className="bg-gray-750 p-3 rounded border border-gray-600 mb-4 bg-gray-900/30">
          <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Operation Mode</h4>
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2 bg-gray-800 px-3 py-2 rounded border border-gray-700">
              <span className={`text-xs font-bold ${!props.isQueueMode ? "text-blue-400" : "text-gray-500"}`}>🕒 時間予約制</span>
              <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                <input type="checkbox" name="toggle" id="mode-toggle"
                  checked={props.isQueueMode}
                  onChange={(e) => props.setIsQueueMode(e.target.checked)}
                  className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer transition-transform duration-200 ease-in-out"
                  style={{ transform: props.isQueueMode ? 'translateX(100%)' : 'translateX(0)' }}
                />
                <label htmlFor="mode-toggle" className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${props.isQueueMode ? "bg-green-600" : "bg-gray-600"}`}></label>
              </div>
              <span className={`text-xs font-bold ${props.isQueueMode ? "text-green-400" : "text-gray-500"}`}>🔢 順番待ち制</span>
            </div>

            <div className="flex items-center gap-2 bg-gray-800 px-3 py-2 rounded border border-gray-700">
              <input type="checkbox" checked={props.isPaused} onChange={e => props.setIsPaused(e.target.checked)} className="accent-red-500 w-4 h-4 cursor-pointer" />
              <span className={`text-xs font-bold ${props.isPaused ? "text-red-400" : "text-gray-400"}`}>⛔ 受付を緊急停止</span>
            </div>
          </div>
        </div>

        {/* 6. 時間・予約設定 (時間予約制のみ) */}
        {!props.isQueueMode && (
          <div className="bg-gray-750 p-3 rounded border border-gray-600 mb-4 bg-gray-900/30">
            <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Time Settings (予約制のみ)</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
              <div className="flex flex-col">
                <label className="text-[10px] text-gray-400 mb-1">開始時間 <span className="text-red-500">*</span></label>
                <input type="time" value={props.openTime} onChange={e => props.setOpenTime(e.target.value)} className="bg-gray-700 p-2 rounded text-sm outline-none border border-gray-600 focus:border-blue-500" />
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] text-gray-400 mb-1">終了時間 <span className="text-red-500">*</span></label>
                <input type="time" value={props.closeTime} onChange={e => props.setCloseTime(e.target.value)} className="bg-gray-700 p-2 rounded text-sm outline-none border border-gray-600 focus:border-blue-500" />
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] text-gray-400 mb-1">1枠の時間(分) <span className="text-red-500">*</span></label>
                <input type="number" value={props.duration} onChange={e => props.setDuration(Number(e.target.value))} className="bg-gray-700 p-2 rounded text-sm outline-none border border-gray-600 focus:border-blue-500" placeholder="分" />
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] text-gray-400 mb-1">枠ごとの定員(組) <span className="text-red-500">*</span></label>
                <input type="number" value={props.capacity} onChange={e => props.setCapacity(Number(e.target.value))} className="bg-gray-700 p-2 rounded text-sm outline-none border border-gray-600 focus:border-blue-500" placeholder="定員" />
              </div>
            </div>
          </div>
        )}

        {/* 7. 人数制限 (共通) */}
        <div className="bg-gray-750 p-3 rounded border border-gray-600 mb-4 bg-gray-900/30 flex items-center gap-4">
          <div className="flex flex-col">
            <label className="text-[10px] text-gray-400 mb-1">1組の最大人数</label>
            <input type="number" value={props.groupLimit} onChange={e => props.setGroupLimit(Number(e.target.value))} className="w-20 bg-gray-700 p-2 rounded text-sm outline-none text-center border border-gray-600 focus:border-blue-500" />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={props.handleSave} className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 py-3 rounded font-bold transition shadow-lg shadow-blue-900/40">変更を保存</button>
          <button onClick={props.resetForm} className="bg-gray-700 hover:bg-gray-600 px-6 rounded text-sm transition border border-gray-600">キャンセル</button>
        </div>
      </div>

      {/* === ★追加: Module 2 オーダー監視・強制キャンセル機能 === */}
      {props.orders && props.orders.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4 border border-orange-500 shadow-lg shadow-orange-900/20">
          <h3 className="text-sm font-bold mb-4 text-orange-300 flex items-center gap-2 border-b border-gray-700 pb-2">
            <span>🚨 オーダー監視・対応</span>
          </h3>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
            {props.orders.map((order) => {
              // 時間計算ロジック
              const createdAtMs = typeof order.createdAt === 'number' 
                  ? order.createdAt 
                  : order.createdAt?.toMillis 
                      ? order.createdAt.toMillis() 
                      : new Date(order.createdAt).getTime();

              const elapsedMinutes = Math.floor((now - createdAtMs) / (1000 * 60));
              const isOverdue = elapsedMinutes > LIMIT_TIME_MINUTES;
              const overdueMinutes = elapsedMinutes - LIMIT_TIME_MINUTES;
              const isCancelled = order.status === 'canceled' || order.status === 'force_cancelled';

              // 警告時のスタイル変更
              const cardClass = isOverdue && !isCancelled && order.status !== 'completed'
                  ? "border-red-500 bg-red-900/20" 
                  : "border-gray-600 bg-gray-700";

              const textClass = isOverdue && !isCancelled && order.status !== 'completed'
                  ? "text-red-400" 
                  : "text-gray-400";

              return (
                <div key={order.id} className={`border rounded p-3 flex flex-col ${cardClass}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono bg-gray-900 px-2 rounded text-white text-xs py-1">#{order.ticketId}</span>
                    <span className="font-bold text-white">¥{order.totalAmount.toLocaleString()}</span>
                  </div>
                  
                  {/* 警告表示 */}
                  <div className={`text-xs font-bold mb-2 ${textClass}`}>
                    {isOverdue && !isCancelled && order.status !== 'completed' ? (
                      <span className="flex items-center gap-1">
                        ⚠️ 経過: {elapsedMinutes}分 (+{overdueMinutes}分超過)
                      </span>
                    ) : (
                      <span>経過: {elapsedMinutes}分</span>
                    )}
                  </div>

                  <div className="text-xs text-gray-300 mb-3 flex-1">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between border-b border-gray-600/50 pb-1 mb-1">
                        <span>{item.name}</span>
                        <span>x{item.count}</span>
                      </div>
                    ))}
                  </div>

                  {/* 操作ボタン */}
                  <div className="flex gap-2 mt-auto">
                    {order.status === 'ordered' || order.status === 'paying' ? (
                      <>
                         {/* 強制キャンセルボタン (仕様書 Module 2) */}
                        <button
                          onClick={() => {
                            if(window.confirm("【重要】強制キャンセルしますか？\n在庫が元に戻ります。")) {
                              props.onForceCancel?.(order.id);
                            }
                          }}
                          className={`flex-1 py-2 text-xs font-bold border rounded transition
                            ${isOverdue 
                                ? "bg-red-600 border-red-500 text-white hover:bg-red-700" 
                                : "border-red-800 text-red-500 hover:bg-red-900/50"
                            }`}
                        >
                          {isOverdue ? "強制キャンセル (在庫戻し)" : "注文取消"}
                        </button>
                        
                        {props.onPaymentComplete && (
                          <button
                            onClick={() => props.onPaymentComplete?.(order.id)}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded"
                          >
                            支払い完了
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="w-full text-center text-xs text-gray-500 py-2 bg-gray-800 rounded">
                        {order.status === 'completed' ? "受渡完了" : "キャンセル済"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
