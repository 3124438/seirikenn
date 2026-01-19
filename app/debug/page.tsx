// #生徒用管理画面 (app/debug/page.tsx)
"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../../firebase"; 
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

export default function AdminPage() {
  const [attractions, setAttractions] = useState<any[]>([]);
  
  // 自分のID（権限チェック・表示用）
  const [myUserId, setMyUserId] = useState("");

  // アカウント停止（BAN）状態管理
  const [isGlobalBanned, setIsGlobalBanned] = useState(false);

  // 表示モード管理
  const [expandedShopId, setExpandedShopId] = useState<string | null>(null); // 現在開いている会場ID
  const [isEditing, setIsEditing] = useState(false); // 編集モードか

  // 編集用フォームステート
  const [manualId, setManualId] = useState("");
  const [newName, setNewName] = useState("");
  const [department, setDepartment] = useState(""); 
  const [imageUrl, setImageUrl] = useState("");     
  const [description, setDescription] = useState(""); // 会場説明文
  const [password, setPassword] = useState("");
  
  const [groupLimit, setGroupLimit] = useState(4);
  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("15:00");
  const [duration, setDuration] = useState(20);
  const [capacity, setCapacity] = useState(3);
  const [isPaused, setIsPaused] = useState(false);

  // 運用モード
  const [isQueueMode, setIsQueueMode] = useState(false);
  // ★追加: オーダー制モード
  const [isOrderMode, setIsOrderMode] = useState(false);

  // ★追加: メニュー編集用
  const [editMenu, setEditMenu] = useState<any[]>([]);
  const [tempMenuItem, setTempMenuItem] = useState({ name: "", price: 0, stock: 0, limit: 1 });

  // 検索用
  const [searchUserId, setSearchUserId] = useState("");

  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));
    
    // --- IDの取得と生成ロジック ---
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
    // ------------------------------------------

    // 1. 会場データの監視
    const unsubAttractions = onSnapshot(collection(db, "attractions"), (snapshot) => {
      setAttractions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. 自分のユーザーBAN状態をリアルタイム監視
    const unsubUser = onSnapshot(doc(db, "users", stored), (docSnap) => {
        if (docSnap.exists()) {
            const userData = docSnap.data();
            setIsGlobalBanned(!!userData.isBanned);
        } else {
            setIsGlobalBanned(false);
        }
    });

    return () => {
        unsubAttractions();
        unsubUser();
    };
  }, []);

  // --- 強制BAN画面 ---
  if (isGlobalBanned) {
      return (
          <div className="min-h-screen bg-black text-red-600 font-sans flex flex-col items-center justify-center p-6 text-center animate-fade-in">
              <div className="text-6xl mb-4">🚫</div>
              <h1 className="text-3xl font-bold mb-2">ACCESS DENIED</h1>
              <p className="text-white text-lg mb-6">
                  このアカウントは管理者により凍結されました。<br/>
                  すべての操作が無効化されています。
              </p>
              <div className="bg-gray-900 border border-gray-700 p-4 rounded text-sm text-gray-400 font-mono">
                  User ID: <span className="text-yellow-500">{myUserId}</span>
              </div>
          </div>
      );
  }

  // --- 権限チェックヘルパー関数 ---
  const isUserBlacklisted = (shop: any) => shop?.adminBannedUsers?.includes(myUserId);
  const isUserNotWhitelisted = (shop: any) => shop.isRestricted && !shop.allowedUsers?.includes(myUserId);
  const isAdminRestrictedAndNotAllowed = (shop: any) => shop.isAdminRestricted && !shop.adminAllowedUsers?.includes(myUserId);

  // --- 権限チェック付き: 会場展開 ---
  const handleExpandShop = (shopId: string) => {
      const shop = attractions.find(s => s.id === shopId);
      if (!shop) return;

      if (isUserBlacklisted(shop)) {
          alert(`⛔ アクセス拒否\nあなたのIDは、この会場のブラックリストに含まれているため操作できません。`);
          return;
      }
      if (isUserNotWhitelisted(shop)) {
          alert(`🔒 アクセス制限\nこの会場は「ホワイトリスト（許可制）」です。\nあなたのIDは許可リストに入っていません。`);
          return;
      }
      if (isAdminRestrictedAndNotAllowed(shop)) {
          alert(`🔒 管理者制限\nこの会場は「指名スタッフ限定モード」です。\nアクセス権限がありません。`);
          return;
      }

      const inputPass = prompt(`「${shop.name}」の管理用パスワードを入力してください`);
      if (inputPass !== shop.password) {
          alert("パスワードが違います");
          return;
      }

      setExpandedShopId(shopId);
  };

  // --- 編集関連 ---
  const resetForm = () => {
    setIsEditing(false);
    setManualId(""); setNewName(""); setDepartment(""); setImageUrl(""); setDescription(""); setPassword("");
    setGroupLimit(4); setOpenTime("10:00"); setCloseTime("15:00");
    setDuration(20); setCapacity(3); setIsPaused(false);
    setIsQueueMode(false); 
    setIsOrderMode(false); // 初期化
    setEditMenu([]); // メニュー初期化
  };

  const startEdit = (shop: any) => {
    if (isUserBlacklisted(shop) || isUserNotWhitelisted(shop)) return;

    setIsEditing(true);
    setManualId(shop.id); 
    setNewName(shop.name);
    setDepartment(shop.department || ""); 
    setImageUrl(shop.imageUrl || "");
    setDescription(shop.description || ""); 
    setPassword(shop.password);
    setGroupLimit(shop.groupLimit || 4); 
    setOpenTime(shop.openTime);
    setCloseTime(shop.closeTime); 
    setDuration(shop.duration);
    setCapacity(shop.capacity); 
    setIsPaused(shop.isPaused || false);
    setIsQueueMode(shop.isQueueMode || false);
    setIsOrderMode(shop.isOrderMode || false); // モード読み込み
    setEditMenu(shop.menu || []); // メニュー読み込み
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ★追加: メニュー操作系
  const addMenuItem = () => {
      if (!tempMenuItem.name) return alert("品名を入力してください");
      setEditMenu([...editMenu, { ...tempMenuItem, id: Date.now().toString() }]);
      setTempMenuItem({ name: "", price: 0, stock: 0, limit: 1 });
  };
  const removeMenuItem = (id: string) => {
      setEditMenu(editMenu.filter(m => m.id !== id));
  };

  const handleSave = async () => {
    if (!isEditing) return alert("新規会場の作成は無効化されています。");

    const currentShop = attractions.find(s => s.id === manualId);
    if (currentShop && (isUserBlacklisted(currentShop) || isUserNotWhitelisted(currentShop))) {
        return alert("権限がないため保存できません。");
    }

    if (!manualId || !newName || !password) return alert("必須項目を入力してください");
    if (password.length !== 5) return alert("パスワードは5桁です");

    let slots: any = {};
    let shouldResetSlots = true;

    // 時間予約制の場合のみスロット計算を行う
    if (!isQueueMode && !isOrderMode) {
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
    } else {
        slots = currentShop?.slots || {}; 
    }

    const data: any = {
      name: newName, 
      department,
      imageUrl,
      description, 
      password, groupLimit,
      openTime, closeTime, duration, capacity, isPaused,
      isQueueMode,
      isOrderMode, // ★保存
      menu: editMenu, // ★メニュー保存
      slots
    };

    await setDoc(doc(db, "attractions", manualId), data, { merge: true });
    
    alert("更新しました");
    setExpandedShopId(manualId);
    resetForm(); 
  };

  const handleDeleteVenue = async (id: string) => {
    const shop = attractions.find(s => s.id === id);
    if (shop && (isUserBlacklisted(shop) || isUserNotWhitelisted(shop))) return;
    if (!confirm("本当に会場を削除しますか？")) return;
    await deleteDoc(doc(db, "attractions", id));
    setExpandedShopId(null);
  };

  // --- 予約・順番待ち・オーダー操作関連 ---
  const toggleReservationStatus = async (shop: any, res: any, newStatus: "reserved" | "used") => {
      // (省略なし: 既存ロジック)
      const otherRes = shop.reservations.filter((r: any) => r.timestamp !== res.timestamp);
      const updatedRes = { ...res, status: newStatus };
      await updateDoc(doc(db, "attractions", shop.id), { reservations: [...otherRes, updatedRes] });
  };

  const cancelReservation = async (shop: any, res: any) => {
      if(!confirm(`この予約を削除しますか？`)) return;
      const otherRes = shop.reservations.filter((r: any) => r.timestamp !== res.timestamp);
      const updatedSlots = { ...shop.slots, [res.time]: Math.max(0, shop.slots[res.time] - 1) };
      await updateDoc(doc(db, "attractions", shop.id), { reservations: otherRes, slots: updatedSlots });
  };

  const handleQueueAction = async (shop: any, ticket: any, action: "call" | "enter" | "cancel") => {
      // (省略なし: 既存ロジック)
      let currentQueue = shop.queue || [];
      let updatedQueue = [];
      if (action === "call") {
          updatedQueue = currentQueue.map((t: any) => t.ticketId === ticket.ticketId ? { ...t, status: "ready" } : t);
      } else {
          updatedQueue = currentQueue.filter((t: any) => t.ticketId !== ticket.ticketId);
      }
      await updateDoc(doc(db, "attractions", shop.id), { queue: updatedQueue });
  };

  // ★追加: オーダー完了処理
  const completeOrder = async (shop: any, order: any) => {
      if(!confirm(`Ticket: ${order.ticketId}\n取引を完了済みにしますか？`)) return;
      const otherOrders = (shop.orders || []).filter((o:any) => o.ticketId !== order.ticketId);
      const updatedOrder = { ...order, status: 'completed' };
      // 完了したらリストの一番下へ、あるいは別管理も可能だがここでは更新のみ
      await updateDoc(doc(db, "attractions", shop.id), { orders: [...otherOrders, updatedOrder] });
  };

  // ★追加: 在庫手動変更
  const updateStock = async (shop: any, itemId: string, newStock: number) => {
      const updatedMenu = shop.menu.map((item: any) => 
          item.id === itemId ? { ...item, stock: Number(newStock) } : item
      );
      await updateDoc(doc(db, "attractions", shop.id), { menu: updatedMenu });
  };

  // --- 表示用ヘルパー ---
  const targetShop = attractions.find(s => s.id === expandedShopId);

  // ★オーダー並び替え: 支払い待ち(pending)を最優先、次に日付順
  const sortedOrders = targetShop?.orders ? [...targetShop.orders].sort((a, b) => {
      // payment (支払い待ち) を最優先
      const isAPending = a.status === 'payment';
      const isBPending = b.status === 'payment';
      if (isAPending && !isBPending) return -1;
      if (!isAPending && isBPending) return 1;
      return b.timestamp - a.timestamp; // 新しい順
  }) : [];

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      
      {/* ユーザーID表示バー */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex justify-between items-center sticky top-0 z-50 shadow-md">
          <div className="text-xs text-gray-400">Logged in as:</div>
          <div className="font-mono font-bold text-yellow-400 text-lg tracking-wider">
              {myUserId || "---"}
          </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 pb-32">
        {/* ヘッダーエリア */}
        <div className="mb-6 border-b border-gray-700 pb-4">
            <h1 className="text-2xl font-bold text-white mb-4">予約管理</h1>
            
            {isEditing ? (
                <div className="bg-gray-800 rounded-lg p-4 border border-blue-500 mb-4 animate-fade-in shadow-lg shadow-blue-900/20">
                    <h3 className="text-sm font-bold mb-4 text-blue-300 flex items-center gap-2 border-b border-gray-700 pb-2">
                        <span>✏️ 設定編集モード</span>
                        <span className="text-gray-500 text-xs font-normal ml-auto">ID: {manualId}</span>
                    </h3>
                    
                    {/* 基本情報の入力欄 (既存コードと同じため省略せず記述) */}
                    <div className="grid gap-4 md:grid-cols-2 mb-4 bg-gray-900/50 p-3 rounded border border-gray-700">
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-500 mb-1">会場ID (不可)</label>
                            <input disabled className="bg-gray-800 p-2 rounded text-gray-400 cursor-not-allowed border border-gray-700 font-mono" value={manualId} />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-500 mb-1">Pass (不可)</label>
                            <input disabled className="bg-gray-800 p-2 rounded text-gray-400 cursor-not-allowed border border-gray-700 font-mono" value={password} />
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 mb-4">
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-400 mb-1">会場名</label>
                            <input className="bg-gray-700 p-2 rounded text-white border border-gray-600 focus:border-blue-500 outline-none" value={newName} onChange={e => setNewName(e.target.value)} />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-500 mb-1">団体名</label>
                            <input disabled className="bg-gray-800 p-2 rounded text-gray-400 border border-gray-700" value={department} />
                        </div>
                    </div>
                    <div className="mb-4">
                         <label className="text-xs text-gray-400 mb-1">画像URL</label>
                         <input className="bg-gray-700 p-2 rounded text-white border border-gray-600 w-full" value={imageUrl} onChange={e => setImageUrl(convertGoogleDriveLink(e.target.value))} />
                    </div>
                    <div className="mb-4">
                      <label className="text-xs text-gray-400 mb-1 block">会場説明文</label>
                      <textarea className="w-full bg-gray-700 p-2 rounded text-white h-24 text-sm border border-gray-600 resize-none" maxLength={500} value={description} onChange={e => setDescription(e.target.value)} />
                    </div>

                    {/* ★ 運用モード設定 (3択) ★ */}
                    <div className="bg-gray-750 p-3 rounded border border-gray-600 mb-4 bg-gray-900/30">
                         <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Operation Mode</h4>
                         <div className="flex flex-wrap gap-4 items-center">
                            <label className="flex items-center gap-2 cursor-pointer bg-gray-800 p-2 rounded border border-gray-700 hover:bg-gray-700">
                                <input type="radio" name="mode" checked={!isQueueMode && !isOrderMode} onChange={() => { setIsQueueMode(false); setIsOrderMode(false); }} className="accent-blue-500" />
                                <span className={!isQueueMode && !isOrderMode ? "text-blue-400 font-bold" : "text-gray-400"}>🕒 時間予約制</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer bg-gray-800 p-2 rounded border border-gray-700 hover:bg-gray-700">
                                <input type="radio" name="mode" checked={isQueueMode} onChange={() => { setIsQueueMode(true); setIsOrderMode(false); }} className="accent-green-500" />
                                <span className={isQueueMode ? "text-green-400 font-bold" : "text-gray-400"}>🔢 順番待ち制</span>
                            </label>
                            {/* ★追加: オーダー制選択肢 */}
                            <label className="flex items-center gap-2 cursor-pointer bg-gray-800 p-2 rounded border border-gray-700 hover:bg-gray-700">
                                <input type="radio" name="mode" checked={isOrderMode} onChange={() => { setIsQueueMode(false); setIsOrderMode(true); }} className="accent-orange-500" />
                                <span className={isOrderMode ? "text-orange-400 font-bold" : "text-gray-400"}>🛒 オーダー制</span>
                            </label>

                            {/* 緊急停止 */}
                            <div className="ml-auto flex items-center gap-2 bg-red-900/30 px-3 py-2 rounded border border-red-800">
                                <input type="checkbox" checked={isPaused} onChange={e => setIsPaused(e.target.checked)} className="accent-red-500 w-4 h-4 cursor-pointer" />
                                <span className={`text-xs font-bold ${isPaused ? "text-red-400" : "text-gray-400"}`}>⛔ 受付停止</span>
                            </div>
                         </div>
                    </div>

                    {/* ★追加: メニュー登録フォーム (オーダー制の時だけ表示推奨だが、設定として常時表示も可) */}
                    {isOrderMode && (
                        <div className="bg-gray-750 p-3 rounded border border-gray-600 mb-4 bg-gray-900/30">
                            <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Menu Registration (オーダー制)</h4>
                            <div className="flex flex-wrap gap-2 items-end mb-3">
                                <div className="flex-1 min-w-[120px]">
                                    <label className="text-[10px] text-gray-400">品名</label>
                                    <input type="text" className="w-full bg-gray-700 p-1.5 rounded text-sm border border-gray-600" value={tempMenuItem.name} onChange={e => setTempMenuItem({...tempMenuItem, name: e.target.value})} placeholder="焼きそば" />
                                </div>
                                <div className="w-20">
                                    <label className="text-[10px] text-gray-400">価格</label>
                                    <input type="number" className="w-full bg-gray-700 p-1.5 rounded text-sm border border-gray-600" value={tempMenuItem.price} onChange={e => setTempMenuItem({...tempMenuItem, price: Number(e.target.value)})} />
                                </div>
                                <div className="w-20">
                                    <label className="text-[10px] text-gray-400">在庫</label>
                                    <input type="number" className="w-full bg-gray-700 p-1.5 rounded text-sm border border-gray-600" value={tempMenuItem.stock} onChange={e => setTempMenuItem({...tempMenuItem, stock: Number(e.target.value)})} />
                                </div>
                                <div className="w-20">
                                    <label className="text-[10px] text-gray-400">制限数</label>
                                    <input type="number" className="w-full bg-gray-700 p-1.5 rounded text-sm border border-gray-600" value={tempMenuItem.limit} onChange={e => setTempMenuItem({...tempMenuItem, limit: Number(e.target.value)})} />
                                </div>
                                <button onClick={addMenuItem} className="bg-blue-600 hover:bg-blue-500 text-white p-1.5 rounded text-sm font-bold w-16">追加</button>
                            </div>
                            {/* 登録済みリスト */}
                            <ul className="space-y-1">
                                {editMenu.map((item, idx) => (
                                    <li key={idx} className="flex items-center justify-between bg-gray-800 p-2 rounded border border-gray-700 text-sm">
                                        <span>{item.name} (¥{item.price}) - 在庫:{item.stock} / 限:{item.limit}</span>
                                        <button onClick={() => removeMenuItem(item.id)} className="text-red-400 hover:text-red-300 text-xs">削除</button>
                                    </li>
                                ))}
                                {editMenu.length === 0 && <li className="text-gray-500 text-xs">メニューがありません</li>}
                            </ul>
                        </div>
                    )}

                    {/* 時間設定 (時間予約制のみ) */}
                    {!isQueueMode && !isOrderMode && (
                        <div className="bg-gray-750 p-3 rounded border border-gray-600 mb-4 bg-gray-900/30">
                            <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Time Settings</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="flex flex-col"><label className="text-[10px] text-gray-400">開始</label><input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} className="bg-gray-700 p-2 rounded text-sm border border-gray-600"/></div>
                                <div className="flex flex-col"><label className="text-[10px] text-gray-400">終了</label><input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} className="bg-gray-700 p-2 rounded text-sm border border-gray-600"/></div>
                                <div className="flex flex-col"><label className="text-[10px] text-gray-400">枠(分)</label><input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} className="bg-gray-700 p-2 rounded text-sm border border-gray-600"/></div>
                                <div className="flex flex-col"><label className="text-[10px] text-gray-400">定員(組)</label><input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} className="bg-gray-700 p-2 rounded text-sm border border-gray-600"/></div>
                            </div>
                        </div>
                    )}
                    
                    <div className="bg-gray-750 p-3 rounded border border-gray-600 mb-4 bg-gray-900/30">
                         <div className="flex flex-col">
                            <label className="text-[10px] text-gray-400 mb-1">1組(注文)の最大人数/制限</label>
                            <input type="number" value={groupLimit} onChange={e => setGroupLimit(Number(e.target.value))} className="w-20 bg-gray-700 p-2 rounded text-sm text-center border border-gray-600" />
                         </div>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={handleSave} className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 py-3 rounded font-bold transition shadow-lg">変更を保存</button>
                        <button onClick={resetForm} className="bg-gray-700 hover:bg-gray-600 px-6 rounded text-sm transition border border-gray-600">キャンセル</button>
                    </div>
                </div>
            ) : (
                <div className="bg-gray-800/50 rounded p-3 mb-4 border border-gray-700 text-center text-xs text-gray-500">
                    ※設定を変更するには、下のリストから会場を選び「設定編集」ボタンを押してください。
                </div>
            )}

            {/* 検索バー */}
            <div className="flex gap-2 items-center bg-gray-800 p-2 rounded border border-gray-600">
                <span className="text-xl">🔍</span>
                <input className="flex-1 bg-transparent text-white outline-none" placeholder="ユーザーIDまたはチケットID" value={searchUserId} onChange={e => setSearchUserId(e.target.value)} />
            </div>
        </div>

        {/* --- メインエリア --- */}
        {!expandedShopId && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {attractions.map(shop => {
                    // バッジ表示ロジック
                    const modeLabel = shop.isOrderMode ? "🛒 オーダー制" : shop.isQueueMode ? "🔢 順番待ち" : "🕒 時間予約";
                    const modeColor = shop.isOrderMode ? "bg-orange-900/60 text-orange-300 border-orange-700" : shop.isQueueMode ? "bg-green-900/60 text-green-300 border-green-700" : "bg-blue-900/60 text-blue-300 border-blue-700";
                    const countText = shop.isOrderMode ? `注文: ${shop.orders?.length || 0}件` : shop.isQueueMode ? `待機: ${shop.queue?.length || 0}組` : `予約: ${shop.reservations?.length || 0}件`;
                    
                    return (
                        <button key={shop.id} onClick={() => handleExpandShop(shop.id)} className="group p-4 rounded-xl border border-gray-600 text-left flex items-start gap-4 transition hover:bg-gray-800 bg-gray-800 relative overflow-hidden">
                            {shop.imageUrl ? <img src={shop.imageUrl} alt="" className="w-16 h-16 rounded object-cover" /> : <div className="w-16 h-16 rounded bg-gray-700 flex items-center justify-center text-2xl">🎪</div>}
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="text-yellow-400 font-bold font-mono text-xl">{shop.id}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded border ${modeColor}`}>{modeLabel}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-lg truncate w-full">{shop.name}</span>
                                    {shop.isPaused && <span className="text-xs bg-red-600 px-2 py-0.5 rounded text-white">停止中</span>}
                                </div>
                                <div className="text-xs text-gray-400 mt-1">{countText}</div>
                            </div>
                            <div className="self-center text-gray-400 text-2xl group-hover:translate-x-1 transition">›</div>
                        </button>
                    );
                })}
            </div>
        )}

        {/* 詳細モード */}
        {expandedShopId && targetShop && (
            <div className="animate-fade-in">
                <button onClick={() => { setExpandedShopId(null); setIsEditing(false); }} className="mb-4 text-gray-400 hover:text-white">← 会場一覧に戻る</button>

                <div className="bg-gray-800 rounded-xl border border-gray-600 overflow-hidden min-h-[500px]">
                    {/* タイトルバー */}
                    <div className="bg-gray-700 p-4 flex justify-between items-start relative">
                        <div className="z-10">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-yellow-400 font-mono font-bold text-xl">{targetShop.id}</span>
                                <span className={`text-xs px-2 py-0.5 rounded border ${targetShop.isOrderMode ? "bg-orange-600 text-white" : "bg-blue-600 text-white"}`}>
                                    {targetShop.isOrderMode ? "オーダー制" : targetShop.isQueueMode ? "順番待ち制" : "時間予約制"}
                                </span>
                            </div>
                            <h2 className="text-2xl font-bold text-white">{targetShop.name}</h2>
                        </div>
                        <div className="z-10 flex flex-col gap-2 items-end">
                            <button onClick={() => startEdit(targetShop)} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm shadow">⚙️ 設定編集</button>
                        </div>
                    </div>

                    <div className="p-4">
                        {/* ★★★ オーダー制の表示 ★★★ */}
                        {targetShop.isOrderMode && (
                            <div className="space-y-6">
                                {/* 1. 在庫管理エリア */}
                                <div className="bg-gray-900/50 p-4 rounded border border-gray-700">
                                    <h3 className="text-gray-400 font-bold mb-3 flex items-center gap-2">📦 在庫管理 (リアルタイム)</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {targetShop.menu?.map((item: any) => (
                                            <div key={item.id} className="bg-gray-800 p-2 rounded border border-gray-600 flex justify-between items-center">
                                                <span className="text-sm font-bold truncate">{item.name}</span>
                                                <div className="flex items-center gap-1 bg-black rounded p-1">
                                                    <span className="text-xs text-gray-500">残</span>
                                                    <input 
                                                        type="number" 
                                                        className="w-12 bg-transparent text-white text-right outline-none font-mono" 
                                                        value={item.stock} 
                                                        onChange={(e) => updateStock(targetShop, item.id, Number(e.target.value))}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* 2. 注文リスト (orders) */}
                                <div>
                                    <h3 className="text-gray-400 font-bold mb-3">📋 注文リスト ({sortedOrders.length})</h3>
                                    <div className="space-y-3">
                                        {sortedOrders.length === 0 && <div className="text-gray-500 text-center py-4">注文はまだありません</div>}
                                        {sortedOrders.map((order: any, idx: number) => {
                                            // ★お支払い強調機能
                                            const isPayment = order.status === 'payment';
                                            const isCompleted = order.status === 'completed';
                                            
                                            return (
                                                <div key={idx} className={`p-4 rounded-lg border flex flex-col md:flex-row gap-4 justify-between items-start 
                                                    ${isPayment ? 'bg-red-900/80 border-red-500 animate-pulse-slow shadow-xl shadow-red-900/40 transform scale-[1.02]' : 'bg-gray-800 border-gray-700'}
                                                    ${isCompleted ? 'opacity-60 bg-gray-900' : ''}
                                                `}>
                                                    <div>
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <span className="font-mono text-xl font-bold bg-black/30 px-2 rounded text-yellow-400">#{order.ticketId}</span>
                                                            {isPayment && <span className="text-2xl font-bold text-white bg-red-600 px-3 py-1 rounded animate-bounce">¥ お支払い待ち</span>}
                                                            {isCompleted && <span className="text-xs bg-green-900 text-green-300 px-2 py-1 rounded">完了済み</span>}
                                                            <span className="text-xs text-gray-400">{new Date(order.timestamp).toLocaleTimeString()}</span>
                                                        </div>
                                                        {/* 注文内容 */}
                                                        <ul className="text-sm space-y-1 mb-2">
                                                            {order.items?.map((it: any, i: number) => (
                                                                <li key={i} className="flex gap-2 text-gray-300">
                                                                    <span>・{it.name}</span>
                                                                    <span className="text-gray-500">x{it.count}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                        <div className="text-lg font-bold">合計: ¥{order.total}</div>
                                                    </div>
                                                    
                                                    {!isCompleted && (
                                                        <button 
                                                            onClick={() => completeOrder(targetShop, order)}
                                                            className="bg-gray-700 hover:bg-green-600 hover:text-white text-gray-300 border border-gray-600 px-6 py-4 rounded text-lg font-bold transition w-full md:w-auto"
                                                        >
                                                            完了にする
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                       {/* --- ここまでが詳細画面のロジック --- */}
                    </div>
                </div>
            </div>
        )}

        {/* ▼▼▼ 追加: 設定編集・新規作成モーダル ▼▼▼ */}
        {isEditing && editingShop && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                    
                    {/* モーダルヘッダー */}
                    <div className="bg-gray-900 px-6 py-4 border-b border-gray-700 flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-xl text-white flex items-center gap-2">
                            {editingShop.id ? '⚙️ 店舗設定を編集' : '✨ 新規店舗を作成'}
                        </h3>
                        <button 
                            onClick={() => setIsEditing(false)} 
                            className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 w-8 h-8 rounded-full flex items-center justify-center transition"
                        >
                            ✕
                        </button>
                    </div>
                    
                    {/* フォーム部分 (スクロール可能に) */}
                    <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
                        {/* 店舗名 */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1.5 ml-1">店舗・ブース名</label>
                            <input 
                                type="text" 
                                value={editingShop.name} 
                                onChange={(e) => setEditingShop({...editingShop, name: e.target.value})}
                                className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition placeholder-gray-500"
                                placeholder="例: 第一会議室 / メインステージ前売店"
                            />
                        </div>

                        {/* 運用モード切替 */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1.5 ml-1">運用モード</label>
                                <select 
                                    value={editingShop.isQueueMode ? "queue" : "time"} 
                                    onChange={(e) => setEditingShop({...editingShop, isQueueMode: e.target.value === "queue"})}
                                    className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="queue">📋 順番待ち (行列)</option>
                                    <option value="time">⏰ 時間枠予約 (Slots)</option>
                                </select>
                            </div>
                            
                            {/* キャパシティ */}
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1.5 ml-1">
                                    {editingShop.isQueueMode ? "案内目安 (組/回)" : "定員 (名/枠)"}
                                </label>
                                <input 
                                    type="number" 
                                    min="1"
                                    value={editingShop.capacity} 
                                    onChange={(e) => setEditingShop({...editingShop, capacity: Number(e.target.value)})}
                                    className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        {/* 時間枠設定 (時間予約モードの場合のみ表示) */}
                        {!editingShop.isQueueMode && (
                            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-3">
                                <p className="text-xs text-blue-300 font-bold flex items-center gap-1">
                                    ℹ️ 時間枠設定 (カンマ区切りで入力)
                                </p>
                                <textarea
                                    value={editingShop.timeSlots ? editingShop.timeSlots.join(", ") : ""}
                                    onChange={(e) => {
                                        const slots = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
                                        setEditingShop({...editingShop, timeSlots: slots});
                                    }}
                                    className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-sm text-white h-20 font-mono"
                                    placeholder="10:00, 11:00, 12:00..."
                                />
                            </div>
                        )}

                        {/* 説明文 */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1.5 ml-1">説明文・注意事項</label>
                            <textarea 
                                value={editingShop.description} 
                                onChange={(e) => setEditingShop({...editingShop, description: e.target.value})}
                                className="w-full bg-gray-700/50 border border-gray-600 rounded-lg p-4 text-white h-28 outline-none resize-none focus:ring-2 focus:ring-blue-500"
                                placeholder="ユーザーに表示される説明文を入力してください..."
                            />
                        </div>
                    </div>

                    {/* アクションボタン */}
                    <div className="bg-gray-900 px-6 py-4 border-t border-gray-700 flex justify-end gap-3 shrink-0">
                        <button 
                            onClick={() => setIsEditing(false)} 
                            className="px-5 py-2.5 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition"
                        >
                            キャンセル
                        </button>
                        <button 
                            onClick={saveShop} 
                            className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm px-8 py-2.5 rounded-lg shadow-lg shadow-blue-900/50 transition transform active:scale-95"
                        >
                            保存する
                        </button>
                    </div>
                </div>
            </div>
        )}
        {/* ▲▲▲ 追加終わり ▲▲▲ */}

      </div>
    </div>
  );
}
