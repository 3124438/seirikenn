// #生徒用管理画面 (app/debug/page.tsx)
"use client";
import { useState, useEffect } from "react";
// 階層に合わせてパスを調整
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

  // ★既存: 運用モード（false: 時間予約制, true: 順番待ち制）
  const [isQueueMode, setIsQueueMode] = useState(false);
  // ★追加: オーダー制モード
  const [isOrderMode, setIsOrderMode] = useState(false);

  // ★追加: メニュー登録用ステート
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [menuInput, setMenuInput] = useState({ name: "", price: 0, stock: 0, limit: 1 });

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
  
  // 1. ブラックリスト判定 (trueならBANされている)
  const isUserBlacklisted = (shop: any) => {
      return shop?.adminBannedUsers?.includes(myUserId);
  };
  // 2. ホワイトリスト判定 (trueなら許可されていない)
  const isUserNotWhitelisted = (shop: any) => {
      // ホワイトリストモード(isRestricted)かつ、許可リスト(allowedUsers)に含まれていない場合
      if (shop.isRestricted) {
          return !shop.allowedUsers?.includes(myUserId);
      }
      return false;
  };
  // 3. 管理者限定モード判定 (trueなら許可されていない)
  const isAdminRestrictedAndNotAllowed = (shop: any) => {
      if (shop.isAdminRestricted) {
          return !shop.adminAllowedUsers?.includes(myUserId);
      }
      return false;
  };

  // --- 権限チェック付き: 会場展開 ---
  const handleExpandShop = (shopId: string) => {
      const shop = attractions.find(s => s.id === shopId);
      if (!shop) return;

      // --- 入室不可チェック ---
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
      // ----------------------

      // パスワード認証 (入室前に必ず確認)
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
    setIsOrderMode(false); // ★初期化
    setMenuItems([]); // ★初期化
    setMenuInput({ name: "", price: 0, stock: 0, limit: 1 });
  };

  const startEdit = (shop: any) => {
    // 編集時も権限チェック
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
    setIsOrderMode(shop.isOrderMode || false); // ★モード読み込み
    setMenuItems(shop.menu || []); // ★メニュー読み込み
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ★追加: メニュー編集ハンドラ
  const addMenuItem = () => {
      if (!menuInput.name) return alert("品名を入力してください");
      setMenuItems([...menuItems, { ...menuInput, id: Date.now().toString() }]);
      setMenuInput({ name: "", price: 0, stock: 0, limit: 1 });
  };
  const removeMenuItem = (index: number) => {
      const newItems = [...menuItems];
      newItems.splice(index, 1);
      setMenuItems(newItems);
  };

  // ★今回追加: メニューの項目（価格・在庫）を直接変更するハンドラ
  const handleMenuChange = (index: number, field: string, value: string) => {
      const newItems = [...menuItems];
      newItems[index] = {
          ...newItems[index],
          [field]: Number(value) // 数値として保存
      };
      setMenuItems(newItems);
  };

  const handleSave = async () => {
    if (!isEditing) return alert("新規会場の作成は無効化されています。");
    const currentShop = attractions.find(s => s.id === manualId);
    
    // 保存時も権限チェック
    if (currentShop && (isUserBlacklisted(currentShop) || isUserNotWhitelisted(currentShop))) {
        return alert("権限がないため保存できません。");
    }

    if (!manualId || !newName || !password) return alert("必須項目を入力してください");
    if (password.length !== 5) return alert("パスワードは5桁です");

    let slots: any = {};
    let shouldResetSlots = true;

    // 時間予約制の場合のみスロット計算を行う (OrderModeでもなくQueueModeでもない場合)
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
        // 順番待ち・オーダーモードならスロットは既存維持
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
      menu: menuItems, // ★メニュー保存
      slots // 予約制の場合は更新されたslots
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

  // --- 予約操作関連 (時間予約制用) ---
  const toggleReservationStatus = async (shop: any, res: any, newStatus: "reserved" | "used") => {
      if (isUserBlacklisted(shop) || isUserNotWhitelisted(shop)) return;
      if(!confirm(newStatus === "used" ? "入場済みにしますか？" : "入場を取り消して予約状態に戻しますか？")) return;

      const otherRes = shop.reservations.filter((r: any) => r.timestamp !== res.timestamp);
      const updatedRes = { ...res, status: newStatus };
      
      await updateDoc(doc(db, "attractions", shop.id), {
          reservations: [...otherRes, updatedRes]
      });
  };

  const cancelReservation = async (shop: any, res: any) => {
      if (isUserBlacklisted(shop) || isUserNotWhitelisted(shop)) return;
      if(!confirm(`User ID: ${res.userId}\nこの予約を削除しますか？`)) return;

      const otherRes = shop.reservations.filter((r: any) => r.timestamp !== res.timestamp);
      const updatedSlots = { ...shop.slots, [res.time]: Math.max(0, shop.slots[res.time] - 1) };
      
      await updateDoc(doc(db, "attractions", shop.id), {
          reservations: otherRes,
          slots: updatedSlots
      });
  };

  // --- 順番待ち操作関連 (Queue System) ---
  const handleQueueAction = async (shop: any, ticket: any, action: "call" | "enter" | "cancel") => {
      if (isUserBlacklisted(shop) || isUserNotWhitelisted(shop)) return;

      let confirmMsg = "";
      if (action === "call") confirmMsg = `Ticket No.${ticket.ticketId}\n呼び出しを行いますか？（ユーザー画面が赤くなります）`;
      if (action === "enter") confirmMsg = `Ticket No.${ticket.ticketId}\n入場済みにしますか？（列から削除されます）`;
      if (action === "cancel") confirmMsg = `Ticket No.${ticket.ticketId}\n強制取り消ししますか？（列から削除されます）`;

      if (!confirm(confirmMsg)) return;

      const currentQueue = shop.queue || [];
      let updatedQueue = [];

      if (action === "call") {
          updatedQueue = currentQueue.map((t: any) => 
              t.ticketId === ticket.ticketId ? { ...t, status: "ready" } : t
          );
      } else {
          updatedQueue = currentQueue.filter((t: any) => t.ticketId !== ticket.ticketId);
      }

      await updateDoc(doc(db, "attractions", shop.id), {
          queue: updatedQueue
      });
  };

  // --- ★追加: オーダー制・在庫管理関連 ---
  const updateStock = async (shop: any, itemIndex: number, newStock: number) => {
      const updatedMenu = [...shop.menu];
      updatedMenu[itemIndex].stock = newStock;
      await updateDoc(doc(db, "attractions", shop.id), {
          menu: updatedMenu
      });
  };

  // --- 表示用ヘルパー ---
  const targetShop = attractions.find(s => s.id === expandedShopId);

  const getReservationsByTime = (shop: any) => {
      const grouped: any = {};
      Object.keys(shop.slots || {}).sort().forEach(time => {
          grouped[time] = [];
      });
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
            <h1 className="text-2xl font-bold text-white mb-4">予約管理</h1>
            
            {isEditing ? (
                <div className="bg-gray-800 rounded-lg p-4 border border-blue-500 mb-4 animate-fade-in shadow-lg shadow-blue-900/20">
                    <h3 className="text-sm font-bold mb-4 text-blue-300 flex items-center gap-2 border-b border-gray-700 pb-2">
                        <span>✏️ 設定編集モード</span>
                        <span className="text-gray-500 text-xs font-normal ml-auto">ID: {manualId}</span>
                    </h3>
                    
                    {/* ★★★ 入力フォーム（ラベル・説明付き） ★★★ */}
                    {/* 1. 変更不可情報（ID, Pass） */}
                    <div className="grid gap-4 md:grid-cols-2 mb-4 bg-gray-900/50 p-3 rounded border border-gray-700">
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-500 mb-1">会場ID <span className="text-[10px] bg-gray-700 px-1 rounded text-gray-400">変更不可</span></label>
                            <input 
                                disabled 
                                className="bg-gray-800 p-2 rounded text-gray-400 cursor-not-allowed border border-gray-700 font-mono" 
                                value={manualId} 
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-500 mb-1">管理者Pass <span className="text-[10px] bg-gray-700 px-1 rounded text-gray-400">変更不可</span></label>
                            <input 
                                disabled 
                                className="bg-gray-800 p-2 rounded text-gray-400 cursor-not-allowed border border-gray-700 font-mono" 
                                value={password} 
                            />
                        </div>
                    </div>

                    {/* 2. 基本情報 */}
                    <div className="grid gap-4 md:grid-cols-2 mb-4">
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-400 mb-1">会場名 <span className="text-red-500 text-[10px] border border-red-500/50 px-1 rounded ml-1">必須</span></label>
                            <input 
                                className="bg-gray-700 p-2 rounded text-white border border-gray-600 focus:border-blue-500 outline-none" 
                                placeholder="会場名" 
                                value={newName} 
                                onChange={e => setNewName(e.target.value)} 
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-500 mb-1">団体・クラス名 <span className="text-[10px] bg-gray-700 px-1 rounded text-gray-400">変更不可</span></label>
                            <input 
                                disabled 
                                className="bg-gray-800 p-2 rounded text-gray-400 cursor-not-allowed border border-gray-700" 
                                value={department} 
                            />
                        </div>
                    </div>

                    {/* 3. 画像URL */}
                    <div className="mb-4">
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-400 mb-1">画像URL (Google Drive等) <span className="text-gray-500 text-[10px] border border-gray-600 px-1 rounded ml-1">任意</span></label>
                            <input 
                                className="bg-gray-700 p-2 rounded text-white border border-gray-600 focus:border-blue-500 outline-none w-full" 
                                placeholder="https://..." 
                                value={imageUrl} 
                                onChange={e => setImageUrl(convertGoogleDriveLink(e.target.value))} 
                            />
                        </div>
                    </div>

                    {/* 4. 説明文 (追加) */}
                    <div className="mb-4">
                      <label className="text-xs text-gray-400 mb-1 block">会場説明文 <span className="text-gray-500 text-[10px] border border-gray-600 px-1 rounded ml-1">任意</span> <span className="text-[10px] text-gray-500 ml-1">※最大500文字</span></label>
                      <textarea 
                          className="w-full bg-gray-700 p-2 rounded text-white h-24 text-sm border border-gray-600 focus:border-blue-500 outline-none resize-none"
                          placeholder="会場のアピールポイントや注意事項を入力してください。"
                          maxLength={500}
                          value={description}
                          onChange={e => setDescription(e.target.value)}
                      />
                      <div className="text-right text-xs text-gray-500">{description.length}/500</div>
                    </div>

                    {/* ★ 運用モード設定 ★ */}
                    <div className="bg-gray-750 p-3 rounded border border-gray-600 mb-4 bg-gray-900/30">
                          <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Operation Mode</h4>
                          
                          {/* モード選択ラジオボタン風UI */}
                          <div className="flex gap-2 mb-4 bg-gray-800 p-1 rounded-lg border border-gray-700 inline-flex">
                              <button 
                                onClick={() => { setIsQueueMode(false); setIsOrderMode(false); }}
                                className={`px-4 py-2 rounded text-xs font-bold transition ${!isQueueMode && !isOrderMode ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-white"}`}
                              >
                                🕒 時間予約制
                              </button>
                              <button 
                                onClick={() => { setIsQueueMode(true); setIsOrderMode(false); }}
                                className={`px-4 py-2 rounded text-xs font-bold transition ${isQueueMode ? "bg-green-600 text-white shadow" : "text-gray-400 hover:text-white"}`}
                              >
                                🔢 順番待ち制
                              </button>
                              <button 
                                onClick={() => { setIsQueueMode(false); setIsOrderMode(true); }}
                                className={`px-4 py-2 rounded text-xs font-bold transition ${isOrderMode ? "bg-orange-600 text-white shadow" : "text-gray-400 hover:text-white"}`}
                              >
                                🛒 オーダー制
                              </button>
                          </div>
                          
                          {/* 緊急停止スイッチ */}
                          <div className="flex items-center gap-2 bg-gray-800 px-3 py-2 rounded border border-gray-700 w-fit">
                                <input type="checkbox" checked={isPaused} onChange={e => setIsPaused(e.target.checked)} className="accent-red-500 w-4 h-4 cursor-pointer" />
                                <span className={`text-xs font-bold ${isPaused ? "text-red-400" : "text-gray-400"}`}>⛔ 受付を緊急停止</span>
                          </div>
                    </div>

                    {/* ★追加: オーダー制用 メニュー登録フォーム ★ */}
                    {isOrderMode && (
                        <div className="bg-gray-750 p-3 rounded border border-orange-600/30 mb-4 bg-orange-900/10">
                            <h4 className="text-xs font-bold text-orange-400 mb-2 uppercase tracking-wider">Menu Registration (オーダー制のみ)</h4>
                            
                            {/* 新規追加フォーム */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end mb-2">
                                <div className="col-span-2 md:col-span-2">
                                    <label className="text-[10px] text-gray-400">品名</label>
                                    <input className="w-full bg-gray-700 p-1.5 rounded text-sm outline-none border border-gray-600" 
                                        placeholder="焼きそば"
                                        value={menuInput.name} onChange={e => setMenuInput({...menuInput, name: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-400">価格</label>
                                    <input type="number" className="w-full bg-gray-700 p-1.5 rounded text-sm outline-none border border-gray-600" 
                                        value={menuInput.price} onChange={e => setMenuInput({...menuInput, price: Number(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-400">在庫</label>
                                    <input type="number" className="w-full bg-gray-700 p-1.5 rounded text-sm outline-none border border-gray-600" 
                                        value={menuInput.stock} onChange={e => setMenuInput({...menuInput, stock: Number(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-400">購入制限</label>
                                    <input type="number" className="w-full bg-gray-700 p-1.5 rounded text-sm outline-none border border-gray-600" 
                                        value={menuInput.limit} onChange={e => setMenuInput({...menuInput, limit: Number(e.target.value)})}
                                    />
                                </div>
                            </div>
                            <button onClick={addMenuItem} className="w-full bg-gray-700 hover:bg-orange-600 text-xs py-2 rounded mb-3 transition">＋ メニューを追加</button>

                            {/* 登録済みメニューリスト（ここを編集可能に変更） */}
                            <div className="space-y-1">
                                {menuItems.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-gray-800 p-2 rounded border border-gray-700 text-sm">
                                        <div className="flex gap-2 items-center flex-1 overflow-hidden">
                                            {/* 名前 */}
                                            <span className="font-bold min-w-[80px] truncate">{item.name}</span>
                                            
                                            {/* 価格編集 */}
                                            <div className="flex items-center gap-1">
                                                <span className="text-gray-500 text-xs">¥</span>
                                                <input 
                                                    type="number"
                                                    value={item.price}
                                                    onChange={(e) => handleMenuChange(idx, "price", e.target.value)}
                                                    className="w-16 bg-gray-900 border border-gray-600 rounded px-1 py-0.5 text-right text-xs outline-none focus:border-orange-500"
                                                />
                                            </div>

                                            {/* 在庫編集 */}
                                            <div className="flex items-center gap-1">
                                                <span className="text-gray-500 text-xs">在庫</span>
                                                <input 
                                                    type="number"
                                                    value={item.stock}
                                                    onChange={(e) => handleMenuChange(idx, "stock", e.target.value)}
                                                    className="w-16 bg-gray-900 border border-gray-600 rounded px-1 py-0.5 text-right text-xs outline-none focus:border-orange-500"
                                                />
                                            </div>

                                            <span className="text-gray-500 text-xs whitespace-nowrap">限:{item.limit}</span>
                                        </div>
                                        <button onClick={() => removeMenuItem(idx)} className="text-red-400 text-xs hover:text-red-300 ml-2">削除</button>
                                    </div>
                                ))}
                                {menuItems.length === 0 && <div className="text-center text-xs text-gray-500 py-2">メニューが登録されていません</div>}
                            </div>
                        </div>
                    )}

                    {/* 5. 時間・予約設定 (予約制のみ) */}
                    {!isQueueMode && !isOrderMode && (
                        <div className="bg-gray-750 p-3 rounded border border-gray-600 mb-4 bg-gray-900/30">
                            <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Time Settings (予約制のみ)</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                                <div className="flex flex-col">
                                    <label className="text-[10px] text-gray-400 mb-1">開始時間 <span className="text-red-500">*</span></label>
                                    <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} className="bg-gray-700 p-2 rounded text-sm outline-none border border-gray-600 focus:border-blue-500"/>
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-[10px] text-gray-400 mb-1">終了時間 <span className="text-red-500">*</span></label>
                                    <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} className="bg-gray-700 p-2 rounded text-sm outline-none border border-gray-600 focus:border-blue-500"/>
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-[10px] text-gray-400 mb-1">1枠の時間(分) <span className="text-red-500">*</span></label>
                                    <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} className="bg-gray-700 p-2 rounded text-sm outline-none border border-gray-600 focus:border-blue-500" placeholder="分"/>
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-[10px] text-gray-400 mb-1">枠ごとの定員(組) <span className="text-red-500">*</span></label>
                                    <input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} className="bg-gray-700 p-2 rounded text-sm outline-none border border-gray-600 focus:border-blue-500" placeholder="定員"/>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* 人数制限は共通利用（オーダー制以外） */}
                    {!isOrderMode && (
                        <div className="bg-gray-750 p-3 rounded border border-gray-600 mb-4 bg-gray-900/30 flex items-center gap-4">
                             <div className="flex flex-col">
                                <label className="text-[10px] text-gray-400 mb-1">1組の最大人数</label>
                                <input type="number" value={groupLimit} onChange={e => setGroupLimit(Number(e.target.value))} className="w-20 bg-gray-700 p-2 rounded text-sm outline-none text-center border border-gray-600 focus:border-blue-500" />
                             </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button onClick={handleSave} className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 py-3 rounded font-bold transition shadow-lg shadow-blue-900/40">変更を保存</button>
                        <button onClick={resetForm} className="bg-gray-700 hover:bg-gray-600 px-6 rounded text-sm transition border border-gray-600">キャンセル</button>
                    </div>
                </div>
            ) : (
                <div className="bg-gray-800/50 rounded p-3 mb-4 border border-gray-700 text-center text-xs text-gray-500">
                    ※設定を変更するには、下のリストから会場を選び「設定編集」ボタンを押してください。
                </div>
            )}

            {/* ユーザーID検索 */}
            <div className="flex gap-2 items-center bg-gray-800 p-2 rounded border border-gray-600">
                <span className="text-xl">🔍</span>
                <input 
                    className="flex-1 bg-transparent text-white outline-none" 
                    placeholder="ユーザーIDまたはチケットID(6桁)を入力" 
                    value={searchUserId} 
                    onChange={e => setSearchUserId(e.target.value)} 
                />
                {searchUserId && (
                    <div className="text-xs text-pink-400 font-bold animate-pulse">
                        ※該当チケットをハイライトします
                    </div>
                )}
            </div>
        </div>

        {/* --- メインエリア --- */}
        
        {/* 1. 一覧モード（詳細が開かれていない時） */}
        {!expandedShopId && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {attractions.map(shop => {
                    // 検索ヒット判定
                    const hitInRes = shop.reservations?.some((r:any) => r.userId?.includes(searchUserId.toUpperCase()));
                    const hitInQueue = shop.queue?.some((q:any) => q.userId?.includes(searchUserId.toUpperCase()) || q.ticketId?.includes(searchUserId.toUpperCase()));
                    const hitInOrder = shop.orders?.some((o:any) => o.userId?.includes(searchUserId.toUpperCase()) || o.id?.includes(searchUserId.toUpperCase()));
                    const hasUser = searchUserId && (hitInRes || hitInQueue || hitInOrder);
                    
                    const blacklisted = isUserBlacklisted(shop);     // ブラックリストに入っている
                    const notWhitelisted = isUserNotWhitelisted(shop); // ホワイトリストモードなのにリストにいない
                    const adminRestricted = isAdminRestrictedAndNotAllowed(shop); // 管理者モード制限
                    const isLocked = blacklisted || notWhitelisted || adminRestricted;

                    return (
                        <button 
                            key={shop.id} 
                            onClick={() => handleExpandShop(shop.id)} 
                            className={`group p-4 rounded-xl border text-left flex items-start gap-4 transition hover:bg-gray-800 relative overflow-hidden
                                ${hasUser ? 'bg-pink-900/40 border-pink-500' : 'bg-gray-800 border-gray-600'}
                                ${isLocked ? 'opacity-70 bg-gray-900 grayscale' : ''}
                            `}
                        >
                            {/* 画像サムネイル (あれば) */}
                            {shop.imageUrl ? (
                                <img src={shop.imageUrl} alt="" className="w-16 h-16 rounded object-cover bg-gray-700 flex-shrink-0" />
                            ) : (
                                <div className="w-16 h-16 rounded bg-gray-700 flex items-center justify-center text-2xl flex-shrink-0">🎪</div>
                            )}
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="text-yellow-400 font-bold font-mono text-xl">{shop.id}</span>
                                    
                                    {/* 団体名バッジ */}
                                    {shop.department && (
                                        <span className="text-xs bg-blue-900/50 text-blue-200 px-2 py-0.5 rounded border border-blue-800/50 truncate max-w-[100px]">
                                            {shop.department}
                                        </span>
                                    )}
                                </div>
                                <h2 className="text-lg font-bold truncate mb-1 group-hover:text-blue-400 transition">{shop.name}</h2>
                                
                                {/* 簡易ステータス表示 */}
                                <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                                    {shop.isPaused && <span className="text-red-400 font-bold">⛔ 受付停止中</span>}
                                    {shop.isQueueMode && <span className="text-green-400">🔢 順番待ち制</span>}
                                    {shop.isOrderMode && <span className="text-orange-400">🛒 オーダー制</span>}
                                    {!shop.isQueueMode && !shop.isOrderMode && <span>🕒 予約制</span>}
                                    {isLocked && <span className="text-gray-500">🔒 権限なし</span>}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        )}

        {/* 2. 詳細・管理モード (expandedShopIdがある場合) */}
        {expandedShopId && targetShop && (
            <div className="animate-fade-in-up">
                <button 
                    onClick={() => setExpandedShopId(null)} 
                    className="mb-4 text-sm text-gray-400 hover:text-white flex items-center gap-1"
                >
                    ← 一覧に戻る
                </button>
                
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 shadow-xl relative overflow-hidden">
                    <div className="flex justify-between items-start mb-6 border-b border-gray-700 pb-4">
                        <div>
                             <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-2xl font-bold">{targetShop.name}</h2>
                                <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded font-mono">ID: {targetShop.id}</span>
                             </div>
                             <p className="text-sm text-gray-400">{targetShop.department}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <button 
                                onClick={() => startEdit(targetShop)}
                                className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded shadow transition"
                            >
                                ✏️ 設定編集
                            </button>
                            <button 
                                onClick={() => handleDeleteVenue(targetShop.id)}
                                className="text-red-400 text-xs hover:text-red-300 underline"
                            >
                                会場を削除
                            </button>
                        </div>
                    </div>

                    {/* --- ここに各モードごとの管理UIが入ります（省略されていた部分の補完） --- */}
                    {targetShop.isOrderMode ? (
                        /* オーダー制の管理画面 */
                        <div>
                            <h3 className="text-orange-400 font-bold mb-4">📦 オーダー在庫管理</h3>
                            <div className="space-y-2">
                                {targetShop.menu?.map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between items-center bg-gray-900 p-3 rounded border border-gray-700">
                                        <div className="font-bold">{item.name}</div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-sm text-gray-400">¥{item.price}</div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500">在庫:</span>
                                                {/* ここでも簡易的に在庫増減できるようにボタンを配置 */}
                                                <button onClick={() => updateStock(targetShop, idx, Math.max(0, item.stock - 1))} className="w-6 h-6 bg-gray-700 rounded text-center">-</button>
                                                <span className="w-8 text-center font-mono">{item.stock}</span>
                                                <button onClick={() => updateStock(targetShop, idx, item.stock + 1)} className="w-6 h-6 bg-gray-700 rounded text-center">+</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {(!targetShop.menu || targetShop.menu.length === 0) && <div className="text-gray-500 text-center">メニューがありません</div>}
                            </div>
                        </div>
                    ) : targetShop.isQueueMode ? (
                         /* 順番待ちの管理画面 */
                        <div>
                            <h3 className="text-green-400 font-bold mb-4">🔢 順番待ち管理</h3>
                            {(!targetShop.queue || targetShop.queue.length === 0) ? (
                                <div className="text-gray-500 text-center py-8">待ち列はありません</div>
                            ) : (
                                <div className="space-y-2">
                                    {targetShop.queue.map((ticket: any) => (
                                        <div key={ticket.ticketId} className="flex justify-between items-center bg-gray-900 p-3 rounded border border-gray-700">
                                            <div>
                                                <div className="font-mono text-xl text-yellow-400">No.{ticket.ticketId}</div>
                                                <div className="text-xs text-gray-500">User: {ticket.userId}</div>
                                            </div>
                                            <div className="flex gap-2">
                                                {ticket.status !== "ready" && (
                                                    <button onClick={() => handleQueueAction(targetShop, ticket, "call")} className="bg-yellow-600 hover:bg-yellow-500 px-3 py-1 rounded text-sm">呼出</button>
                                                )}
                                                <button onClick={() => handleQueueAction(targetShop, ticket, "enter")} className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded text-sm">入場</button>
                                                <button onClick={() => handleQueueAction(targetShop, ticket, "cancel")} className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm">取消</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* 時間予約制の管理画面 */
                        <div>
                            <h3 className="text-blue-400 font-bold mb-4">🕒 予約枠管理</h3>
                             <div className="grid gap-4">
                                {Object.entries(getReservationsByTime(targetShop)).map(([time, resList]: [string, any]) => (
                                    <div key={time} className="bg-gray-900 p-3 rounded border border-gray-700">
                                        <div className="flex justify-between items-center mb-2 border-b border-gray-800 pb-1">
                                            <span className="font-mono text-lg font-bold">{time}</span>
                                            <span className="text-xs text-gray-400">予約: {resList.length} / {targetShop.slots?.[time] !== undefined ? (Number(targetShop.slots[time]) + resList.length) : "-"}</span>
                                        </div>
                                        {resList.length === 0 ? (
                                            <div className="text-xs text-gray-600">予約なし</div>
                                        ) : (
                                            <div className="space-y-2">
                                                {resList.map((res: any, i: number) => (
                                                    <div key={i} className="flex justify-between items-center text-sm bg-gray-800 p-2 rounded">
                                                        <span className="font-mono text-gray-300">{res.userId}</span>
                                                        <div className="flex gap-2">
                                                            {res.status === "used" ? (
                                                                <button onClick={() => toggleReservationStatus(targetShop, res, "reserved")} className="text-green-500 text-xs border border-green-500 px-2 py-0.5 rounded">入場済</button>
                                                            ) : (
                                                                <button onClick={() => toggleReservationStatus(targetShop, res, "used")} className="bg-blue-600 hover:bg-blue-500 px-2 py-0.5 rounded text-xs">入場する</button>
                                                            )}
                                                            <button onClick={() => cancelReservation(targetShop, res)} className="text-red-400 hover:text-red-300 text-xs">削除</button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                             </div>
                        </div>
                    )}

                </div>
            </div>
        )}

      </div>
    </div>
  );
}
