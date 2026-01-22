// #生徒用管理画面 (app/debug/page.tsx)
"use client";
import { useState, useEffect } from "react";
// 階層に合わせてパスを調整
import { db, auth } from "../../firebase"; 
import { 
    collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, 
    serverTimestamp, runTransaction, increment 
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

// 分割したコンポーネントをインポート
import AdminEditForm from "./AdminEditForm";
import ShopList from "./ShopList";
import ShopDetail from "./ShopDetail";

// --- Constants (仕様書 Section 2) ---
const LIMIT_TIME_MINUTES = 30;

export default function AdminPage() {
  // ---------------------------------------------------------
  // 既存ステート (Attractions / Users)
  // ---------------------------------------------------------
  const [attractions, setAttractions] = useState<any[]>([]);
  const [myUserId, setMyUserId] = useState("");
  const [isGlobalBanned, setIsGlobalBanned] = useState(false);
  const [expandedShopId, setExpandedShopId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  
  // 編集フォーム用ステート
  const [manualId, setManualId] = useState("");
  const [newName, setNewName] = useState("");
  const [department, setDepartment] = useState(""); 
  const [imageUrl, setImageUrl] = useState("");     
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  
  const [groupLimit, setGroupLimit] = useState(4);
  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("15:00");
  const [duration, setDuration] = useState(20);
  const [capacity, setCapacity] = useState(3);
  const [isPaused, setIsPaused] = useState(false);
  const [isQueueMode, setIsQueueMode] = useState(false);
  
  const [searchUserId, setSearchUserId] = useState("");

  // ---------------------------------------------------------
  // ★新規ステート (Order System)
  // ---------------------------------------------------------
  const [viewMode, setViewMode] = useState<"venues" | "orders">("venues"); // タブ切り替え
  const [orders, setOrders] = useState<any[]>([]);
  const [menuList, setMenuList] = useState<any[]>([]);
  const [systemMode, setSystemMode] = useState("closed"); // system settings

  // Menu編集用
  const [menuForm, setMenuForm] = useState({ name: "", price: 0, stock: 0, limit: 1 });
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);

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

    // 1. 会場データの監視
    const unsubAttractions = onSnapshot(collection(db, "attractions"), (snapshot) => {
      setAttractions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. ユーザーBAN状態の監視
    const unsubUser = onSnapshot(doc(db, "users", stored), (docSnap) => {
        if (docSnap.exists()) {
            const userData = docSnap.data();
            setIsGlobalBanned(!!userData.isBanned);
        } else {
            setIsGlobalBanned(false);
        }
    });

    // 3. ★オーダーシステムの監視 (Module 2: subscribeToOrders)
    const unsubOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
        const fetchedOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        // 並び替えはRender時に実施
        setOrders(fetchedOrders);
    });

    // 4. ★メニューの監視
    const unsubMenu = onSnapshot(collection(db, "menu"), (snapshot) => {
        setMenuList(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
        unsubAttractions();
        unsubUser();
        unsubOrders();
        unsubMenu();
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

  // =========================================================================
  // Helper Functions: Existing Venue System
  // =========================================================================
  const isUserBlacklisted = (shop: any) => shop?.adminBannedUsers?.includes(myUserId);
  const isUserNotWhitelisted = (shop: any) => shop.isRestricted ? !shop.allowedUsers?.includes(myUserId) : false;
  const isAdminRestrictedAndNotAllowed = (shop: any) => shop.isAdminRestricted ? !shop.adminAllowedUsers?.includes(myUserId) : false;

  const handleExpandShop = (shopId: string) => {
      const shop = attractions.find(s => s.id === shopId);
      if (!shop) return;
      if (isUserBlacklisted(shop)) return alert(`⛔ アクセス拒否`);
      if (isUserNotWhitelisted(shop)) return alert(`🔒 アクセス制限`);
      if (isAdminRestrictedAndNotAllowed(shop)) return alert(`🔒 管理者制限`);

      const inputPass = prompt(`「${shop.name}」の管理用パスワードを入力してください`);
      if (inputPass !== shop.password) return alert("パスワードが違います");
      setExpandedShopId(shopId);
  };

  const resetForm = () => {
    setIsEditing(false);
    setManualId(""); setNewName(""); setDepartment(""); setImageUrl(""); setDescription(""); setPassword("");
    setGroupLimit(4); setOpenTime("10:00"); setCloseTime("15:00");
    setDuration(20); setCapacity(3); setIsPaused(false);
    setIsQueueMode(false);
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async () => {
    if (!isEditing) return alert("新規会場の作成は無効化されています。");
    const currentShop = attractions.find(s => s.id === manualId);
    if (currentShop && (isUserBlacklisted(currentShop) || isUserNotWhitelisted(currentShop))) return alert("権限がないため保存できません。");
    if (!manualId || !newName || !password) return alert("必須項目を入力してください");
    if (password.length !== 5) return alert("パスワードは5桁です");

    let slots: any = {};
    let shouldResetSlots = true;
    if (!isQueueMode) {
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
      name: newName, department, imageUrl, description, password, groupLimit,
      openTime, closeTime, duration, capacity, isPaused, isQueueMode, slots
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

  const handleQueueAction = async (shop: any, ticket: any, action: "call" | "enter" | "cancel") => {
      if (isUserBlacklisted(shop) || isUserNotWhitelisted(shop)) return;
      let confirmMsg = "";
      if (action === "call") confirmMsg = `Ticket No.${ticket.ticketId}\n呼び出しを行いますか？`;
      if (action === "enter") confirmMsg = `Ticket No.${ticket.ticketId}\n入場済みにしますか？`;
      if (action === "cancel") confirmMsg = `Ticket No.${ticket.ticketId}\n強制取り消ししますか？`;
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
      await updateDoc(doc(db, "attractions", shop.id), { queue: updatedQueue });
  };

  // =========================================================================
  // ★Helper Functions: Order System (Modules 1 & 2)
  // =========================================================================

  // Module 1: Menu Management
  const handleSaveMenu = async () => {
    if (!menuForm.name || menuForm.price < 0 || menuForm.stock < 0) return alert("入力を確認してください");
    try {
        const data = { ...menuForm };
        if (editingMenuId) {
            await updateDoc(doc(db, "menu", editingMenuId), data);
        } else {
            await setDoc(doc(collection(db, "menu")), data);
        }
        setMenuForm({ name: "", price: 0, stock: 0, limit: 1 });
        setEditingMenuId(null);
    } catch (e) {
        console.error(e);
        alert("保存に失敗しました");
    }
  };

  const handleDeleteMenu = async (id: string) => {
      if (!confirm("本当にこの商品を削除しますか？")) return;
      await deleteDoc(doc(db, "menu", id));
  };

  const handleEditMenu = (item: any) => {
      setEditingMenuId(item.id);
      setMenuForm({ name: item.name, price: item.price, stock: item.stock, limit: item.limit || 1 });
  };

  // Module 2: Order Monitoring Logic
  const completePayment = async (orderId: string) => {
      if (!confirm("代金を受け取り、支払い完了にしますか？")) return;
      await updateDoc(doc(db, "orders", orderId), {
          status: "completed"
      });
  };

  const forceCancelOrder = async (orderId: string, items: any[]) => {
      if (!confirm("【警告】強制キャンセルを行います。\n在庫は自動的に戻ります。よろしいですか？")) return;
      
      try {
          await runTransaction(db, async (transaction) => {
               // 1. 在庫復元
               for (const item of items) {
                   const menuRef = doc(db, "menu", item.id);
                   transaction.update(menuRef, {
                       stock: increment(item.quantity)
                   });
               }
               // 2. ステータス更新
               const orderRef = doc(db, "orders", orderId);
               transaction.update(orderRef, {
                   status: "force_cancelled"
               });
          });
      } catch (e) {
          console.error(e);
          alert("キャンセル処理に失敗しました");
      }
  };

  const cancelOrder = async (orderId: string, items: any[]) => {
    if (!confirm("注文をキャンセルします。在庫を戻しますか？")) return;
    try {
        await runTransaction(db, async (transaction) => {
             for (const item of items) {
                 const menuRef = doc(db, "menu", item.id);
                 transaction.update(menuRef, { stock: increment(item.quantity) });
             }
             const orderRef = doc(db, "orders", orderId);
             transaction.update(orderRef, { status: "cancelled" });
        });
    } catch (e) {
        console.error(e);
        alert("キャンセル処理に失敗しました");
    }
  };

  // Sort Orders for Dashboard
  const getSortedOrders = () => {
      const now = Date.now();
      return orders.sort((a, b) => {
          // Priority 1: Paying
          if (a.status === 'paying' && b.status !== 'paying') return -1;
          if (b.status === 'paying' && a.status !== 'paying') return 1;
          
          // Priority 2: Oldest First (Ordered)
          return (a.createdAt || 0) - (b.createdAt || 0);
      });
  };

  // Render logic helper
  const isDelayed = (createdAt: number) => {
      if (!createdAt) return false;
      const elapsed = (Date.now() - createdAt) / 60000;
      return elapsed > LIMIT_TIME_MINUTES;
  };

  // =========================================================================
  // RENDER
  // =========================================================================

  const targetShop = attractions.find(s => s.id === expandedShopId);

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      
      {/* ユーザーID表示バー */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex justify-between items-center sticky top-0 z-50 shadow-md">
          <div className="text-xs text-gray-400">Logged in as:</div>
          <div className="font-mono font-bold text-yellow-400 text-lg tracking-wider">
              {myUserId || "---"}
          </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 pb-32">
        {/* --- Header & Tab Switcher --- */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-gray-700 pb-4">
            <h1 className="text-2xl font-bold text-white">管理ダッシュボード</h1>
            <div className="flex bg-gray-800 rounded-lg p-1">
                <button 
                  onClick={() => setViewMode("venues")}
                  className={`px-6 py-2 rounded-md font-bold transition ${viewMode === "venues" ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-white"}`}
                >
                    🏛 会場管理
                </button>
                <button 
                  onClick={() => setViewMode("orders")}
                  className={`px-6 py-2 rounded-md font-bold transition ${viewMode === "orders" ? "bg-green-600 text-white shadow" : "text-gray-400 hover:text-white"}`}
                >
                    🍔 オーダーシステム
                </button>
            </div>
        </div>

        {/* =================================================================
             View Mode: VENUES (Existing System)
           ================================================================= */}
        {viewMode === "venues" && (
            <>
                <div className="mb-6">
                    {/* AdminEditForm Component (Props passed as before) */}
                    <AdminEditForm
                      isEditing={isEditing}
                      manualId={manualId}
                      newName={newName} setNewName={setNewName}
                      department={department}
                      imageUrl={imageUrl} setImageUrl={setImageUrl}
                      description={description} setDescription={setDescription}
                      password={password}
                      groupLimit={groupLimit} setGroupLimit={setGroupLimit}
                      openTime={openTime} setOpenTime={setOpenTime}
                      closeTime={closeTime} setCloseTime={setCloseTime}
                      duration={duration} setDuration={setDuration}
                      capacity={capacity} setCapacity={setCapacity}
                      isPaused={isPaused} setIsPaused={setIsPaused}
                      isQueueMode={isQueueMode} setIsQueueMode={setIsQueueMode}
                      handleSave={handleSave}
                      resetForm={resetForm}
                    />

                    {/* Search */}
                    <div className="flex gap-2 items-center bg-gray-800 p-2 rounded border border-gray-600 mt-4">
                        <span className="text-xl">🔍</span>
                        <input 
                            className="flex-1 bg-transparent text-white outline-none" 
                            placeholder="ユーザーIDまたはチケットID(6桁)を入力" 
                            value={searchUserId} 
                            onChange={e => setSearchUserId(e.target.value)} 
                        />
                        {searchUserId && <div className="text-xs text-pink-400 font-bold animate-pulse">※該当チケットをハイライト</div>}
                    </div>
                </div>

                {/* 1. Shop List Mode */}
                {!expandedShopId && (
                    <ShopList
                      attractions={attractions}
                      searchUserId={searchUserId}
                      handleExpandShop={handleExpandShop}
                      isUserBlacklisted={isUserBlacklisted}
                      isUserNotWhitelisted={isUserNotWhitelisted}
                      isAdminRestrictedAndNotAllowed={isAdminRestrictedAndNotAllowed}
                    />
                )}

                {/* 2. Shop Detail Mode */}
                {expandedShopId && targetShop && (
                    <ShopDetail
                      shop={targetShop}
                      setExpandedShopId={setExpandedShopId}
                      setIsEditing={setIsEditing}
                      startEdit={startEdit}
                      handleDeleteVenue={handleDeleteVenue}
                      searchUserId={searchUserId}
                      toggleReservationStatus={toggleReservationStatus}
                      cancelReservation={cancelReservation}
                      handleQueueAction={handleQueueAction}
                    />
                )}
            </>
        )}

        {/* =================================================================
             View Mode: ORDERS (New Module 1 & 2)
           ================================================================= */}
        {viewMode === "orders" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                
                {/* --- Left Column: Menu Management (Module 1) --- */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg">
                        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                            📝 メニュー管理
                        </h2>
                        <div className="space-y-3 mb-4">
                            <div>
                                <label className="text-xs text-gray-400">商品名</label>
                                <input className="w-full bg-gray-700 p-2 rounded border border-gray-600" value={menuForm.name} onChange={e => setMenuForm({...menuForm, name: e.target.value})} />
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="text-xs text-gray-400">単価 (¥)</label>
                                    <input type="number" className="w-full bg-gray-700 p-2 rounded border border-gray-600" value={menuForm.price} onChange={e => setMenuForm({...menuForm, price: Number(e.target.value)})} />
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs text-gray-400">在庫数</label>
                                    <input type="number" className="w-full bg-gray-700 p-2 rounded border border-gray-600" value={menuForm.stock} onChange={e => setMenuForm({...menuForm, stock: Number(e.target.value)})} />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-400">購入制限 (1人あたり)</label>
                                <input type="number" className="w-full bg-gray-700 p-2 rounded border border-gray-600" value={menuForm.limit} onChange={e => setMenuForm({...menuForm, limit: Number(e.target.value)})} />
                            </div>
                            <button onClick={handleSaveMenu} className="w-full bg-blue-600 hover:bg-blue-500 py-2 rounded font-bold transition">
                                {editingMenuId ? "更新する" : "追加する"}
                            </button>
                            {editingMenuId && (
                                <button onClick={() => { setEditingMenuId(null); setMenuForm({ name: "", price: 0, stock: 0, limit: 1 }); }} className="w-full bg-gray-600 py-1 text-sm rounded">キャンセル</button>
                            )}
                        </div>

                        {/* Menu List */}
                        <div className="max-h-[400px] overflow-y-auto space-y-2">
                            {menuList.map(item => (
                                <div key={item.id} className="bg-gray-700 p-3 rounded flex justify-between items-center group">
                                    <div>
                                        <div className="font-bold">{item.name}</div>
                                        <div className="text-xs text-gray-400">
                                            ¥{item.price} | 在庫: {item.stock} | 制限: {item.limit}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 opacity-50 group-hover:opacity-100 transition">
                                        <button onClick={() => handleEditMenu(item)} className="text-blue-300 hover:text-white">🖊</button>
                                        <button onClick={() => handleDeleteMenu(item.id)} className="text-red-400 hover:text-red-200">🗑</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* --- Right Column: Order Monitor (Module 2) --- */}
                <div className="lg:col-span-2">
                    <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg min-h-[600px]">
                         <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-600">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                📡 リアルタイムオーダー
                            </h2>
                            <div className="text-sm text-gray-400">
                                待ち: <span className="text-white font-bold text-lg">{orders.filter(o => o.status === 'ordered' || o.status === 'paying').length}</span> 件
                            </div>
                         </div>

                         {/* Orders List */}
                         <div className="space-y-4">
                            {getSortedOrders().filter(o => o.status !== 'cancelled' && o.status !== 'force_cancelled').map(order => {
                                const delayed = isDelayed(order.createdAt);
                                const isPaying = order.status === 'paying';
                                const isCompleted = order.status === 'completed';

                                if (isCompleted) return null; // 完了済みは別リストにするか非表示

                                return (
                                    <div key={order.id} className={`
                                        p-4 rounded-lg border-l-4 shadow-md relative overflow-hidden transition-all
                                        ${isPaying ? "bg-yellow-900/30 border-yellow-500 animate-pulse-slow" : "bg-gray-700 border-blue-500"}
                                        ${delayed && !isPaying ? "border-red-500 ring-2 ring-red-500/50" : ""}
                                    `}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-2xl font-bold">{order.ticketId}</span>
                                                    {isPaying && <span className="bg-yellow-500 text-black text-xs px-2 py-1 rounded font-bold animate-bounce">支払い提示中！</span>}
                                                    {delayed && <span className="bg-red-600 text-white text-xs px-2 py-1 rounded font-bold">遅延・期限切れ</span>}
                                                </div>
                                                <div className="text-xs text-gray-400 mt-1">
                                                    ID: {order.id.slice(0, 6)}...
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xl font-bold text-green-400">¥{order.totalPrice.toLocaleString()}</div>
                                                <div className="text-xs text-gray-400">
                                                    {order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : "--:--"}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Items */}
                                        <div className="bg-gray-900/50 p-2 rounded mb-3 text-sm space-y-1">
                                            {order.items.map((item: any, idx: number) => (
                                                <div key={idx} className="flex justify-between">
                                                    <span>{item.name}</span>
                                                    <span className="font-bold text-gray-300">x{item.quantity}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-2 mt-2">
                                            <button 
                                                onClick={() => completePayment(order.id)}
                                                className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded shadow-lg transition transform active:scale-95"
                                            >
                                                支払い完了 (受渡)
                                            </button>
                                            
                                            {delayed ? (
                                                <button 
                                                    onClick={() => forceCancelOrder(order.id, order.items)}
                                                    className="px-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded border border-red-400"
                                                >
                                                    強制キャンセル
                                                    <span className="block text-[10px] font-normal">在庫戻し</span>
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={() => cancelOrder(order.id, order.items)}
                                                    className="px-3 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded"
                                                >
                                                    キャンセル
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            
                            {/* Completed History (Mini) */}
                            <div className="mt-8 pt-4 border-t border-gray-600">
                                <h3 className="text-gray-400 font-bold mb-2">完了済み履歴 (直近)</h3>
                                <div className="space-y-1 opacity-60">
                                    {orders.filter(o => o.status === 'completed').slice(0, 5).map(order => (
                                        <div key={order.id} className="flex justify-between text-xs bg-gray-800 p-2 rounded">
                                            <span>{order.ticketId}</span>
                                            <span>¥{order.totalPrice}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                         </div>
                    </div>
                </div>

            </div>
        )}

      </div>
    </div>
  );
}
