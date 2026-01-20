import { useState, useEffect, useMemo } from "react";
// 階層に合わせてパスを調整してください
import { db, auth } from "../../../firebase"; 
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

// GoogleドライブのURLを自動変換する関数
export const convertGoogleDriveLink = (url: string) => {
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

export const useAdminLogic = () => {
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

  // ★追加: 運用モード（予約制 or 順番待ち制）
  const [isQueueMode, setIsQueueMode] = useState(false);

  // 検索用
  const [searchUserId, setSearchUserId] = useState("");

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
    return () => unsub();
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
    let existingReservations = [];
    let existingQueue = [];

    if (isEditing) {
        const currentShop = attractions.find(s => s.id === originalId);
        if (currentShop) {
            existingReservations = currentShop.reservations || [];
            existingQueue = currentShop.queue || []; 
            if (currentShop.openTime === openTime && currentShop.closeTime === closeTime && currentShop.duration === duration) {
                slots = currentShop.slots;
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
      isQueueMode, 
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

  // --- 予約操作 (従来モード用) ---
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

  // --- ★ 順番待ちキュー操作 (修正済み) ---
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

  const targetShop = attractions.find(s => s.id === expandedShopId);

  return {
    attractions, myUserId,
    expandedShopId, setExpandedShopId,
    isEditing, setIsEditing, originalId,
    manualId, setManualId, newName, setNewName, password, setPassword,
    department, setDepartment, imageUrl, setImageUrl, description, setDescription,
    groupLimit, setGroupLimit, openTime, setOpenTime, closeTime, setCloseTime,
    duration, setDuration, capacity, setCapacity, isPaused, setIsPaused,
    isQueueMode, setIsQueueMode,
    searchUserId, setSearchUserId,
    stats,
    handleBulkPause, handleBulkDeleteReservations, handleBulkDeleteVenues,
    resetForm, startEdit, handleSave, handleDeleteVenue,
    toggleReservationStatus, cancelReservation, updateQueueStatus,
    targetShop
  };
};
