"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../../firebase"; 
import { doc, getDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function AdminPage() {
  const [shopId, setShopId] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [shopData, setShopData] = useState<any>(null);
  
  // 予約BAN（客としての利用禁止）用
  const [banInput, setBanInput] = useState("");

  // 自分のID（権限チェック用）
  const [myUserId, setMyUserId] = useState("");

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    // 一般画面と同じIDを取得して、自分がスタッフかBAN対象かを判定する
    const stored = localStorage.getItem("bunkasai_user_id");
    if (stored) setMyUserId(stored);
  }, []);

  // ログイン処理
  const handleLogin = async () => {
    try {
      const docRef = doc(db, "attractions", shopId);
      const snap = await getDoc(docRef);
      
      if (!snap.exists()) {
        alert("店舗IDが見つかりません");
        return;
      }

      const data = snap.data();

      // 1. 編集権限剥奪チェック (Admin Ban)
      if (data.adminBannedUsers && data.adminBannedUsers.includes(myUserId)) {
        alert("あなたの端末からのアクセスはこの店舗の管理者により禁止されています。(Access Denied)");
        return;
      }

      // 2. 編集権限付与チェック (Admin Allow) -> パスワード無視でOK
      if (data.adminAllowedUsers && data.adminAllowedUsers.includes(myUserId)) {
        alert(`スタッフ認証: ID ${myUserId} は許可されています。`);
        setIsLoggedIn(true);
        return;
      }

      // 3. 通常のパスワードチェック
      if (data.password === password) {
        setIsLoggedIn(true);
      } else {
        alert("パスワードが違います");
      }

    } catch (e) {
      alert("エラーが発生しました");
      console.error(e);
    }
  };

  useEffect(() => {
    if (!isLoggedIn || !shopId) return;
    const unsub = onSnapshot(doc(db, "attractions", shopId), (doc) => {
      const data = doc.data();
      setShopData(data);

      // ログイン中にBANされた場合、強制ログアウトさせる
      if (data?.adminBannedUsers?.includes(myUserId)) {
          alert("管理者権限が剥奪されました。");
          setIsLoggedIn(false);
          setShopData(null);
      }
    });
    return () => unsub();
  }, [isLoggedIn, shopId, myUserId]);

  const togglePause = async () => {
    if (!shopData) return;
    const newState = !shopData.isPaused;
    if (confirm(newState ? "新規受付を停止しますか？" : "受付を再開しますか？")) {
        await updateDoc(doc(db, "attractions", shopId), { isPaused: newState });
    }
  };

  // 予約BAN（客BAN）の追加
  const handleAddBan = async () => {
    if(!banInput) return;
    if(!confirm(`ID: ${banInput} をこの店舗で予約不可(BAN)にしますか？`)) return;
    try {
        await updateDoc(doc(db, "attractions", shopId), {
            bannedUsers: arrayUnion(banInput)
        });
        setBanInput("");
        alert("BANリストに追加しました");
    } catch(e) { alert("エラー"); }
  };

  // 予約BAN（客BAN）の解除
  const handleRemoveBan = async (id: string) => {
    if(!confirm(`ID: ${id} のBANを解除しますか？`)) return;
    try {
        await updateDoc(doc(db, "attractions", shopId), {
            bannedUsers: arrayRemove(id)
        });
        alert("解除しました");
    } catch(e) { alert("エラー"); }
  };

  if (!isLoggedIn) {
    return (
      <div className="p-8 max-w-sm mx-auto min-h-screen flex flex-col justify-center">
        <h1 className="text-2xl font-bold mb-4 text-gray-800">店舗管理ログイン</h1>
        <p className="text-xs text-gray-400 mb-4">Your ID: {myUserId}</p>
        
        <input className="border p-3 w-full mb-3 rounded" placeholder="店舗ID (例: shop1)" value={shopId} onChange={(e) => setShopId(e.target.value)} />
        <input className="border p-3 w-full mb-6 rounded" type="password" placeholder="管理パスワード" value={password} onChange={(e) => setPassword(e.target.value)} />
        
        <button className="bg-blue-600 text-white font-bold py-3 w-full rounded shadow hover:bg-blue-500 transition" onClick={handleLogin}>
            ログイン
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-md mx-auto min-h-screen bg-gray-50 pb-20">
      <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold text-gray-800">{shopData?.name} 管理</h1>
          <button onClick={() => setIsLoggedIn(false)} className="text-xs text-gray-500 underline">ログアウト</button>
      </div>
      
      {/* 受付停止ボタン */}
      <div className="mb-6 p-4 bg-white rounded shadow text-center">
         <p className="mb-2 text-sm text-gray-500">混雑時などに一時的に予約を止められます</p>
         <button onClick={togglePause} className={`w-full py-3 font-bold rounded text-white shadow transition ${shopData?.isPaused ? "bg-red-500 hover:bg-red-400" : "bg-blue-500 hover:bg-blue-400"}`}>
             {shopData?.isPaused ? "⛔ 現在停止中 (再開する)" : "✅ 現在受付中 (停止する)"}
         </button>
      </div>
      
      {/* 予約状況概要 */}
      <div className="bg-white p-4 rounded shadow mb-6">
        <h2 className="font-bold border-b pb-2 mb-2 text-gray-700">現在の予約状況</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
             <div>予約総数: <span className="font-bold">{shopData?.reservations?.length || 0}</span>件</div>
             {/* 簡易表示のみ。詳細はHack画面へ誘導 */}
        </div>
        <p className="text-xs text-gray-400 mt-2">※詳細な予約操作や強制削除は本部へ依頼してください</p>
      </div>

      {/* 迷惑客BAN管理 (Requirement 3) */}
      <div className="bg-white p-4 rounded shadow border-t-4 border-red-500">
          <h2 className="font-bold text-red-600 mb-1">迷惑ユーザー対策</h2>
          <p className="text-xs text-gray-500 mb-3">指定したIDはこの出し物を予約できなくなります。(予約BAN)</p>
          
          <div className="flex gap-2 mb-4">
              <input 
                 className="border p-2 flex-1 rounded text-sm bg-gray-50" 
                 placeholder="ユーザーIDを入力" 
                 value={banInput}
                 onChange={e => setBanInput(e.target.value)}
              />
              <button onClick={handleAddBan} className="bg-red-600 hover:bg-red-500 text-white px-4 rounded text-sm font-bold">禁止</button>
          </div>
          
          {shopData?.bannedUsers?.length > 0 && (
              <div className="bg-red-50 p-2 rounded border border-red-100">
                  <p className="text-xs font-bold text-red-800 mb-1">⛔ 予約禁止リスト:</p>
                  <ul>
                      {shopData.bannedUsers.map((uid:string) => (
                          <li key={uid} className="flex justify-between items-center text-sm border-b border-red-200 py-1 last:border-0">
                              <span className="font-mono text-gray-700">{uid}</span>
                              <button onClick={() => handleRemoveBan(uid)} className="text-blue-500 text-xs hover:underline">解除</button>
                          </li>
                      ))}
                  </ul>
              </div>
          )}
      </div>

      {/* スタッフ権限情報（確認用） */}
      <div className="mt-6 text-xs text-gray-400 text-center">
          <p>Logged in as: {myUserId}</p>
          {shopData?.adminAllowedUsers?.includes(myUserId) && <span className="text-green-500 font-bold">★ Authorized Staff</span>}
      </div>
    </div>
  );
}
