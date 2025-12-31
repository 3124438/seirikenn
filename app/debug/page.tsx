"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../../firebase"; 
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function AdminPage() {
  const [attractions, setAttractions] = useState<any[]>([]);
  
  // 自分のID（権限チェック・表示用）
  const [myUserId, setMyUserId] = useState("");

  // 表示モード管理
  const [expandedShopId, setExpandedShopId] = useState<string | null>(null); // 現在開いている会場ID
  const [isEditing, setIsEditing] = useState(false); // 編集モードか

  // 編集用フォームステート
  const [manualId, setManualId] = useState("");
  const [newName, setNewName] = useState("");
  const [password, setPassword] = useState("");
  const [groupLimit, setGroupLimit] = useState(4);
  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("15:00");
  const [duration, setDuration] = useState(20);
  const [capacity, setCapacity] = useState(3);
  const [isPaused, setIsPaused] = useState(false);

  // 検索用
  const [searchUserId, setSearchUserId] = useState("");

  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));
    
    // 自分のIDを取得
    const stored = localStorage.getItem("bunkasai_user_id");
    if (stored) setMyUserId(stored);

    const unsub = onSnapshot(collection(db, "attractions"), (snapshot) => {
      setAttractions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // --- 権限チェック付き: 会場展開 ---
  const handleExpandShop = (shopId: string) => {
      const shop = attractions.find(s => s.id === shopId);
      if (!shop) return;

      // 1. パスワード認証 (入室前に必ず確認)
      const inputPass = prompt(`「${shop.name}」の管理用パスワードを入力してください`);
      if (inputPass !== shop.password) {
          alert("パスワードが違います");
          return;
      }

      // 2. 編集権限剥奪チェック
      if (shop.adminBannedUsers && shop.adminBannedUsers.includes(myUserId)) {
          alert(`⛔ 権限エラー\nあなたのID (${myUserId}) は、この会場 (${shop.name}) の管理権限を剥奪されています。`);
          return;
      }

      // 3. 制限モード（指名限定）チェック
      if (shop.isAdminRestricted) {
          if (!shop.adminAllowedUsers || !shop.adminAllowedUsers.includes(myUserId)) {
              alert(`🔒 アクセス制限\nこの会場は「指名スタッフ限定モード」です。\nあなたのIDは許可リストに入っていません。`);
              return;
          }
      }

      setExpandedShopId(shopId);
  };

  // --- 編集関連 ---
  const resetForm = () => {
    setIsEditing(false);
    setManualId(""); setNewName(""); setPassword("");
    setGroupLimit(4); setOpenTime("10:00"); setCloseTime("15:00");
    setDuration(20); setCapacity(3); setIsPaused(false);
  };

  const startEdit = (shop: any) => {
    // 念のためここでも権限チェック
    if (shop.adminBannedUsers?.includes(myUserId)) return alert("権限がありません");

    setIsEditing(true);
    setManualId(shop.id); setNewName(shop.name); setPassword(shop.password);
    setGroupLimit(shop.groupLimit || 4); setOpenTime(shop.openTime);
    setCloseTime(shop.closeTime); setDuration(shop.duration);
    setCapacity(shop.capacity); setIsPaused(shop.isPaused || false);
    // フォームまでスクロール
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async () => {
    // ★変更点: 新規作成（編集モードでない）なら弾く
    if (!isEditing) return alert("新規会場の作成は無効化されています。");

    if (!manualId || !newName || !password) return alert("必須項目を入力してください");
    if (password.length !== 5) return alert("パスワードは5桁です");

    let slots = {};
    let shouldResetSlots = true;

    // 編集モードで時間が変わっていない場合は予約枠を維持
    const currentShop = attractions.find(s => s.id === manualId);
    if (currentShop && currentShop.openTime === openTime && currentShop.closeTime === closeTime && currentShop.duration === duration) {
        slots = currentShop.slots;
        shouldResetSlots = false;
    } else {
        if(!confirm("時間を変更すると、現在の予約枠がリセットされます。よろしいですか？")) return;
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
      name: newName, password, groupLimit,
      openTime, closeTime, duration, capacity, isPaused, slots
    };

    // setDoc merge:true なので既存データを維持しつつ更新
    await setDoc(doc(db, "attractions", manualId), data, { merge: true });
    
    alert("更新しました");
    setExpandedShopId(manualId); // 編集後はその詳細を表示
    resetForm(); // フォームを閉じる
  };

  const handleDeleteVenue = async (id: string) => {
    if (!confirm("本当に会場を削除しますか？")) return;
    await deleteDoc(doc(db, "attractions", id));
    setExpandedShopId(null);
  };

  // --- 予約操作関連 (個別) ---

  // ステータス変更 (予約中 <-> 入場済)
  const toggleReservationStatus = async (shop: any, res: any, newStatus: "reserved" | "used") => {
     if(!confirm(newStatus === "used" ? "入場済みにしますか？" : "入場を取り消して予約状態に戻しますか？")) return;

     const otherRes = shop.reservations.filter((r: any) => r.timestamp !== res.timestamp);
     const updatedRes = { ...res, status: newStatus };

     await updateDoc(doc(db, "attractions", shop.id), {
         reservations: [...otherRes, updatedRes]
     });
  };

  // 予約キャンセル
  const cancelReservation = async (shop: any, res: any) => {
      if(!confirm(`User ID: ${res.userId}\nこの予約を削除しますか？`)) return;

      const otherRes = shop.reservations.filter((r: any) => r.timestamp !== res.timestamp);
      // カウントを戻す（入場済みだったとしても、枠を空けるなら戻す）
      const updatedSlots = { ...shop.slots, [res.time]: Math.max(0, shop.slots[res.time] - 1) };

      await updateDoc(doc(db, "attractions", shop.id), {
          reservations: otherRes,
          slots: updatedSlots
      });
  };

  // --- 表示用ヘルパー ---
  const targetShop = attractions.find(s => s.id === expandedShopId);

  // 時間ごとに予約者をグループ化する関数
  const getReservationsByTime = (shop: any) => {
      const grouped: any = {};
      // まず枠を作成
      Object.keys(shop.slots || {}).sort().forEach(time => {
          grouped[time] = [];
      });
      // 予約を入れる
      if(shop.reservations) {
          shop.reservations.forEach((res: any) => {
              if(grouped[res.time]) {
                  grouped[res.time].push(res);
              }
          });
      }
      return grouped;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      
      {/* ユーザーID表示バー (最上部) */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex justify-between items-center sticky top-0 z-50 shadow-md">
          <div className="text-xs text-gray-400">Logged in as:</div>
          <div className="font-mono font-bold text-yellow-400 text-lg tracking-wider">
              {myUserId || "---"}
          </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 pb-32">
        {/* ヘッダーエリア */}
        <div className="mb-6 border-b border-gray-700 pb-4">
            <h1 className="text-2xl font-bold text-white mb-4">全店舗統合管理</h1>
            
            {/* ★変更点: 編集時のみフォームを表示、新規作成機能は非表示にする */}
            {isEditing ? (
                <div className="bg-gray-800 rounded-lg p-4 border border-blue-500 mb-4 animate-fade-in shadow-lg shadow-blue-900/20">
                    <h3 className="text-sm font-bold mb-4 text-blue-300 flex items-center gap-2">
                        <span>⚙️ 設定編集モード:</span>
                        <span className="text-xl text-yellow-400 font-mono">{manualId}</span>
                        <span>{newName}</span>
                    </h3>
                    
                    <div className="grid gap-2 md:grid-cols-3 mb-2">
                        {/* ID入力 (編集時は無効化) */}
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-500">ID (変更不可)</label>
                            <input disabled className="bg-gray-700 p-2 rounded text-gray-400 cursor-not-allowed" value={manualId} />
                        </div>
                        
                        {/* 名前入力 */}
                         <div className="flex flex-col">
                            <label className="text-xs text-gray-500">会場名</label>
                            <input className="bg-gray-700 p-2 rounded text-white border border-gray-600 focus:border-blue-500 outline-none" placeholder="会場名" value={newName} onChange={e => setNewName(e.target.value)} />
                        </div>
                        
                        {/* パスワード入力 (変更不可) */}
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-500">パスワード (変更不可)</label>
                            <input 
                                disabled 
                                className="bg-gray-700 p-2 rounded text-gray-400 cursor-not-allowed" 
                                placeholder="変更不可" 
                                maxLength={5} 
                                value={password} 
                            />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2 mb-2">
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-500">開始</label>
                            <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} className="bg-gray-700 p-1 rounded text-sm"/>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-500">終了</label>
                            <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} className="bg-gray-700 p-1 rounded text-sm"/>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-500">間隔(分)</label>
                            <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} className="bg-gray-700 p-1 rounded text-sm" placeholder="分"/>
                        </div>
                        <div className="flex flex-col">
                             <label className="text-xs text-gray-500">定員(組)</label>
                            <input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} className="bg-gray-700 p-1 rounded text-sm" placeholder="定員"/>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 mb-6 p-2 bg-gray-900 rounded">
                        <label className="text-xs text-gray-400">1組の最大人数:</label>
                        <input type="number" value={groupLimit} onChange={e => setGroupLimit(Number(e.target.value))} className="w-16 bg-gray-700 p-1 rounded text-sm" />
                        
                        <div className="w-px h-4 bg-gray-600 mx-2"></div>

                        <label className="text-xs text-white flex items-center gap-2 cursor-pointer font-bold">
                            <input type="checkbox" checked={isPaused} onChange={e => setIsPaused(e.target.checked)} className="w-4 h-4" />
                            <span className={isPaused ? "text-red-500" : "text-gray-400"}>受付を緊急停止する</span>
                        </label>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-500 py-3 rounded font-bold transition shadow-lg shadow-blue-900/40">変更を保存</button>
                        <button onClick={resetForm} className="bg-gray-700 hover:bg-gray-600 px-6 rounded text-sm transition">キャンセル</button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 text-center">※IDとパスワードの変更にはデータベースの直接操作が必要です。</p>
                </div>
            ) : (
                <div className="bg-gray-800/50 rounded p-3 mb-4 border border-gray-700 text-center text-xs text-gray-500">
                    ※ 会場の新規作成機能は現在無効化されています。設定を変更するには、下のリストから会場を選び「設定編集」ボタンを押してください。
                </div>
            )}

            {/* ユーザーID検索 */}
            <div className="flex gap-2 items-center bg-gray-800 p-2 rounded border border-gray-600">
                <span className="text-xl">🔍</span>
                <input 
                    className="flex-1 bg-transparent text-white outline-none" 
                    placeholder="ユーザーIDを入力して検索 (例: X9A2...)" 
                    value={searchUserId} 
                    onChange={e => setSearchUserId(e.target.value)} 
                />
                {searchUserId && (
                    <div className="text-xs text-pink-400 font-bold animate-pulse">
                        ※下の一覧から該当ユーザーを探してください
                    </div>
                )}
            </div>
        </div>

        {/* --- メインエリア --- */}

        {/* 1. 一覧モード（詳細が開かれていない時） */}
        {!expandedShopId && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {attractions.map(shop => {
                    // 検索フィルター
                    const hasUser = searchUserId && shop.reservations?.some((r:any) => r.userId?.includes(searchUserId.toUpperCase()));
                    
                    return (
                        <button 
                            key={shop.id} 
                            onClick={() => handleExpandShop(shop.id)} // クリック時にパスワード＆権限チェック
                            className={`p-4 rounded-xl border text-left flex justify-between items-center transition hover:bg-gray-800
                                ${hasUser ? 'bg-pink-900/40 border-pink-500' : 'bg-gray-800 border-gray-600'}
                            `}
                        >
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-yellow-400 font-bold font-mono text-xl">{shop.id}</span>
                                </div>
                                <span className="font-bold text-lg">{shop.name}</span>
                                {shop.isPaused && <span className="ml-2 text-xs bg-red-600 px-2 py-0.5 rounded text-white">停止中</span>}
                            </div>
                            <div className="text-gray-400 text-2xl">
                                ›
                            </div>
                        </button>
                    );
                })}
            </div>
        )}

        {/* 2. 詳細モード（会場が選択された時） */}
        {expandedShopId && targetShop && (
            <div className="animate-fade-in">
                {/* 戻るヘッダー */}
                <button onClick={() => { setExpandedShopId(null); setIsEditing(false); }} className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white">
                    ← 会場一覧に戻る
                </button>

                <div className="bg-gray-800 rounded-xl border border-gray-600 overflow-hidden">
                    {/* タイトルバー */}
                    <div className="bg-gray-700 p-4 flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                <span className="text-yellow-400 font-mono">{targetShop.id}</span>
                                {targetShop.name}
                            </h2>
                            <p className="text-xs text-gray-400 mt-1">Pass: **** | 定員: {targetShop.capacity}組</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => startEdit(targetShop)} className="bg-blue-600 text-xs px-3 py-2 rounded hover:bg-blue-500 font-bold shadow-lg">⚙️ 設定編集</button>
                            <button onClick={() => handleDeleteVenue(targetShop.id)} className="bg-red-600 text-xs px-3 py-2 rounded hover:bg-red-500">会場削除</button>
                        </div>
                    </div>

                    {/* 予約リスト（時間ごと） */}
                    <div className="p-4 space-y-6">
                        {Object.entries(getReservationsByTime(targetShop)).map(([time, reservations]: any) => {
                            const slotCount = targetShop.slots[time] || 0;
                            const isFull = slotCount >= targetShop.capacity;

                            return (
                                <div key={time} className={`border rounded-lg p-3 ${isFull ? 'border-red-500/50 bg-red-900/10' : 'border-gray-600 bg-gray-900/50'}`}>
                                    {/* 時間ヘッダー */}
                                    <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                                        <h3 className="font-bold text-lg text-blue-300">{time}</h3>
                                        <span className={`text-sm font-bold ${isFull ? 'text-red-400' : 'text-green-400'}`}>
                                            予約: {slotCount} / {targetShop.capacity}
                                        </span>
                                    </div>

                                    {/* 予約者リスト */}
                                    <div className="space-y-2">
                                        {reservations.length === 0 && <p className="text-xs text-gray-500 text-center py-1">予約なし</p>}
                                        
                                        {reservations.map((res: any) => {
                                            const isMatch = searchUserId && res.userId?.includes(searchUserId.toUpperCase());
                                            
                                            return (
                                                <div key={res.timestamp} className={`flex justify-between items-center p-2 rounded ${res.status === 'used' ? 'bg-gray-800 opacity-60' : 'bg-gray-700'} ${isMatch ? 'ring-2 ring-pink-500' : ''}`}>
                                                    <div>
                                                        <div className="font-mono font-bold text-yellow-400">
                                                            ID: {res.userId}
                                                        </div>
                                                        <div className="text-xs text-gray-300">
                                                            {res.status === 'used' ? '✅ 入場済' : '🔵 予約中'}
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex gap-1">
                                                        {res.status !== 'used' ? (
                                                            <>
                                                                <button onClick={() => toggleReservationStatus(targetShop, res, "used")} className="bg-green-600 text-xs px-3 py-1.5 rounded font-bold hover:bg-green-500">入場</button>
                                                                <button onClick={() => cancelReservation(targetShop, res)} className="bg-red-600 text-xs px-3 py-1.5 rounded hover:bg-red-500">取消</button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button onClick={() => toggleReservationStatus(targetShop, res, "reserved")} className="bg-gray-500 text-xs px-2 py-1.5 rounded hover:bg-gray-400">入場取消</button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
