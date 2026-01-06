// ＃生徒用管理画面 (app/debug/page.tsx など)
"use client";
import { useState, useEffect } from "react";
// パスは環境に合わせて調整してください
import { db, auth } from "../../firebase"; 
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function ShopAdminPage() {
  // --- ログイン状態 ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [loginPass, setLoginPass] = useState("");

  // --- 店舗データ ---
  const [shopData, setShopData] = useState<any>(null);

  // --- 編集フォーム用ステート ---
  const [editName, setEditName] = useState("");
  const [editDepartment, setEditDepartment] = useState(""); // ★追加: 団体名（編集不可用）
  const [editImageUrl, setEditImageUrl] = useState("");     // ★追加: 画像URL
  const [editOpenTime, setEditOpenTime] = useState("");
  const [editCloseTime, setEditCloseTime] = useState("");
  const [editDuration, setEditDuration] = useState(20);
  const [editCapacity, setEditCapacity] = useState(3);

  // UI管理
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));
    
    // ログイン情報をローカルストレージから復元（利便性のため）
    const savedId = localStorage.getItem("shop_login_id");
    const savedPass = localStorage.getItem("shop_login_pass");
    if (savedId && savedPass) {
      setLoginId(savedId);
      setLoginPass(savedPass);
    }
  }, []);

  // --- ログイン処理 ---
  const handleLogin = () => {
    if (!loginId || !loginPass) return alert("IDとパスワードを入力してください");
    
    // Firestore購読開始
    const unsub = onSnapshot(doc(db, "attractions", loginId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.password === loginPass) {
          setShopData({ id: docSnap.id, ...data });
          setIsLoggedIn(true);
          
          // ログイン成功時にフォーム初期値をセット
          if (!isSettingsOpen) {
            setEditName(data.name);
            setEditDepartment(data.department || ""); // ★データをセット
            setEditImageUrl(data.imageUrl || "");     // ★データをセット
            setEditOpenTime(data.openTime);
            setEditCloseTime(data.closeTime);
            setEditDuration(data.duration);
            setEditCapacity(data.capacity);
          }
          
          // 次回用に保存
          localStorage.setItem("shop_login_id", loginId);
          localStorage.setItem("shop_login_pass", loginPass);
        } else {
          alert("パスワードが違います");
          setShopData(null);
        }
      } else {
        alert("IDが見つかりません");
      }
    });
    return () => unsub();
  };

  // --- 受付停止/再開 ---
  const togglePause = async () => {
    if (!shopData) return;
    const newState = !shopData.isPaused;
    await updateDoc(doc(db, "attractions", shopData.id), { isPaused: newState });
  };

  // --- 設定保存 ---
  const handleSaveSettings = async () => {
    if (!shopData) return;
    if (!editName) return alert("会場名は必須です");

    try {
      // department（団体名）は更新データに含めない、もしくは編集不可なのでそのまま
      await updateDoc(doc(db, "attractions", shopData.id), {
        name: editName,
        imageUrl: editImageUrl, // 画像は変更許可
        openTime: editOpenTime,
        closeTime: editCloseTime,
        duration: editDuration,
        capacity: editCapacity
      });
      alert("設定を更新しました");
      setIsSettingsOpen(false);
    } catch (e) {
      console.error(e);
      alert("更新に失敗しました");
    }
  };

  // --- 予約操作（入場処理など） ---
  const handleStatusChange = async (res: any, newStatus: string) => {
    if (!shopData) return;
    const otherRes = shopData.reservations.filter((r: any) => r.timestamp !== res.timestamp);
    const updatedRes = { ...res, status: newStatus };
    await updateDoc(doc(db, "attractions", shopData.id), {
      reservations: [...otherRes, updatedRes]
    });
  };

  // ----------------------------------------------------
  // 1. 未ログイン時の表示
  // ----------------------------------------------------
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 text-white">
        <div className="bg-gray-800 p-8 rounded-xl border border-gray-700 w-full max-w-md shadow-2xl">
          <h1 className="text-2xl font-bold text-center mb-6 text-blue-400">出展団体用ログイン</h1>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">会場ID</label>
              <input 
                className="w-full bg-gray-700 border border-gray-600 rounded p-3 text-white focus:border-blue-500 outline-none transition"
                placeholder="例: 3B"
                value={loginId} onChange={e => setLoginId(e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">パスワード</label>
              <input 
                type="text" 
                className="w-full bg-gray-700 border border-gray-600 rounded p-3 text-white focus:border-blue-500 outline-none transition"
                placeholder="数字5桁"
                value={loginPass} onChange={e => setLoginPass(e.target.value)}
              />
            </div>
            <button 
              onClick={handleLogin}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition shadow-lg"
            >
              管理画面へ入る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 2. ログイン後の表示（ダッシュボード）
  // ----------------------------------------------------
  
  // 予約データの整理
  const reservations = shopData?.reservations || [];
  const activeReservations = reservations.filter((r: any) => r.status !== 'used');
  const usedReservations = reservations.filter((r: any) => r.status === 'used');

  return (
    <div className="min-h-screen bg-black text-white pb-20 font-sans">
      
      {/* ヘッダー */}
      <div className="bg-gray-900 border-b border-gray-800 p-4 sticky top-0 z-50 shadow-md">
        <div className="flex justify-between items-center max-w-2xl mx-auto">
          <div>
            <div className="flex items-center gap-2">
               {/* 団体名表示 */}
               {shopData.department && (
                 <span className="text-[10px] bg-blue-900 text-blue-200 px-2 py-0.5 rounded border border-blue-700">
                   {shopData.department}
                 </span>
               )}
               <span className="font-mono text-yellow-400 font-bold text-xl">{shopData.id}</span>
            </div>
            <h1 className="font-bold text-lg leading-tight">{shopData.name}</h1>
          </div>
          <button 
            onClick={() => setIsLoggedIn(false)}
            className="text-xs text-gray-500 underline"
          >
            ログアウト
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-6">

        {/* --- コントロールパネル --- */}
        <div className="grid grid-cols-2 gap-3">
           <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 text-center">
              <div className="text-gray-400 text-xs mb-1">現在の待ち組数</div>
              <div className="text-4xl font-bold text-blue-400 font-mono">{activeReservations.length}</div>
           </div>
           
           <button 
             onClick={togglePause}
             className={`p-4 rounded-xl border flex flex-col items-center justify-center transition ${shopData.isPaused ? 'bg-red-900/50 border-red-500 text-red-100' : 'bg-green-900/50 border-green-500 text-green-100'}`}
           >
             <span className="text-2xl mb-1">{shopData.isPaused ? "🛑" : "🟢"}</span>
             <span className="font-bold text-sm">{shopData.isPaused ? "受付停止中" : "受付中"}</span>
           </button>
        </div>

        {/* --- 設定変更エリア（アコーディオン） --- */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <button 
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="w-full p-4 flex justify-between items-center bg-gray-800 hover:bg-gray-750 transition"
          >
            <span className="font-bold text-gray-300">⚙️ 会場情報の編集</span>
            <span className="text-gray-500">{isSettingsOpen ? "▲" : "▼"}</span>
          </button>
          
          {isSettingsOpen && (
            <div className="p-4 border-t border-gray-700 space-y-4 bg-gray-800/50">
              
              {/* ★ここが重要：団体名の編集不可エリア */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">団体名・クラス名 (変更不可)</label>
                <input 
                  type="text" 
                  value={editDepartment} 
                  disabled // ★編集不可に設定
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-gray-500 cursor-not-allowed"
                />
                <p className="text-[10px] text-red-400 mt-1">※団体名を変更したい場合は生徒会本部へ連絡してください。</p>
              </div>
              
              {/* 通常の編集可能エリア */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">会場名（企画名）</label>
                <input 
                  type="text" 
                  value={editName} 
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">画像URL (任意)</label>
                <input 
                  type="text" 
                  value={editImageUrl} 
                  onChange={e => setEditImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                   <label className="block text-xs text-gray-400 mb-1">開始時間</label>
                   <input type="time" value={editOpenTime} onChange={e => setEditOpenTime(e.target.value)} className="w-full bg-gray-700 rounded p-2 text-white"/>
                </div>
                <div>
                   <label className="block text-xs text-gray-400 mb-1">終了時間</label>
                   <input type="time" value={editCloseTime} onChange={e => setEditCloseTime(e.target.value)} className="w-full bg-gray-700 rounded p-2 text-white"/>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                 <div>
                   <label className="block text-xs text-gray-400 mb-1">回転(分)</label>
                   <input type="number" value={editDuration} onChange={e => setEditDuration(Number(e.target.value))} className="w-full bg-gray-700 rounded p-2 text-white"/>
                 </div>
                 <div>
                   <label className="block text-xs text-gray-400 mb-1">1枠定員</label>
                   <input type="number" value={editCapacity} onChange={e => setEditCapacity(Number(e.target.value))} className="w-full bg-gray-700 rounded p-2 text-white"/>
                 </div>
              </div>

              <button 
                onClick={handleSaveSettings}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded shadow mt-2"
              >
                変更を保存する
              </button>
            </div>
          )}
        </div>

        {/* --- 予約リスト --- */}
        <div>
          <h2 className="text-gray-400 text-sm font-bold mb-3 uppercase tracking-wider">Queue List</h2>
          
          {activeReservations.length === 0 ? (
             <div className="text-center py-10 text-gray-600 bg-gray-900 rounded-xl border border-gray-800">
                現在待ち列はありません
             </div>
          ) : (
             <div className="space-y-2">
               {activeReservations.map((res: any, index: number) => (
                 <div key={res.timestamp} className="bg-gray-800 border border-gray-700 p-3 rounded-lg flex justify-between items-center shadow-sm">
                    <div className="flex items-center gap-3">
                       <div className="bg-blue-900/50 text-blue-300 font-mono text-sm px-2 py-1 rounded">
                         #{index + 1}
                       </div>
                       <div>
                          <div className="font-bold text-yellow-400 font-mono text-lg">{res.userId}</div>
                          <div className="text-xs text-gray-400">{res.time} の回</div>
                       </div>
                    </div>
                    <button 
                      onClick={() => handleStatusChange(res, 'used')}
                      className="bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow transition"
                    >
                      入場処理
                    </button>
                 </div>
               ))}
             </div>
          )}
        </div>
        
        {/* --- 入場済みリスト（簡易表示） --- */}
        {usedReservations.length > 0 && (
           <div className="opacity-50 mt-8">
              <h2 className="text-gray-500 text-xs font-bold mb-2 uppercase">Processed (直近の入場済)</h2>
              <div className="space-y-1">
                 {usedReservations.slice(-3).map((res: any) => (
                    <div key={res.timestamp} className="flex justify-between text-xs text-gray-600 px-2">
                       <span>{res.userId}</span>
                       <span>入場済</span>
                    </div>
                 ))}
              </div>
           </div>
        )}

      </div>
    </div>
  );
}
