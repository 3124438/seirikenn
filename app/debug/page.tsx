// ＃生徒用管理画面 (app/debug/page.tsx など)
"use client";
import { useState, useEffect } from "react";
// 階層に合わせてパスを調整してください
import { db, auth } from "../../firebase"; 
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function ShopAdminPage() {
  // --- ログイン状態 ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [shopData, setShopData] = useState<any>(null);

  // --- 編集フォーム用State ---
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editPr, setEditPr] = useState(""); // PR文などがあれば
  const [editDepartment, setEditDepartment] = useState(""); // ★表示用（編集不可）
  const [isPaused, setIsPaused] = useState(false);

  // 初期化：匿名認証
  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));
    
    // 以前ログインしていたIDがあれば復元（任意）
    const savedId = localStorage.getItem("shop_login_id");
    if(savedId) setLoginId(savedId);
  }, []);

  // --- ログイン処理 & データ監視 ---
  const handleLogin = (e?: React.FormEvent) => {
    if(e) e.preventDefault();
    if(!loginId || !loginPass) return alert("IDとパスワードを入力してください");

    // リアルタイム監視を開始
    const unsub = onSnapshot(doc(db, "attractions", loginId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        // パスワード照合
        if (data.password === loginPass) {
          setShopData({ id: docSnap.id, ...data });
          setIsLoggedIn(true);
          localStorage.setItem("shop_login_id", loginId);
          
          // フォーム初期値セット
          setEditName(data.name);
          setEditImageUrl(data.imageUrl || "");
          setEditDepartment(data.department || ""); // ★団体名を取得
          setIsPaused(data.isPaused || false);
        } else {
          // パスワード違い（初回のみアラート出すなどの制御が必要ですが簡易的に）
          if(!shopData) alert("パスワードが違います");
        }
      } else {
        alert("指定されたIDの会場が見つかりません");
      }
    }, (error) => {
      console.error(error);
      alert("通信エラーが発生しました");
    });

    return () => unsub();
  };

  // --- 情報更新処理 ---
  const handleUpdate = async () => {
    if(!shopData) return;
    if(!editName) return alert("会場名は必須です");

    try {
      await updateDoc(doc(db, "attractions", shopData.id), {
        name: editName,
        imageUrl: editImageUrl,
        isPaused: isPaused,
        // ★重要: ここに department を含めない、あるいはUIで編集不可にしているため変更されない
      });
      alert("情報を更新しました！");
      setIsEditing(false);
    } catch(e) {
      console.error(e);
      alert("更新に失敗しました");
    }
  };

  // --- 予約操作 ---
  const toggleStatus = async (res: any, newStatus: "used" | "reserved") => {
    if(!confirm(newStatus === "used" ? "入場済みにしますか？" : "入場を取り消しますか？")) return;
    
    const otherRes = shopData.reservations.filter((r: any) => r.timestamp !== res.timestamp);
    const updatedRes = { ...res, status: newStatus };
    
    await updateDoc(doc(db, "attractions", shopData.id), {
      reservations: [...otherRes, updatedRes]
    });
  };

  // 予約を時間ごとにグループ化
  const getReservationsByTime = () => {
    if(!shopData) return {};
    const grouped: any = {};
    // スロット（時間枠）ベースで初期化
    Object.keys(shopData.slots || {}).sort().forEach(time => {
        grouped[time] = [];
    });
    // 予約を割り当て
    if(shopData.reservations) {
        shopData.reservations.forEach((res: any) => {
            if(grouped[res.time]) grouped[res.time].push(res);
        });
    }
    return grouped;
  };

  // --- ログイン前画面 ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 text-white">
        <form onSubmit={handleLogin} className="bg-gray-800 p-8 rounded-xl border border-gray-700 w-full max-w-md shadow-2xl">
          <h1 className="text-2xl font-bold mb-6 text-center text-blue-400">店舗用管理画面</h1>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Venue ID</label>
              <input 
                className="w-full bg-gray-700 p-3 rounded text-white outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ID (例: 3B)"
                value={loginId}
                onChange={e => setLoginId(e.target.value.toUpperCase())} // 自動で大文字に
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Password</label>
              <input 
                type="password"
                className="w-full bg-gray-700 p-3 rounded text-white outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="パスワード(5桁)"
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
              />
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded font-bold transition">
              ログイン
            </button>
          </div>
        </form>
      </div>
    );
  }

  // --- ログイン後画面 ---
  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans pb-20">
      {/* ヘッダー */}
      <div className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50 px-4 py-3 flex justify-between items-center shadow-lg">
        <div>
          <div className="text-xs text-blue-300 font-bold">{shopData.department || "未設定"}</div>
          <div className="font-bold text-lg leading-tight">{shopData.name}</div>
        </div>
        <button onClick={() => setIsLoggedIn(false)} className="text-xs bg-gray-700 px-3 py-1 rounded">ログアウト</button>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        
        {/* 設定・編集パネル */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-gray-300">⚙️ 店舗設定</h2>
            <button 
              onClick={() => setIsEditing(!isEditing)} 
              className={`text-xs px-3 py-1.5 rounded font-bold transition ${isEditing ? 'bg-gray-600' : 'bg-blue-600 hover:bg-blue-500'}`}
            >
              {isEditing ? "編集を閉じる" : "情報を編集"}
            </button>
          </div>

          {isEditing && (
            <div className="animate-fade-in space-y-4 border-t border-gray-700 pt-4">
               {/* ▼▼▼ ここが重要：団体名の編集不可エリア ▼▼▼ */}
               <div>
                <label className="block text-xs text-gray-400 mb-1">団体名 / クラス名</label>
                <input 
                  type="text" 
                  value={editDepartment} 
                  disabled // ★ここで入力を無効化
                  className="w-full bg-gray-900 text-gray-500 p-2 rounded border border-gray-700 cursor-not-allowed select-none"
                />
                <p className="text-[10px] text-red-400 mt-1">※団体名は変更できません。修正が必要な場合は生徒会へ連絡してください。</p>
              </div>
              {/* ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲ */}

              <div>
                <label className="block text-xs text-gray-400 mb-1">表示名 (会場名)</label>
                <input 
                  type="text" 
                  value={editName} 
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-gray-700 p-2 rounded text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">画像URL</label>
                <input 
                  type="text" 
                  value={editImageUrl} 
                  onChange={(e) => setEditImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-gray-700 p-2 rounded text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
              </div>

              <div className="flex items-center gap-2 bg-gray-900 p-2 rounded border border-gray-700">
                <input 
                  type="checkbox" 
                  id="pauseCheck"
                  checked={isPaused} 
                  onChange={(e) => setIsPaused(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="pauseCheck" className="text-sm cursor-pointer select-none">
                  受付を一時停止する（混雑時など）
                </label>
              </div>

              <button onClick={handleUpdate} className="w-full bg-green-600 hover:bg-green-500 py-2 rounded font-bold shadow-lg">
                設定を保存
              </button>
            </div>
          )}
        </div>

        {/* 予約リスト表示 */}
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span>📅</span> 予約状況
          <span className="text-sm font-normal text-gray-400 bg-gray-800 px-2 py-1 rounded-full">
            合計: {shopData.reservations?.length || 0}件
          </span>
        </h2>

        <div className="space-y-6">
            {Object.entries(getReservationsByTime()).map(([time, reservations]: any) => {
                const capacity = shopData.capacity || 0;
                const count = reservations.length;
                const isFull = count >= capacity;

                return (
                    <div key={time} className={`border rounded-xl overflow-hidden ${isFull ? 'border-pink-900 bg-pink-900/10' : 'border-gray-700 bg-gray-800'}`}>
                        <div className="bg-gray-900/50 p-3 flex justify-between items-center border-b border-gray-700/50">
                            <span className="font-mono text-xl font-bold text-blue-300">{time}</span>
                            <span className={`text-sm font-bold ${isFull ? 'text-pink-400' : 'text-green-400'}`}>
                                {count} / {capacity}
                            </span>
                        </div>
                        <div className="p-2">
                            {reservations.length === 0 ? (
                                <p className="text-center text-xs text-gray-600 py-2">予約なし</p>
                            ) : (
                                <div className="space-y-2">
                                    {reservations.map((res: any) => (
                                        <div key={res.timestamp} className={`flex justify-between items-center p-3 rounded-lg ${res.status === 'used' ? 'bg-gray-900 opacity-50' : 'bg-gray-700'}`}>
                                            <div>
                                                <div className="text-xs text-gray-400 mb-0.5">User ID</div>
                                                <div className="font-mono font-bold text-yellow-400 text-lg">{res.userId}</div>
                                            </div>
                                            
                                            {res.status === 'used' ? (
                                                <button 
                                                    onClick={() => toggleStatus(res, "reserved")}
                                                    className="bg-gray-600 text-xs px-3 py-2 rounded font-bold hover:bg-gray-500"
                                                >
                                                    戻す
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={() => toggleStatus(res, "used")}
                                                    className="bg-gradient-to-r from-green-600 to-green-500 text-white text-sm px-6 py-2 rounded-lg font-bold shadow hover:from-green-500 hover:to-green-400 transform active:scale-95 transition"
                                                >
                                                    入場受付
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
      </div>
    </div>
  );
}
