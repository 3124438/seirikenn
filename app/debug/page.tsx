"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../../firebase"; 
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function AdminPage() {
  const [attractions, setAttractions] = useState<any[]>([]);
  
  // 入力用データ
  const [manualId, setManualId] = useState("");
  const [newName, setNewName] = useState("");
  const [password, setPassword] = useState(""); // 新機能: パスワード
  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("15:00");
  const [duration, setDuration] = useState(20);
  const [capacity, setCapacity] = useState(3);

  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));
    const unsub = onSnapshot(collection(db, "attractions"), (snapshot) => {
      setAttractions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const handleAdd = async () => {
    if (!manualId || !newName || !password) return alert("ID、名前、パスワードを入力してください");
    if (password.length !== 5) return alert("パスワードは5桁にしてください");

    const slots: any = {};
    let current = new Date(`2000/01/01 ${openTime}`);
    const end = new Date(`2000/01/01 ${closeTime}`);

    while (current < end) {
      const timeStr = current.toTimeString().substring(0, 5);
      slots[timeStr] = 0; 
      current.setMinutes(current.getMinutes() + duration);
    }

    await setDoc(doc(db, "attractions", manualId), {
      name: newName,
      password: password, // パスワードを保存
      openTime, closeTime, duration, capacity, slots 
    });

    setManualId(""); setNewName(""); setPassword("");
    alert("作成しました！");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("本当に削除しますか？")) return;
    await deleteDoc(doc(db, "attractions", id));
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-900 min-h-screen text-white">
      <h1 className="text-2xl font-bold mb-8 text-yellow-400">管理者: 会場設定</h1>
      
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8">
        <h2 className="text-lg font-bold mb-4">新規会場を追加</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <input className="bg-gray-700 p-2 rounded text-white" placeholder="ID (例: 3B)" maxLength={3} value={manualId} onChange={e => setManualId(e.target.value)} />
          <input className="bg-gray-700 p-2 rounded text-white" placeholder="名前 (例: カフェ)" value={newName} onChange={e => setNewName(e.target.value)} />
          {/* ↓↓ パスワード入力欄を追加 ↓↓ */}
          <input className="bg-gray-700 p-2 rounded text-white" placeholder="パスワード(5桁)" maxLength={5} value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="grid grid-cols-4 gap-2 mt-4">
          <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} className="bg-gray-700 p-2 rounded"/>
          <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} className="bg-gray-700 p-2 rounded"/>
          <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} className="bg-gray-700 p-2 rounded" placeholder="分"/>
          <input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} className="bg-gray-700 p-2 rounded" placeholder="定員"/>
        </div>
        <button onClick={handleAdd} className="w-full bg-blue-600 hover:bg-blue-500 font-bold py-3 rounded-lg mt-4">作成</button>
      </div>

      <div className="space-y-6">
        {attractions.map((shop) => (
          <div key={shop.id} className="bg-gray-800 p-5 rounded-xl border border-gray-700">
            <div className="flex justify-between items-center mb-4 border-b border-gray-600 pb-2">
              <div>
                <h3 className="font-bold text-xl"><span className="text-yellow-400 mr-2">{shop.id}</span>{shop.name}</h3>
                <p className="text-xs text-gray-400">Pass: {shop.password}</p>
              </div>
              <button onClick={() => handleDelete(shop.id)} className="text-red-400 text-sm">削除</button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {Object.entries(shop.slots || {}).sort().map(([time, count]: any) => (
                <div key={time} className={`p-2 rounded text-center border ${count >= shop.capacity ? 'bg-red-900/50 border-red-500 text-red-200' : 'bg-gray-700 border-gray-600'}`}>
                  <div className="text-xs text-gray-400">{time}</div>
                  <div className="font-bold">{count}/{shop.capacity}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
