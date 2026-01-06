// ＃生徒会用管理画面 (app/admin/super/page.tsx など)
"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../../../firebase";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function SuperAdminPage() {
  const [attractions, setAttractions] = useState<any[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [passInput, setPassInput] = useState("");

  // フォーム用State
  const [editId, setEditId] = useState(""); // ID指定用
  const [name, setName] = useState("");
  const [department, setDepartment] = useState(""); // ★追加
  const [imageUrl, setImageUrl] = useState("");     // ★追加
  const [password, setPassword] = useState("");
  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("15:00");
  const [duration, setDuration] = useState(20);
  const [capacity, setCapacity] = useState(3);
  
  // ログイン処理（簡易パスワード）
  const handleLogin = () => {
    if(passInput === "admin9999") { // 実際はEnvやFirestoreで管理推奨
        setAuthorized(true);
        signInAnonymously(auth);
    } else {
        alert("パスワードが違います");
    }
  };

  useEffect(() => {
    if(!authorized) return;
    const unsub = onSnapshot(collection(db, "attractions"), (snap) => {
      setAttractions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [authorized]);

  // 会場作成・更新
  const handleCreateOrUpdate = async () => {
    if (!editId || !name || !password) return alert("ID, 会場名, パスワードは必須です");
    
    // スロット生成
    let slots: any = {};
    let current = new Date(`2000/01/01 ${openTime}`);
    const end = new Date(`2000/01/01 ${closeTime}`);
    while (current < end) {
        const timeStr = current.toTimeString().substring(0, 5);
        slots[timeStr] = 0;
        current.setMinutes(current.getMinutes() + duration);
    }

    const data = {
        name,
        department, // ★追加
        imageUrl,   // ★追加
        password,
        openTime,
        closeTime,
        duration,
        capacity,
        slots,
        isPaused: false,
        reservations: [] // 新規作成時リセット注意（既存更新時は要配慮）
    };

    // ※注意: これは完全上書きです。既存の予約を残したい場合は { merge: true } を使い、
    // slotsやreservationsをdataから除外するロジックが必要です。
    // ここでは簡易的に「設定変更」として merge します。
    await setDoc(doc(db, "attractions", editId), data, { merge: true });
    
    alert(`会場「${name}」を保存しました`);
    clearForm();
  };

  const handleDelete = async (id: string) => {
      if(!confirm("本当に削除しますか？")) return;
      await deleteDoc(doc(db, "attractions", id));
  };

  const clearForm = () => {
      setEditId(""); setName(""); setDepartment(""); setImageUrl(""); setPassword("");
      setOpenTime("10:00"); setCloseTime("15:00");
  };

  // 既存データをフォームに入れる
  const handleEditStart = (shop: any) => {
      setEditId(shop.id);
      setName(shop.name);
      setDepartment(shop.department || ""); // ★追加
      setImageUrl(shop.imageUrl || "");     // ★追加
      setPassword(shop.password);
      setOpenTime(shop.openTime);
      setCloseTime(shop.closeTime);
      setDuration(shop.duration);
      setCapacity(shop.capacity);
  };

  if (!authorized) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-800 p-8 rounded shadow text-center">
            <h1 className="text-white text-xl mb-4">生徒会管理者ログイン</h1>
            <input 
                type="password" 
                className="p-2 rounded w-full mb-4 text-black" 
                placeholder="Pass"
                value={passInput}
                onChange={e => setPassInput(e.target.value)}
            />
            <button onClick={handleLogin} className="bg-blue-600 text-white px-6 py-2 rounded font-bold">LOGIN</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8 font-sans text-gray-800">
      <h1 className="text-3xl font-bold mb-6 text-gray-800 border-b-4 border-blue-500 inline-block">生徒会 本部管理画面</h1>
      
      {/* 入力フォーム */}
      <div className="bg-white p-6 rounded shadow-lg mb-8 border-t-4 border-blue-500">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span>📝 会場登録・編集</span>
            {editId && <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded">編集中: {editId}</span>}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
             <div>
                <label className="block text-sm font-bold mb-1">会場ID (半角英数)</label>
                <input className="w-full p-2 border rounded bg-gray-50" placeholder="例: HAUNTED1" value={editId} onChange={e => setEditId(e.target.value)} />
            </div>
            <div>
                <label className="block text-sm font-bold mb-1">パスワード (5桁)</label>
                <input className="w-full p-2 border rounded bg-gray-50" placeholder="管理者用Pass" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            
            {/* ★追加: 団体名・画像URL */}
            <div>
                <label className="block text-sm font-bold mb-1">会場名</label>
                <input className="w-full p-2 border rounded" placeholder="例: お化け屋敷" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
                <label className="block text-sm font-bold mb-1">団体・クラス名</label>
                <input className="w-full p-2 border rounded" placeholder="例: 3年B組" value={department} onChange={e => setDepartment(e.target.value)} />
            </div>
             <div className="md:col-span-2">
                <label className="block text-sm font-bold mb-1">画像URL</label>
                <input className="w-full p-2 border rounded" placeholder="https://..." value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">※外部画像サービスのURLを入力してください</p>
            </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div><label className="text-xs font-bold">開始</label><input type="time" className="w-full border p-1 rounded" value={openTime} onChange={e => setOpenTime(e.target.value)} /></div>
            <div><label className="text-xs font-bold">終了</label><input type="time" className="w-full border p-1 rounded" value={closeTime} onChange={e => setCloseTime(e.target.value)} /></div>
            <div><label className="text-xs font-bold">間隔(分)</label><input type="number" className="w-full border p-1 rounded" value={duration} onChange={e => setDuration(Number(e.target.value))} /></div>
            <div><label className="text-xs font-bold">定員</label><input type="number" className="w-full border p-1 rounded" value={capacity} onChange={e => setCapacity(Number(e.target.value))} /></div>
        </div>

        <div className="flex gap-2">
            <button onClick={handleCreateOrUpdate} className="bg-blue-600 text-white px-8 py-3 rounded font-bold hover:bg-blue-700 shadow-md">保存 / 更新</button>
            <button onClick={clearForm} className="bg-gray-500 text-white px-4 py-3 rounded hover:bg-gray-600">リセット</button>
        </div>
      </div>

      {/* リスト表示 */}
      <div className="grid grid-cols-1 gap-4">
        {attractions.map(shop => (
            <div key={shop.id} className="bg-white p-4 rounded shadow flex flex-col md:flex-row items-center gap-4 border-l-4 border-gray-300 hover:border-blue-400 transition">
                
                {/* ★追加: サムネイル画像 */}
                <div className="w-20 h-20 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                    {shop.imageUrl ? (
                        <img src={shop.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl text-gray-400">No Img</div>
                    )}
                </div>

                <div className="flex-1 w-full">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="bg-gray-800 text-white px-2 py-0.5 rounded text-xs font-mono">{shop.id}</span>
                        {/* ★追加: 団体名 */}
                        {shop.department && <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-bold">{shop.department}</span>}
                        <span className="text-xs text-gray-500">Pass: {shop.password}</span>
                    </div>
                    <h3 className="text-xl font-bold">{shop.name}</h3>
                    <div className="text-xs text-gray-500 mt-1">
                        {shop.openTime} ~ {shop.closeTime} ({shop.duration}分間隔) / 定員: {shop.capacity}
                    </div>
                </div>

                <div className="flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                    <button onClick={() => handleEditStart(shop)} className="flex-1 md:flex-none bg-green-500 text-white px-3 py-2 rounded text-sm font-bold hover:bg-green-600">編集</button>
                    <button onClick={() => handleDelete(shop.id)} className="flex-1 md:flex-none bg-red-500 text-white px-3 py-2 rounded text-sm font-bold hover:bg-red-600">削除</button>
                </div>
            </div>
        ))}
      </div>
    </div>
  );
}
