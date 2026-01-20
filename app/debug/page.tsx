// #生徒用管理画面 (app/debug/page.tsx)
"use client";
import { useState, useEffect } from "react";
// 階層に合わせてパスを調整
import { db, auth } from "../../firebase"; 
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

// 分割したコンポーネントをインポート
import AdminEditForm from "./AdminEditForm";
import ShopList from "./ShopList";
import ShopDetail from "./ShopDetail";

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

  // ★追加: 運用モード（false: 時間予約制, true: 順番待ち制）
  const [isQueueMode, setIsQueueMode] = useState(false);

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
    setIsQueueMode(false); // 初期化
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
    setIsQueueMode(shop.isQueueMode || false); // モード読み込み
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

    // 時間予約制の場合のみスロット計算を行う
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
        // 順番待ちモードならスロットは既存維持か空にする（ここでは既存維持しつつモード優先）
        slots = currentShop?.slots || {}; 
    }

    const data: any = {
      name: newName, 
      department,
      imageUrl,
      description, 
      password, groupLimit,
      openTime, closeTime, duration, capacity, isPaused,
      isQueueMode, // ★保存
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

  // --- ★追加: 順番待ち操作関連 (Queue System) ---
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
          // ステータスを更新して維持
          updatedQueue = currentQueue.map((t: any) => 
              t.ticketId === ticket.ticketId ? { ...t, status: "ready" } : t
          );
      } else {
          // enter (強制入場) または cancel (強制取消) はリストから削除
          updatedQueue = currentQueue.filter((t: any) => t.ticketId !== ticket.ticketId);
      }

      await updateDoc(doc(db, "attractions", shop.id), {
          queue: updatedQueue
      });
  };

  // --- 表示用ヘルパー ---
  const targetShop = attractions.find(s => s.id === expandedShopId);

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
            
            {/* 分割コンポーネント: 編集フォーム */}
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
            <ShopList
              attractions={attractions}
              searchUserId={searchUserId}
              handleExpandShop={handleExpandShop}
              isUserBlacklisted={isUserBlacklisted}
              isUserNotWhitelisted={isUserNotWhitelisted}
              isAdminRestrictedAndNotAllowed={isAdminRestrictedAndNotAllowed}
            />
        )}

        {/* 2. 詳細モード（会場が選択された時） */}
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
      </div>
    </div>
  );
}
