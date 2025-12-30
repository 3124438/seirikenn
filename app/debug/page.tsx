"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../../firebase"; 
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function AdminPage() {
  const [attractions, setAttractions] = useState<any[]>([]);
  
  // 編集モード管理
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState("");

  // 入力フォーム
  const [manualId, setManualId] = useState("");
  const [newName, setNewName] = useState("");
  const [password, setPassword] = useState("");
  const [groupLimit, setGroupLimit] = useState(4); // 1組あたりの人数
  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("15:00");
  const [duration, setDuration] = useState(20);
  const [capacity, setCapacity] = useState(3);
  const [isPaused, setIsPaused] = useState(false); // 一時停止フラグ

  // ユーザー検索・操作用
  const [searchUserId, setSearchUserId] = useState("");
  const [userResults, setUserResults] = useState<any[]>([]);

  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));
    const unsub = onSnapshot(collection(db, "attractions"), (snapshot) => {
      setAttractions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // フォームに入力するヘルパー
  const startEdit = (shop: any) => {
    setIsEditing(true);
    setEditingId(shop.id);
    setManualId(shop.id);
    setNewName(shop.name);
    setPassword(shop.password);
    setGroupLimit(shop.groupLimit || 4);
    setOpenTime(shop.openTime);
    setCloseTime(shop.closeTime);
    setDuration(shop.duration);
    setCapacity(shop.capacity);
    setIsPaused(shop.isPaused || false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditingId("");
    setManualId("");
    setNewName("");
    setPassword("");
    setGroupLimit(4);
    setOpenTime("10:00");
    setCloseTime("15:00");
    setDuration(20);
    setCapacity(3);
    setIsPaused(false);
  };

  const handleSave = async () => {
    if (!manualId || !newName || !password) return alert("ID、名前、パスワードを入力してください");
    if (password.length !== 5) return alert("パスワードは5桁にしてください");

    // 時間設定が変わった場合、予約枠をリセットするかの確認
    let slots = {};
    let shouldResetSlots = true;

    if (isEditing) {
        const currentShop = attractions.find(s => s.id === editingId);
        // 時間設定が変わっていないなら、既存の予約数(slots)を引き継ぐ
        if (currentShop && currentShop.openTime === openTime && currentShop.closeTime === closeTime && currentShop.duration === duration) {
            slots = currentShop.slots;
            shouldResetSlots = false;
        } else {
            if(!confirm("時間を変更すると、現在の予約枠と予約数がすべてリセットされます。よろしいですか？")) return;
        }
    }

    if (shouldResetSlots) {
        let current = new Date(`2000/01/01 ${openTime}`);
        const end = new Date(`2000/01/01 ${closeTime}`);
        slots = {};
        while (current < end) {
            const timeStr = current.toTimeString().substring(0, 5);
            slots = { ...slots, [timeStr]: 0 };
            current.setMinutes(current.getMinutes() + duration);
        }
    }

    const data: any = {
      name: newName,
      password,
      groupLimit,
      openTime, closeTime, duration, capacity,
      isPaused,
      slots
    };

    // 新規作成時は空の予約リストを作る
    if (!isEditing) {
        data.reservations = [];
    }

    // merge: true にすることで、既存の reservations 配列などを消さずに更新できる（時間変更リセット時を除く）
    await setDoc(doc(db, "attractions", manualId), data, { merge: true });

    resetForm();
    alert(isEditing ? "更新しました！" : "作成しました！");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("本当に削除しますか？ データは元に戻せません。")) return;
    await deleteDoc(doc(db, "attractions", id));
  };

  // ユーザーID検索機能
  const handleSearch = () => {
    if (!searchUserId) return;
    const results: any[] = [];
    attractions.forEach(shop => {
        if (shop.reservations) {
            shop.reservations.forEach((r: any) => {
                if (r.userId === searchUserId.toUpperCase()) {
                    results.push({ ...r, shopId: shop.id, shopName: shop.name, currentSlots: shop.slots });
                }
            });
        }
    });
    setUserResults(results);
  };

  // 管理者による強制キャンセル
  const handleAdminCancel = async (res: any) => {
    if(!confirm("この予約を強制キャンセルしますか？")) return;
    const shop = attractions.find(s => s.id === res.shopId);
    if(!shop) return;
    
    // 配列から削除し、カウントを減らす
    const updatedRes = shop.reservations.filter((r: any) => r.timestamp !== res.timestamp);
    const updatedSlots = { ...shop.slots, [res.time]: Math.max(0, shop.slots[res.time] - 1) };

    await updateDoc(doc(db, "attractions", res.shopId), {
        reservations: updatedRes,
        slots: updatedSlots
    });
    alert("キャンセルしました");
    handleSearch(); // リスト更新
  };

  // 管理者による強制入場処理
  const handleAdminEnter = async (res: any) => {
    if(!confirm("この予約を入場済みにしますか？")) return;
    const shop = attractions.find(s => s.id === res.shopId);
    if(!shop) return;

    // ステータスを更新して保存
    const otherRes = shop.reservations.filter((r: any) => r.timestamp !== res.timestamp);
    const targetRes = { ...res, status: "used" }; // status以外はそのまま

    await updateDoc(doc(db, "attractions", res.shopId), {
        reservations: [...otherRes, targetRes]
    });
    alert("入場処理しました");
    handleSearch();
  };

  return (
    <div className="max-w-5xl mx-auto p-6 bg-gray-900 min-h-screen text-white pb-32">
      <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
        <h1 className="text-2xl font-bold text-yellow-400">管理者ダッシュボード</h1>
        <button onClick={resetForm} className="bg-gray-700 px-4 py-2 rounded hover:bg-gray-600">入力リセット</button>
      </div>
      
      {/* 1. 会場設定フォーム */}
      <div className={`p-6 rounded-xl border mb-8 transition ${isEditing ? 'bg-blue-900/30 border-blue-500' : 'bg-gray-800 border-gray-700'}`}>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            {isEditing ? `✏️ 編集モード: ${editingId}` : "➕ 新規会場を追加"}
        </h2>
        
        <div className="grid gap-4 md:grid-cols-3 mb-4">
          <div className="flex flex-col">
              <label className="text-xs text-gray-400 mb-1">会場ID</label>
              <input disabled={isEditing} className="bg-gray-700 p-2 rounded text-white disabled:opacity-50" placeholder="例: 3B" maxLength={3} value={manualId} onChange={e => setManualId(e.target.value)} />
          </div>
          <div className="flex flex-col">
              <label className="text-xs text-gray-400 mb-1">会場名</label>
              <input className="bg-gray-700 p-2 rounded text-white" placeholder="例: お化け屋敷" value={newName} onChange={e => setNewName(e.target.value)} />
          </div>
          <div className="flex flex-col">
              <label className="text-xs text-gray-400 mb-1">パスワード(5桁)</label>
              <input className="bg-gray-700 p-2 rounded text-white" placeholder="例: 12345" maxLength={5} value={password} onChange={e => setPassword(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
          <div className="col-span-1">
              <label className="text-xs text-gray-400">開始</label>
              <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} className="w-full bg-gray-700 p-2 rounded"/>
          </div>
          <div className="col-span-1">
              <label className="text-xs text-gray-400">終了</label>
              <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} className="w-full bg-gray-700 p-2 rounded"/>
          </div>
          <div className="col-span-1">
              <label className="text-xs text-gray-400">間隔(分)</label>
              <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full bg-gray-700 p-2 rounded" placeholder="分"/>
          </div>
          <div className="col-span-1">
              <label className="text-xs text-gray-400">定員(組)</label>
              <input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} className="w-full bg-gray-700 p-2 rounded" placeholder="定員"/>
          </div>
           <div className="col-span-2">
              <label className="text-xs text-gray-400">1組の上限人数(表示用)</label>
              <input type="number" value={groupLimit} onChange={e => setGroupLimit(Number(e.target.value))} className="w-full bg-gray-700 p-2 rounded" placeholder="例: 4"/>
          </div>
        </div>
        
        <div className="flex items-center gap-3 mb-4 bg-gray-900/50 p-3 rounded">
            <input type="checkbox" id="pauseSwitch" checked={isPaused} onChange={e => setIsPaused(e.target.checked)} className="w-5 h-5" />
            <label htmlFor="pauseSwitch" className={`font-bold ${isPaused ? "text-red-400" : "text-gray-400"}`}>
                受付を一時停止する {isPaused && "(ユーザーには停止中と表示されます)"}
            </label>
        </div>

        <button onClick={handleSave} className={`w-full font-bold py-3 rounded-lg transition ${isEditing ? "bg-green-600 hover:bg-green-500" : "bg-blue-600 hover:bg-blue-500"}`}>
            {isEditing ? "更新を保存" : "作成する"}
        </button>
      </div>

      {/* 2. ユーザー検索・操作エリア */}
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-12">
        <h2 className="text-lg font-bold mb-4 text-pink-400">🔍 ユーザーID検索 & 操作</h2>
        <div className="flex gap-2 mb-4">
            <input className="flex-1 bg-gray-700 p-2 rounded text-white" placeholder="User ID (例: X8A9B2)" value={searchUserId} onChange={e => setSearchUserId(e.target.value)} />
            <button onClick={handleSearch} className="bg-pink-600 px-6 rounded font-bold hover:bg-pink-500">検索</button>
        </div>
        {userResults.length > 0 && (
            <div className="space-y-2">
                {userResults.map((res: any, idx) => (
                    <div key={idx} className="bg-gray-700 p-3 rounded flex justify-between items-center border border-gray-600">
                        <div>
                            <div className="font-bold text-lg">{res.shopName} <span className="text-blue-300">{res.time}</span></div>
                            <div className="text-xs text-gray-400">Status: {res.status === "used" ? "入場済" : "予約中"}</div>
                        </div>
                        <div className="flex gap-2">
                            {res.status !== "used" && (
                                <>
                                <button onClick={() => handleAdminEnter(res)} className="bg-blue-600 px-3 py-1 rounded text-sm hover:bg-blue-500">入場処理</button>
                                <button onClick={() => handleAdminCancel(res)} className="bg-red-600 px-3 py-1 rounded text-sm hover:bg-red-500">強制取消</button>
                                </>
                            )}
                            {res.status === "used" && <span className="text-green-400 font-bold px-2">入場完了</span>}
                        </div>
                    </div>
                ))}
            </div>
        )}
        {searchUserId && userResults.length === 0 && <p className="text-gray-500 text-sm">予約が見つかりません</p>}
      </div>

      {/* 3. 会場リスト */}
      <h2 className="text-xl font-bold mb-4">登録済み会場リスト</h2>
      <div className="space-y-6">
        {attractions.map((shop) => (
          <div key={shop.id} className={`bg-gray-800 p-5 rounded-xl border relative ${shop.isPaused ? 'border-red-500/50' : 'border-gray-700'}`}>
            {shop.isPaused && <div className="absolute top-0 right-0 bg-red-600 text-xs px-2 py-1 rounded-bl text-white font-bold">停止中</div>}
            
            <div className="flex justify-between items-start mb-4 border-b border-gray-600 pb-2">
              <div>
                <h3 className="font-bold text-xl flex items-center">
                    <span className="text-yellow-400 mr-2 font-mono">{shop.id}</span>
                    {shop.name}
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                    Pass: {shop.password} / {shop.groupLimit}名まで
                </p>
              </div>
              <div className="flex gap-2">
                  <button onClick={() => startEdit(shop)} className="text-green-400 bg-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-600">編集</button>
                  <button onClick={() => handleDelete(shop.id)} className="text-red-400 bg-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-600">削除</button>
              </div>
            </div>
            
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {Object.entries(shop.slots || {}).sort().map(([time, count]: any) => (
                <div key={time} className={`p-1 rounded text-center border ${count >= shop.capacity ? 'bg-red-900/30 border-red-500/50 text-red-200' : 'bg-gray-700 border-gray-600'}`}>
                  <div className="text-[10px] text-gray-400">{time}</div>
                  <div className="font-bold text-sm">{count}/{shop.capacity}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
