// ＃生徒会用管理画面 (app/admin/super/page.tsx)
"use client";
import { useState, useEffect, useMemo } from "react";
// 階層に合わせてパスを調整
import { db, auth } from "../../../firebase"; 
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

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

export default function SuperAdminPage() {
  const [attractions, setAttractions] = useState<any[]>([]);
  const [myUserId, setMyUserId] = useState("");

  // 表示モード管理
  const [expandedShopId, setExpandedShopId] = useState<string | null>(null); 
  const [isEditing, setIsEditing] = useState(false);
  const [originalId, setOriginalId] = useState<string | null>(null);

  // フォーム用ステート
  const [manualId, setManualId] = useState("");
  const [newName, setNewName] = useState("");
  const [password, setPassword] = useState("");
    
  const [department, setDepartment] = useState(""); // 団体名
  const [imageUrl, setImageUrl] = useState("");     // 画像URL
  const [description, setDescription] = useState(""); // 会場説明文

  const [groupLimit, setGroupLimit] = useState(4);
  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("15:00");
  const [duration, setDuration] = useState(20);
  const [capacity, setCapacity] = useState(3);
  const [isPaused, setIsPaused] = useState(false);
  const [releaseBeforeTime, setReleaseBeforeTime] = useState("00:00"); // ★追加: 解放制限時間

  // 運用モード（予約制 or 順番待ち制）
  const [isQueueMode, setIsQueueMode] = useState(false);

  // 検索用
  const [searchUserId, setSearchUserId] = useState("");

  // 現在時刻管理（解放判定の再計算用）
  const [now, setNow] = useState(new Date());

  // ★ゲスト追加用ステート
  const [guestTime, setGuestTime] = useState("");

  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));

    let stored = localStorage.getItem("bunkasai_user_id");
    if (!stored) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        stored = result;
        localStorage.setItem("bunkasai_user_id", stored);
    }
    setMyUserId(stored);

    const unsub = onSnapshot(collection(db, "attractions"), (snapshot) => {
      const newData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttractions(newData);
    });

    const timer = setInterval(() => setNow(new Date()), 60000); // 1分ごとに現在時刻を更新

    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  // 統計データ
  const stats = useMemo(() => {
      const totalVenues = attractions.length;
      const pausedVenues = attractions.filter(a => a.isPaused).length;
      const totalReservations = attractions.reduce((sum, shop) => {
        if (shop.isQueueMode && shop.queue) {
             return sum + shop.queue.filter((t: any) => ['waiting', 'ready'].includes(t.status)).length;
        }
        return sum + (shop.reservations?.length || 0);
      }, 0);

      return {
          totalVenues: String(totalVenues).padStart(3, '0'),
          pausedVenues: String(pausedVenues).padStart(3, '0'),
          totalReservations: String(totalReservations).padStart(7, '0'),
      };
  }, [attractions]);

  // 一斉操作
  const handleBulkPause = async (shouldPause: boolean) => {
      const actionName = shouldPause ? "一斉停止" : "一斉再開";
      if(!confirm(`全ての会場を「${actionName}」しますか？`)) return;
      try {
          const promises = attractions.map(shop => 
              updateDoc(doc(db, "attractions", shop.id), { isPaused: shouldPause })
          );
          await Promise.all(promises);
          alert(`${actionName}が完了しました。`);
      } catch(e) { console.error(e); alert("エラーが発生しました。"); }
  };

  const handleBulkDeleteReservations = async () => {
      if(!confirm("【危険】全会場の「予約データ」および「待機列」を全て削除します。\n本当によろしいですか？")) return;
      if(prompt("確認のため 'DELETE' と入力してください") !== "DELETE") return;
      try {
          const promises = attractions.map(shop => {
              const resetSlots: any = {};
              Object.keys(shop.slots || {}).forEach(key => { resetSlots[key] = 0; });
              return updateDoc(doc(db, "attractions", shop.id), { reservations: [], queue: [], slots: resetSlots });
          });
          await Promise.all(promises);
          alert("完了しました。");
      } catch(e) { console.error(e); alert("エラーが発生しました。"); }
  };

  const handleBulkDeleteVenues = async () => {
      if(!confirm("【超危険】全ての「会場データ」そのものを削除します。\n復元できません。本当によろしいですか？")) return;
      if(prompt("本気で削除する場合は 'DESTROY' と入力してください") !== "DESTROY") return;
      try {
          const promises = attractions.map(shop => deleteDoc(doc(db, "attractions", shop.id)));
          await Promise.all(promises);
          setExpandedShopId(null);
          alert("完了しました。");
      } catch(e) { console.error(e); alert("エラーが発生しました。"); }
  };

  // 編集・作成関連
  const resetForm = () => {
    setIsEditing(false);
    setOriginalId(null);
    setManualId(""); setNewName(""); setPassword("");
    setDepartment(""); setImageUrl(""); setDescription("");
    setGroupLimit(4); setOpenTime("10:00"); setCloseTime("15:00");
    setDuration(20); setCapacity(3); setIsPaused(false);
    setReleaseBeforeTime("00:00");
    setIsQueueMode(false); 
  };

  const startEdit = (shop: any) => {
    setIsEditing(true);
    setOriginalId(shop.id);
    setManualId(shop.id); setNewName(shop.name); setPassword(shop.password);
    setDepartment(shop.department || "");
    setImageUrl(shop.imageUrl || "");
    setDescription(shop.description || "");
    setGroupLimit(shop.groupLimit || 4); setOpenTime(shop.openTime);
    setCloseTime(shop.closeTime); setDuration(shop.duration);
    setCapacity(shop.capacity); setIsPaused(shop.isPaused || false);
    setReleaseBeforeTime(shop.releaseBeforeTime || "00:00");
    setIsQueueMode(shop.isQueueMode || false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async () => {
    if (!manualId || !newName || !password) return alert("必須項目(ID, 会場名, Pass)を入力してください");
    if (password.length !== 5) return alert("パスワードは5桁です");

    if (isEditing && originalId !== manualId) {
        if (attractions.some(s => s.id === manualId)) return alert(`ID「${manualId}」は既に存在します。`);
    }

    let slots: any = {};
    let shouldResetSlots = true;
    let existingReservations: any[] = [];
    let existingQueue: any[] = [];

    if (isEditing) {
        const currentShop = attractions.find(s => s.id === originalId);
        if (currentShop) {
            existingReservations = currentShop.reservations || [];
            existingQueue = currentShop.queue || []; 
            if (currentShop.openTime === openTime && currentShop.closeTime === closeTime && currentShop.duration === duration) {
                slots = currentShop.slots || {};
                shouldResetSlots = false;
            } else {
                if(!isQueueMode && !confirm("時間を変更すると、現在の予約枠がリセットされます。よろしいですか？")) return;
            }
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
      name: newName, password, groupLimit,
      department, imageUrl, description,
      openTime, closeTime, duration, capacity, isPaused, slots,
      isQueueMode, releaseBeforeTime, 
      reservations: existingReservations,
      queue: existingQueue 
    };

    if (!isEditing) {
        data.reservations = [];
        data.queue = [];
    }

    try {
        if (isEditing && originalId && manualId !== originalId) {
            if(!confirm(`会場IDを「${originalId}」から「${manualId}」に変更しますか？`)) return;
            await setDoc(doc(db, "attractions", manualId), data);
            await deleteDoc(doc(db, "attractions", originalId));
            setExpandedShopId(manualId);
        } else {
            await setDoc(doc(db, "attractions", manualId), data, { merge: true });
            if(isEditing) setExpandedShopId(manualId);
        }
        alert(isEditing ? "更新しました" : "作成しました");
        resetForm();
    } catch(e) { console.error(e); alert("エラーが発生しました"); }
  };

  const handleDeleteVenue = async (id: string) => {
    if (!confirm("本当に会場を削除しますか？")) return;
    await deleteDoc(doc(db, "attractions", id));
    setExpandedShopId(null);
  };

  // 予約操作
  const toggleReservationStatus = async (shop: any, res: any, newStatus: "reserved" | "used") => {
     if(!confirm(newStatus === "used" ? "入場済みにしますか？" : "入場を取り消しますか？")) return;
     const otherRes = shop.reservations.filter((r: any) => r.timestamp !== res.timestamp);
     const updatedRes = { ...res, status: newStatus };
     await updateDoc(doc(db, "attractions", shop.id), { reservations: [...otherRes, updatedRes] });
  };

  const cancelReservation = async (shop: any, res: any) => {
      if(!confirm(`User ID: ${res.userId}\nこの予約を削除しますか？`)) return;
      const otherRes = shop.reservations.filter((r: any) => r.timestamp !== res.timestamp);
      const updatedSlots = { ...shop.slots, [res.time]: Math.max(0, shop.slots[res.time] - 1) };
      await updateDoc(doc(db, "attractions", shop.id), { reservations: otherRes, slots: updatedSlots });
  };

  // 順番待ちキュー操作
  const updateQueueStatus = async (shop: any, ticket: any, newStatus: 'waiting' | 'ready' | 'completed' | 'canceled') => {
    let msg = "";
    if (newStatus === 'ready') msg = "呼び出しを行いますか？\n（ユーザーの画面が赤くなります）";
    if (newStatus === 'completed') msg = "【入場処理】\nこのチケットを入場済みにし、リストから削除しますか？";
    if (newStatus === 'canceled') msg = "【強制取消】\nこのチケットを無効にし、リストから削除しますか？";
      
    if (newStatus !== 'waiting' && !confirm(msg)) return;

    if (newStatus === 'completed' || newStatus === 'canceled') {
        const newQueue = shop.queue.filter((t: any) => {
            if (ticket.ticketId) {
                return t.ticketId !== ticket.ticketId;
            } else {
                return t.userId !== ticket.userId;
            }
        });
        await updateDoc(doc(db, "attractions", shop.id), { queue: newQueue });
    } else {
        const updatedQueue = shop.queue.map((t: any) => {
            const isMatch = ticket.ticketId ? (t.ticketId === ticket.ticketId) : (t.userId === ticket.userId);
            if (isMatch) {
                return { ...t, status: newStatus };
            }
            return t;
        });
        await updateDoc(doc(db, "attractions", shop.id), { queue: updatedQueue });
    }
  };

  // ★ゲスト枠追加ロジック
  const generateGuestId = (shop: any) => {
      let maxNum = 0;
      const checkId = (id: string) => {
          if (id && id.startsWith('G')) {
              const num = parseInt(id.substring(1), 10);
              if (!isNaN(num) && num > maxNum) maxNum = num;
          }
      };
      (shop.queue || []).forEach((q: any) => checkId(q.userId));
      (shop.reservations || []).forEach((r: any) => checkId(r.userId));
      return `G${String(maxNum + 1).padStart(5, '0')}`;
  };

  const handleAddGuestQueue = async (shop: any) => {
      if (!confirm("列の最後尾にゲスト枠を追加しますか？")) return;
      const guestId = generateGuestId(shop);
      const newTicket = {
          userId: guestId,
          timestamp: Date.now(),
          status: 'waiting',
          isGuest: true
      };
      await updateDoc(doc(db, "attractions", shop.id), {
          queue: [...(shop.queue || []), newTicket]
      });
      alert(`ゲスト枠 ${guestId} を追加しました`);
  };

  const handleAddGuestReservation = async (shop: any, time: string) => {
      if (!time) return alert("時間を選択してください");
      if ((shop.slots[time] || 0) >= shop.capacity) return alert("この枠は満員です");
      if (!confirm(`${time} の枠にゲストを追加しますか？`)) return;

      const guestId = generateGuestId(shop);
      const newReservation = {
          userId: guestId,
          time: time,
          timestamp: Date.now(),
          status: 'reserved',
          isGuest: true
      };
      const updatedSlots = { ...shop.slots, [time]: (shop.slots[time] || 0) + 1 };
      
      await updateDoc(doc(db, "attractions", shop.id), {
          reservations: [...(shop.reservations || []), newReservation],
          slots: updatedSlots
      });
      setGuestTime(""); // プルダウンをリセット
      alert(`ゲスト枠 ${guestId} を追加しました`);
  };

  // 表示ヘルパー
  const targetShop = attractions.find(s => s.id === expandedShopId);

  const getReservationsByTime = (shop: any) => {
      const grouped: any = {};
      Object.keys(shop.slots || {}).sort().forEach(time => { grouped[time] = []; });
      shop.reservations?.forEach((res: any) => { if(grouped[res.time]) grouped[res.time].push(res); });
      return grouped;
  };

  const getQueueList = (shop: any) => {
      if (!shop.queue) return { active: [], history: [] };
      const active = shop.queue.filter((t: any) => ['waiting', 'ready'].includes(t.status));
      const history = shop.queue.filter((t: any) => ['completed', 'canceled'].includes(t.status));
      
      active.sort((a: any, b: any) => {
          if (a.status === 'ready' && b.status !== 'ready') return -1;
          if (a.status !== 'ready' && b.status === 'ready') return 1;
          return (a.ticketId || "0").localeCompare(b.ticketId || "0");
      });

      return { active, history };
  };

  // ★追加: 解放判定ロジック
  const checkReleaseStatus = (slotTime: string, releaseBeforeTime?: string) => {
      if (!releaseBeforeTime || releaseBeforeTime === "00:00") {
          return { isReleased: true, releaseTimeStr: "" };
      }

      const [slotH, slotM] = slotTime.split(":").map(Number);
      const [relH, relM] = releaseBeforeTime.split(":").map(Number);

      const slotDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), slotH, slotM, 0);
      const releaseDate = new Date(slotDate.getTime() - (relH * 60 + relM) * 60000);

      const isReleased = now >= releaseDate;
      const releaseTimeStr = `${String(releaseDate.getHours()).padStart(2, '0')}:${String(releaseDate.getMinutes()).padStart(2, '0')} 解放`;

      return { isReleased, releaseTimeStr };
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex justify-between items-center sticky top-0 z-50 shadow-md">
          <div className="text-xs text-gray-400">Logged in as:</div>
          <div className="font-mono font-bold text-yellow-400 text-lg tracking-wider">{myUserId || "---"}</div>
      </div>

      <div className="max-w-4xl mx-auto p-4 pb-32">
        <div className="mb-6 border-b border-gray-700 pb-4">
          <h1 className="text-2xl font-bold text-red-500 mb-4">生徒会・実行委員用 (Full Access)</h1>
            
          <details className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4" open={isEditing}>
              <summary className="cursor-pointer font-bold text-blue-400">➕ 新規会場の作成 / 設定フォーム</summary>
              <div className="mt-4 pt-4 border-t border-gray-700">
                  <h3 className="text-sm font-bold mb-2 text-gray-300">{isEditing ? `✏️ ${originalId} を編集中` : "新規作成"}</h3>
                  
                  <div className="grid gap-2 md:grid-cols-3 mb-2">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">会場ID (3文字)</label>
                        <input className={`w-full p-2 rounded text-white bg-gray-700 ${isEditing && manualId !== originalId ? 'ring-2 ring-yellow-500' : ''}`}
                              placeholder="例: 3B" maxLength={3} value={manualId} onChange={e => setManualId(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">会場名</label>
                        <input className="w-full bg-gray-700 p-2 rounded text-white" placeholder="会場名" value={newName} onChange={e => setNewName(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Pass (5桁)</label>
                        <input className="w-full bg-gray-700 p-2 rounded text-white" placeholder="数字5桁" maxLength={5} value={password} onChange={e => setPassword(e.target.value)} />
                      </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2 mb-2">
                      <div>
                         <label className="text-xs text-gray-400 block mb-1">団体名/クラス</label>
                         <input className="w-full bg-gray-700 p-2 rounded text-white" placeholder="例: 3年B組" value={department} onChange={e => setDepartment(e.target.value)} />
                      </div>
                      <div>
                         <label className="text-xs text-gray-400 block mb-1">画像URL</label>
                         <input className="w-full bg-gray-700 p-2 rounded text-white" placeholder="URL" value={imageUrl} onChange={e => setImageUrl(convertGoogleDriveLink(e.target.value))} />
                      </div>
                  </div>

                  <div className="mb-2">
                      <label className="text-xs text-gray-500 mb-1 block">会場説明文 (任意: 最大500文字)</label>
                      <textarea 
                          className="w-full bg-gray-700 p-2 rounded text-white h-24 text-sm border border-gray-600 focus:border-blue-500 outline-none"
                          placeholder="会場のアピールポイントや注意事項を入力してください。"
                          maxLength={500}
                          value={description}
                          onChange={e => setDescription(e.target.value)}
                      />
                      <div className="text-right text-xs text-gray-500">{description.length}/500</div>
                  </div>

                  {isEditing && manualId !== originalId && <div className="text-xs text-yellow-400 font-bold mb-2">⚠️ IDが変更されています。</div>}

                  <div className="bg-gray-900 p-3 rounded border border-gray-600 mb-3">
                      <label className="text-xs text-gray-400 mb-2 block font-bold">運用モード:</label>
                      <div className="flex gap-4">
                          <label className={`flex items-center gap-2 cursor-pointer p-2 rounded w-1/2 justify-center border ${!isQueueMode ? 'bg-blue-900 border-blue-500' : 'bg-gray-800 border-gray-700 opacity-50'}`}>
                              <input type="radio" name="mode" checked={!isQueueMode} onChange={() => setIsQueueMode(false)} className="hidden" />
                              📅 時間予約制
                          </label>
                          <label className={`flex items-center gap-2 cursor-pointer p-2 rounded w-1/2 justify-center border ${isQueueMode ? 'bg-purple-900 border-purple-500' : 'bg-gray-800 border-gray-700 opacity-50'}`}>
                              <input type="radio" name="mode" checked={isQueueMode} onChange={() => setIsQueueMode(true)} className="hidden" />
                              🚶‍♂️ 順番待ち制 (列)
                          </label>
                      </div>
                  </div>

                  {/* ★UI変更: 解放前時間を追加したグリッド */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3 bg-gray-900 p-3 rounded border border-gray-600">
                      <div>
                          <label className="text-xs text-gray-400 block mb-1 font-bold">開始時刻</label>
                          <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} className="w-full bg-gray-700 p-2 rounded text-sm"/>
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 block mb-1 font-bold">終了時刻</label>
                          <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} className="w-full bg-gray-700 p-2 rounded text-sm"/>
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 block mb-1 font-bold">1枠(分)</label>
                          <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full bg-gray-700 p-2 rounded text-sm" placeholder="分"/>
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 block mb-1 font-bold">定員(組)</label>
                          <input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} className="w-full bg-gray-700 p-2 rounded text-sm" placeholder="定員"/>
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 block mb-1 font-bold text-yellow-400">解放制限(前)</label>
                          <input type="time" value={releaseBeforeTime} onChange={e => setReleaseBeforeTime(e.target.value)} className="w-full bg-gray-700 p-2 rounded text-sm text-yellow-100" />
                      </div>
                  </div>
                  <div className="text-[10px] text-gray-400 mb-3 px-2">※解放制限：指定時間前になるまで予約枠をグレーアウトします。「00:00」で制限なし。</div>

                  <div className="flex items-center gap-3 mb-3 bg-gray-900 p-3 rounded border border-gray-600">
                      <div>
                          <label className="text-xs text-gray-400 block mb-1 font-bold">1組の最大人数</label>
                          <input type="number" value={groupLimit} onChange={e => setGroupLimit(Number(e.target.value))} className="w-20 bg-gray-700 p-2 rounded text-sm" />
                      </div>
                      <div className="flex-1 flex items-center justify-end">
                        <label className="cursor-pointer text-sm text-red-300 font-bold flex items-center gap-2 bg-red-900/30 px-4 py-2 rounded border border-red-800">
                            <input type="checkbox" checked={isPaused} onChange={e => setIsPaused(e.target.checked)} className="w-4 h-4" /> 
                            🚫 受付を停止する
                        </label>
                      </div>
                  </div>

                  <div className="flex gap-2">
                      <button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-500 py-3 rounded font-bold shadow-lg transition">{isEditing ? "変更を保存" : "会場を作成"}</button>
                      {isEditing && <button onClick={resetForm} className="bg-gray-600 px-6 rounded hover:bg-gray-500 transition">キャンセル</button>}
                  </div>
              </div>
          </details>

          <div className="flex gap-2 items-center bg-gray-800 p-2 rounded border border-gray-600 mb-6">
              <span className="text-xl">🔍</span>
              <input className="flex-1 bg-transparent text-white outline-none" placeholder="ユーザーID検索..." value={searchUserId} onChange={e => setSearchUserId(e.target.value)} />
          </div>

          {/* ダッシュボード */}
          <div className="bg-black border border-gray-600 rounded-xl p-4 mb-6 shadow-xl">
              <h2 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Dashboard & Global Actions</h2>
              <div className="flex justify-between items-center mb-6 bg-gray-900 p-4 rounded-lg border border-gray-800">
                  <div className="text-center"><div className="text-xs text-gray-500 mb-1">TOTAL VENUES</div><div className="text-3xl font-mono font-bold text-white tracking-widest">{stats.totalVenues}</div></div>
                  <div className="text-center border-l border-r border-gray-700 px-6"><div className="text-xs text-gray-500 mb-1">PAUSED SHOPS</div><div className="text-3xl font-mono font-bold text-red-500 tracking-widest">{stats.pausedVenues}</div></div>
                  <div className="text-center"><div className="text-xs text-gray-500 mb-1">ACTIVE GUESTS</div><div className="text-3xl font-mono font-bold text-green-500 tracking-widest">{stats.totalReservations}</div></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <button onClick={() => handleBulkPause(true)} className="bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-800 py-2 rounded text-xs font-bold transition">🛑 一斉停止</button>
                  <button onClick={() => handleBulkPause(false)} className="bg-green-900/50 hover:bg-green-800 text-green-200 border border-green-800 py-2 rounded text-xs font-bold transition">▶️ 一斉再開</button>
                  <button onClick={handleBulkDeleteReservations} className="bg-orange-900/50 hover:bg-orange-800 text-orange-200 border border-orange-800 py-2 rounded text-xs font-bold transition">🗑️ データ全削除</button>
                  <button onClick={handleBulkDeleteVenues} className="bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 py-2 rounded text-xs font-bold transition">💀 会場全削除</button>
              </div>
          </div>
        </div>

        {!expandedShopId && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {attractions.map(shop => {
                    let hasUser = false;
                    let totalCount = 0;
                    if (shop.isQueueMode) {
                        hasUser = searchUserId && shop.queue?.some((t:any) => t.userId?.includes(searchUserId.toUpperCase()));
                        totalCount = shop.queue?.filter((t:any) => ['waiting', 'ready'].includes(t.status)).length || 0;
                    } else {
                        hasUser = searchUserId && shop.reservations?.some((r:any) => r.userId?.includes(searchUserId.toUpperCase()));
                        totalCount = shop.reservations?.length || 0;
                    }

                    return (
                        <button key={shop.id} onClick={() => setExpandedShopId(shop.id)} className={`p-4 rounded-xl border text-left flex justify-between items-center hover:bg-gray-800 transition ${hasUser ? 'bg-pink-900/40 border-pink-500' : 'bg-gray-800 border-gray-600'}`}>
                            <div className="flex items-center gap-4">
                                {shop.imageUrl ? (
                                    <img src={shop.imageUrl} alt={shop.name} referrerPolicy="no-referrer" className="w-14 h-14 object-cover rounded-md bg-gray-900 shrink-0" />
                                ) : (
                                    <div className="w-14 h-14 bg-gray-700 rounded-md flex items-center justify-center text-xs text-gray-500 shrink-0">No Img</div>
                                )}
                                <div className="flex flex-col items-start min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-yellow-400 font-bold font-mono text-sm">{shop.id}</span>
                                        {shop.department && <span className="text-xs text-blue-300 font-bold border-l border-gray-600 pl-2">{shop.department}</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-lg leading-tight line-clamp-1">{shop.name}</span>
                                        {shop.isPaused && <span className="text-[10px] bg-red-600 px-1.5 py-0.5 rounded text-white whitespace-nowrap">停止中</span>}
                                        {shop.isQueueMode ? 
                                            <span className="text-[10px] bg-purple-600 px-1.5 py-0.5 rounded text-white whitespace-nowrap">並び順</span> :
                                            <span className="text-[10px] bg-blue-600 px-1.5 py-0.5 rounded text-white whitespace-nowrap">予約制</span>
                                        }
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 pl-2">
                                <div className="text-right">
                                    <span className="text-[10px] text-gray-500 block">{shop.isQueueMode ? "WAITING" : "TOTAL"}</span>
                                    <span className="font-mono text-xl text-blue-400">{String(totalCount).padStart(3, '0')}</span>
                                </div>
                                <div className="text-gray-400 text-2xl">›</div>
                            </div>
                        </button>
                    );
                })}
            </div>
        )}

        {expandedShopId && targetShop && (
            <div className="animate-fade-in">
                <button onClick={() => { setExpandedShopId(null); setIsEditing(false); }} className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white">← 会場一覧に戻る</button>
                <div className="bg-gray-800 rounded-xl border border-gray-600 overflow-hidden">
                    <div className="bg-gray-700 p-4 flex justify-between items-center relative overflow-hidden">
                        {targetShop.imageUrl && (
                            <div className="absolute inset-0 opacity-30">
                                <img src={targetShop.imageUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/80 to-transparent"></div>
                            </div>
                        )}
                        <div className="relative z-10 flex-1">
                            {targetShop.department && <span className="text-[10px] font-bold bg-blue-500 text-white px-2 py-0.5 rounded mb-1 inline-block border border-blue-400">{targetShop.department}</span>}
                            <h2 className="text-2xl font-bold flex items-center gap-2"><span className="text-yellow-400 font-mono">{targetShop.id}</span>{targetShop.name}</h2>
                            <p className="text-xs text-gray-400 mt-1">
                                {targetShop.isQueueMode ? <span className="text-purple-400 font-bold">🚶‍♂️ 順番待ち制 (整理券)</span> : <span className="text-blue-400 font-bold">📅 時間予約制</span>} | 
                                Pass: {targetShop.password} | 定員: {targetShop.capacity}組
                            </p>
                        </div>
                        <div className="flex gap-2 relative z-10">
                            <button onClick={() => startEdit(targetShop)} className="bg-blue-600 text-xs px-3 py-2 rounded hover:bg-blue-500 shadow">設定編集</button>
                            <button onClick={() => handleDeleteVenue(targetShop.id)} className="bg-red-600 text-xs px-3 py-2 rounded hover:bg-red-500 shadow">会場削除</button>
                        </div>
                    </div>

                    <div className="p-4 space-y-6">
                        {targetShop.description && (
                            <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                                {targetShop.description}
                            </div>
                        )}

                        {/* ★追加: ゲスト枠追加UIパネル */}
                        <div className="bg-gray-800 p-4 rounded-lg border border-gray-600 mt-4 shadow-inner">
                            <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">🎟️ ゲスト枠（スマホ非保持者）を追加</h3>
                            {targetShop.isQueueMode ? (
                                <button onClick={() => handleAddGuestQueue(targetShop)} className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded text-sm font-bold shadow transition flex items-center gap-2">
                                    🚶‍♂️ 列の最後尾に追加する
                                </button>
                            ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                    <select 
                                        className="bg-gray-700 text-white p-2 rounded border border-gray-600 text-sm outline-none"
                                        value={guestTime}
                                        onChange={(e) => setGuestTime(e.target.value)}
                                    >
                                        <option value="">予約時間を選択...</option>
                                        {Object.keys(targetShop.slots || {}).sort().map(time => {
                                            const count = targetShop.slots[time] || 0;
                                            const isFull = count >= targetShop.capacity;
                                            return (
                                                <option key={time} value={time} disabled={isFull}>
                                                    {time} ({count}/{targetShop.capacity}組) {isFull ? '満員' : ''}
                                                </option>
                                            )
                                        })}
                                    </select>
                                    <button onClick={() => handleAddGuestReservation(targetShop, guestTime)} className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded text-sm font-bold shadow transition disabled:opacity-50 disabled:cursor-not-allowed" disabled={!guestTime}>
                                        📅 ゲスト予約を確定
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* 条件分岐：予約制 or 順番待ち制 */}

                      {targetShop.isQueueMode ? (
                            // --- 順番待ち制のUI ---
                            <div>
                                <h3 className="text-lg font-bold mb-4 text-purple-400 border-b border-gray-700 pb-2">📋 待機列リスト (Queue)</h3>
                                {(() => {
                                    const { active, history } = getQueueList(targetShop);
                                    if (active.length === 0) return <div className="text-center py-8 text-gray-500 bg-gray-900/50 rounded-lg">現在待機しているユーザーはいません。</div>;
                                    
                                    return (
                                        <div className="space-y-2">
                                            {active.map((ticket: any, index: number) => {
                                                const isReady = ticket.status === 'ready';
                                                const isMatch = searchUserId && ticket.userId?.includes(searchUserId.toUpperCase());
                                                
                                                return (
                                                    <div key={ticket.userId || index} className={`flex items-center justify-between p-3 rounded-lg border ${isReady ? 'bg-red-900/30 border-red-500 animate-pulse-slow' : 'bg-gray-700 border-gray-600'} ${isMatch ? 'ring-2 ring-pink-500' : ''}`}>
                                                        <div className="flex items-center gap-4">
                                                            {/* ★修正ポイント: 6桁IDを表示 (無ければindex) */}
                                                            <div className={`text-2xl font-mono font-bold w-20 text-center ${isReady ? 'text-red-400' : 'text-gray-400'}`}>
                                                                {ticket.ticketId ? ticket.ticketId : `#${index + 1}`}
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono font-bold text-lg text-white">{ticket.userId}</span>
                                                                    <span className="bg-gray-800 text-xs px-2 py-0.5 rounded text-gray-300 border border-gray-600">{ticket.count || 1}名</span>
                                                                </div>
                                                                <div className="text-xs mt-1">
                                                                    {isReady ? 
                                                                        <span className="text-red-400 font-bold animate-pulse">🔴 呼び出し中</span> : 
                                                                        <span className="text-blue-300">🔵 待機中</span>
                                                                    }
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            {!isReady && (
                                                                <button onClick={() => updateQueueStatus(targetShop, ticket, 'ready')} className="bg-yellow-600 hover:bg-yellow-500 text-white text-xs px-3 py-2 rounded font-bold shadow-lg transition">
                                                                    🔔 呼出
                                                                </button>
                                                            )}
                                                            <button onClick={() => updateQueueStatus(targetShop, ticket, 'completed')} className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-2 rounded font-bold shadow-lg transition">
                                                                ✅ 入場
                                                            </button>
                                                            <button onClick={() => updateQueueStatus(targetShop, ticket, 'canceled')} className="bg-gray-600 hover:bg-gray-500 text-white text-xs px-3 py-2 rounded font-bold shadow-lg transition">
                                                                ✖ 取消
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </div>
                        ) : (
                            // --- 時間予約制のUI ---
                            <div>
                                <h3 className="text-lg font-bold mb-4 text-blue-400 border-b border-gray-700 pb-2">📅 予約リスト (Reservations)</h3>
                                <div className="space-y-4">
                                    {Object.entries(getReservationsByTime(targetShop)).map(([time, resList]: any) => {
                                        // ★追加: 前半で定義した関数を使って各時間枠の解放状況を判定
                                        const { isReleased, releaseTimeStr } = checkReleaseStatus(time, targetShop.releaseBeforeTime);

                                        return (
                                            // ★追加: 未解放の場合はグレーアウト（opacity-50等）を適用
                                            <div key={time} className={`rounded-lg p-3 border transition ${isReleased ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-900 border-gray-800 opacity-60'}`}>
                                                <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                                                    <div className="flex items-center gap-3">
                                                        <h4 className={`font-mono text-xl font-bold ${isReleased ? 'text-yellow-500' : 'text-gray-500'}`}>{time}</h4>
                                                        {/* ★追加: 未解放の場合は「XX:XX 解放」バッジを表示 */}
                                                        {!isReleased && (
                                                            <span className="bg-gray-800 border border-gray-600 text-gray-400 text-[10px] px-2 py-0.5 rounded font-bold">
                                                                🔒 {releaseTimeStr}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-gray-400">
                                                        予約: {resList.length}組 / 残り枠: {(targetShop.capacity || 0) - (targetShop.slots?.[time] || 0)}
                                                    </div>
                                                </div>
                                                {resList.length === 0 ? (
                                                    <div className="text-xs text-gray-600 py-1">予約なし</div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {resList.map((res: any, idx: number) => (
                                                            <div key={idx} className={`flex justify-between items-center p-2 rounded bg-gray-700 ${res.status === 'used' ? 'opacity-50 grayscale' : ''}`}>
                                                                <div>
                                                                    <div className="font-bold font-mono text-sm">{res.userId}</div>
                                                                    <div className="text-xs text-gray-400">{res.count}名</div>
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    {res.status !== 'used' ? (
                                                                        <button onClick={() => toggleReservationStatus(targetShop, res, 'used')} className="bg-green-600 text-[10px] px-2 py-1 rounded">入場</button>
                                                                    ) : (
                                                                        <button onClick={() => toggleReservationStatus(targetShop, res, 'reserved')} className="bg-gray-500 text-[10px] px-2 py-1 rounded">戻す</button>
                                                                    )}
                                                                    <button onClick={() => cancelReservation(targetShop, res)} className="bg-red-900/50 text-red-200 text-[10px] px-2 py-1 rounded border border-red-900">取消</button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}

