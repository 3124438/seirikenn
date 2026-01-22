//app/debug/AdminEditForm.tsx
"use client";
import React, { useState } from "react";

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

// メニューアイテムの型定義 (仕様書 Section 3準拠)
type MenuItem = {
  id?: string;
  name: string;
  price: number;
  stock: number;
  limit: number;
};

type Props = {
  isEditing: boolean;
  manualId: string;
  
  // 会場基本情報
  newName: string; setNewName: (v: string) => void;
  department: string;
  imageUrl: string; setImageUrl: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  password: string;
  
  // 設定
  groupLimit: number; setGroupLimit: (v: number) => void;
  openTime: string; setOpenTime: (v: string) => void;
  closeTime: string; setCloseTime: (v: string) => void;
  duration: number; setDuration: (v: number) => void;
  capacity: number; setCapacity: (v: number) => void;
  
  // システムモード (Module 1: updateSystemMode)
  // 従来の isPaused boolean から systemMode string へ拡張
  systemMode: string; setSystemMode: (v: string) => void; 
  
  isQueueMode: boolean; setIsQueueMode: (v: boolean) => void;
  
  // メニュー管理 (Module 1: add/update/deleteMenuItem)
  menuList: MenuItem[];
  handleSaveMenu: (item: MenuItem) => void;
  handleDeleteMenu: (id: string) => void;

  handleSave: () => void;
  resetForm: () => void;
};

export default function AdminEditForm(props: Props) {
  // メニュー追加用のローカルステート
  const [menuForm, setMenuForm] = useState<MenuItem>({
    name: "",
    price: 0,
    stock: 0,
    limit: 1
  });

  const onAddMenuClick = () => {
    if (!menuForm.name || menuForm.price < 0) return alert("商品名と価格を入力してください");
    props.handleSaveMenu(menuForm);
    setMenuForm({ name: "", price: 0, stock: 0, limit: 1 }); // リセット
  };

  if (!props.isEditing) {
    return (
      <div className="bg-gray-800/50 rounded p-3 mb-4 border border-gray-700 text-center text-xs text-gray-500">
        ※設定を変更するには、下のリストから会場を選び「設定編集」ボタンを押してください。
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-blue-500 mb-4 animate-fade-in shadow-lg shadow-blue-900/20">
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

      {/* 5. 運用モード設定 (Module 1: updateSystemMode) */}
      <div className="bg-gray-750 p-3 rounded border border-gray-600 mb-4 bg-gray-900/30">
        <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Operation Mode</h4>
        <div className="flex flex-col gap-3">
          {/* システム全体のモード切替 */}
          <div className="flex items-center gap-4 bg-gray-800 p-2 rounded border border-gray-700">
            <span className="text-xs font-bold text-gray-400 w-20">営業状態:</span>
            <select 
              value={props.systemMode || "closed"} 
              onChange={(e) => props.setSystemMode(e.target.value)}
              className={`flex-1 p-1 rounded text-sm font-bold outline-none border 
                ${props.systemMode === "open" ? "bg-green-900 text-green-300 border-green-700" : 
                  props.systemMode === "pre_open" ? "bg-yellow-900 text-yellow-300 border-yellow-700" : 
                  "bg-red-900 text-red-300 border-red-700"}`}
            >
              <option value="pre_open">🟡 開店前 (準備中)</option>
              <option value="open">🟢 営業中 (受付開始)</option>
              <option value="closed">🔴 受付終了 / 停止</option>
            </select>
          </div>

          {/* 予約/順番待ちモード切替 */}
          <div className="flex items-center gap-2 bg-gray-800 p-2 rounded border border-gray-700">
            <span className={`text-xs font-bold ${!props.isQueueMode ? "text-blue-400" : "text-gray-500"}`}>🕒 時間予約制</span>
            <div className="relative inline-block w-10 mx-2 align-middle select-none transition duration-200 ease-in">
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
        </div>
      </div>

      {/* 6. メニュー管理 (Module 1: Menu Management) */}
      <div className="bg-gray-750 p-3 rounded border border-gray-600 mb-4 bg-gray-900/30">
        <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-2">
          <span>🍔 Menu Items</span>
          <span className="text-[10px] bg-blue-900 text-blue-200 px-2 py-0.5 rounded">Order System</span>
        </h4>
        
        {/* メニュー登録フォーム */}
        <div className="bg-gray-800 p-3 rounded border border-gray-700 mb-3">
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-12 md:col-span-4">
              <label className="text-[10px] text-gray-400 block mb-1">商品名</label>
              <input 
                className="w-full bg-gray-700 p-1.5 rounded text-sm text-white border border-gray-600"
                placeholder="例: 焼きそば"
                value={menuForm.name}
                onChange={e => setMenuForm({...menuForm, name: e.target.value})}
              />
            </div>
            <div className="col-span-4 md:col-span-2">
              <label className="text-[10px] text-gray-400 block mb-1">単価(¥)</label>
              <input 
                type="number"
                className="w-full bg-gray-700 p-1.5 rounded text-sm text-white border border-gray-600"
                placeholder="0"
                value={menuForm.price}
                onChange={e => setMenuForm({...menuForm, price: Number(e.target.value)})}
              />
            </div>
            <div className="col-span-4 md:col-span-2">
              <label className="text-[10px] text-gray-400 block mb-1">在庫数(Stock)</label>
              <input 
                type="number"
                className="w-full bg-gray-700 p-1.5 rounded text-sm text-white border border-gray-600"
                placeholder="0"
                value={menuForm.stock}
                onChange={e => setMenuForm({...menuForm, stock: Number(e.target.value)})}
              />
            </div>
            <div className="col-span-4 md:col-span-2">
              <label className="text-[10px] text-gray-400 block mb-1">購入制限(個/人)</label>
              <input 
                type="number"
                className="w-full bg-gray-700 p-1.5 rounded text-sm text-white border border-gray-600"
                placeholder="1"
                value={menuForm.limit}
                onChange={e => setMenuForm({...menuForm, limit: Number(e.target.value)})}
              />
            </div>
            <div className="col-span-12 md:col-span-2">
              <button onClick={onAddMenuClick} className="w-full bg-blue-600 hover:bg-blue-500 text-white p-1.5 rounded text-xs font-bold transition">
                追加
              </button>
            </div>
          </div>
        </div>

        {/* メニューリスト */}
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {props.menuList && props.menuList.length > 0 ? (
            props.menuList.map((item, idx) => (
              <div key={item.id || idx} className="flex justify-between items-center bg-gray-800 px-3 py-2 rounded border border-gray-700 text-sm">
                <div className="flex-1">
                  <span className="font-bold text-white">{item.name}</span>
                  <div className="text-xs text-gray-400 flex gap-2">
                    <span>¥{item.price}</span>
                    <span className={item.stock === 0 ? "text-red-500 font-bold" : ""}>在庫: {item.stock}</span>
                    <span>制限: {item.limit}</span>
                  </div>
                </div>
                <button 
                  onClick={() => item.id && props.handleDeleteMenu(item.id)}
                  className="text-gray-500 hover:text-red-400 transition"
                >
                  🗑
                </button>
              </div>
            ))
          ) : (
            <div className="text-center text-xs text-gray-500 py-2">メニューが登録されていません</div>
          )}
        </div>
      </div>

      {/* 7. 時間・予約設定 (時間予約制のみ) */}
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

      {/* 8. 人数制限 (共通) */}
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
  );
}
