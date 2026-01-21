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
