"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../../firebase"; 
import { doc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function AdminPage() {
  const [shopId, setShopId] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [shopData, setShopData] = useState<any>(null);
  
  // 自分のID（権限チェック用）
  const [myUserId, setMyUserId] = useState("");

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    const stored = localStorage.getItem("bunkasai_user_id");
    if (stored) setMyUserId(stored);
  }, []);

  const handleLogin = async () => {
    try {
      if (!shopId) return alert("店舗IDを入力してください");
      
      const docRef = doc(db, "attractions", shopId);
      const snap = await getDoc(docRef);
      
      if (!snap.exists()) {
        alert("店舗IDが見つかりません");
        return;
      }

      const data = snap.data();

      // 1. 【絶対拒否】編集権限剥奪リストに入っているか？
      if (data.adminBannedUsers && data.adminBannedUsers.includes(myUserId)) {
        alert("あなたのIDからのアクセスは管理者により禁止されています。(Access Denied)");
        return;
      }

      // 2. 【制限モード確認】ホワイトリスト必須モードか？
      if (data.isAdminRestricted) {
        if (!data.adminAllowedUsers || !data.adminAllowedUsers.includes(myUserId)) {
          alert("🔒 現在、この管理画面は「指名スタッフ限定モード」です。\nあなたのIDは許可リストに登録されていません。");
          return;
        }
      }

      // 3. 【パスワード認証】
      if (data.password === password) {
        setIsLoggedIn(true);
      } else {
        alert("パスワードが違います");
      }

    } catch (e) {
      alert("ログインエラー");
      console.error(e);
    }
  };

  useEffect(() => {
    if (!isLoggedIn || !shopId) return;
    const unsub = onSnapshot(doc(db, "attractions", shopId), (doc) => {
      const data = doc.data();
      setShopData(data);

      // ログイン中に権限が変わった場合の強制ログアウト処理
      if (data) {
          // BANされた
          if (data.adminBannedUsers?.includes(myUserId)) {
              alert("権限が剥奪されました。");
              setIsLoggedIn(false);
          }
          // 制限モードがONになり、かつ自分が許可リストにいない
          if (data.isAdminRestricted && (!data.adminAllowedUsers || !data.adminAllowedUsers.includes(myUserId))) {
              alert("管理者により「指名スタッフ限定モード」に切り替えられました。\n権限がないためログアウトします。");
              setIsLoggedIn(false);
          }
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

  if (!isLoggedIn) {
    return (
      <div className="p-8 max-w-sm mx-auto min-h-screen flex flex-col justify-center">
        <h1 className="text-2xl font-bold mb-4 text-gray-800">店舗管理ログイン</h1>
        <p className="text-xs text-gray-400 mb-4">Your ID: {myUserId}</p>
        
        <div className="space-y-4">
            <input className="border p-3 w-full rounded" placeholder="店舗ID" value={shopId} onChange={(e) => setShopId(e.target.value)} />
            <input className="border p-3 w-full rounded" type="password" placeholder="パスワード" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="bg-blue-600 text-white font-bold py-3 w-full rounded shadow hover:bg-blue-500 transition" onClick={handleLogin}>
                ログイン
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-md mx-auto min-h-screen bg-gray-50 pb-20">
      <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold text-gray-800">{shopData?.name} 管理</h1>
          <button onClick={() => setIsLoggedIn(false)} className="text-xs text-gray-500 underline">ログアウト</button>
      </div>
      
      {/* ステータス表示 */}
      {shopData?.isAdminRestricted && (
          <div className="bg-purple-100 text-purple-800 px-3 py-2 rounded text-xs font-bold mb-4 border border-purple-200 text-center">
              🔒 指名スタッフ限定モードで稼働中
          </div>
      )}

      {/* 受付停止ボタン */}
      <div className="mb-6 p-4 bg-white rounded shadow text-center">
         <p className="mb-2 text-sm text-gray-500">混雑時などに一時的に予約を止められます</p>
         <button onClick={togglePause} className={`w-full py-3 font-bold rounded text-white shadow transition ${shopData?.isPaused ? "bg-red-500" : "bg-blue-500"}`}>
             {shopData?.isPaused ? "⛔ 現在停止中 (再開する)" : "✅ 現在受付中 (停止する)"}
         </button>
      </div>
      
      {/* 予約状況概要 */}
      <div className="bg-white p-4 rounded shadow mb-6">
        <h2 className="font-bold border-b pb-2 mb-2 text-gray-700">現在の予約状況</h2>
        <div className="text-sm">予約総数: <span className="font-bold">{shopData?.reservations?.length || 0}</span>件</div>
        <p className="text-xs text-gray-400 mt-2">※生徒による予約の削除やBAN操作はできません。本部に連絡してください。</p>
      </div>

    </div>
  );
}
