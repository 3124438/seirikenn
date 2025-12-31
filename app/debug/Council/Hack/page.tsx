"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../../../../firebase"; // パスは環境に合わせて調整してください
import { collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, increment, setDoc, getDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function GodModePage() {
  const [attractions, setAttractions] = useState<any[]>([]);
  const [allUserIds, setAllUserIds] = useState<string[]>([]);
  const [bannedIds, setBannedIds] = useState<string[]>([]);
  
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [targetUserTickets, setTargetUserTickets] = useState<any[]>([]);
  
  // 代理予約用
  const [proxyShopId, setProxyShopId] = useState("");
  const [proxyTime, setProxyTime] = useState("");

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);

    // 1. 出し物データの監視
    const unsubAttractions = onSnapshot(collection(db, "attractions"), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttractions(data);

      // 全予約からユニークなユーザーIDを抽出
      const ids = new Set<string>();
      data.forEach((shop: any) => {
        shop.reservations?.forEach((r: any) => ids.add(r.userId));
      });
      setAllUserIds(Array.from(ids).sort());
    });

    // 2. ブラックリストの監視 (systemコレクション -> blacklistドキュメント)
    const unsubBan = onSnapshot(doc(db, "system", "blacklist"), (docSnap) => {
      if (docSnap.exists()) {
        setBannedIds(docSnap.data().ids || []);
      }
    });

    return () => {
      unsubAttractions();
      unsubBan();
    };
  }, []);

  // ターゲットユーザーが変わったらチケット情報を再計算
  useEffect(() => {
    if (!targetUserId) {
      setTargetUserTickets([]);
      return;
    }
    const tickets: any[] = [];
    attractions.forEach((shop: any) => {
      shop.reservations?.forEach((r: any) => {
        if (r.userId === targetUserId) {
          tickets.push({ ...r, shopName: shop.name, shopId: shop.id });
        }
      });
    });
    setTargetUserTickets(tickets);
  }, [targetUserId, attractions]);


  // --- アクション ---

  // BAN / 解除 切り替え
  const toggleBan = async () => {
    if (!targetUserId) return;
    const isBanned = bannedIds.includes(targetUserId);
    const newBannedList = isBanned 
      ? bannedIds.filter(id => id !== targetUserId) // 解除
      : [...bannedIds, targetUserId]; // 追加

    await setDoc(doc(db, "system", "blacklist"), { ids: newBannedList }, { merge: true });
    alert(isBanned ? "BANを解除しました" : "このユーザーをBANしました");
  };

  // 代理予約 (強制ねじ込み)
  const handleProxyBook = async () => {
    if (!targetUserId || !proxyShopId || !proxyTime) return;
    const shop = attractions.find(s => s.id === proxyShopId);
    if (!shop) return;

    if (!confirm(`【強制予約】\nUser: ${targetUserId}\nShop: ${shop.name}\nTime: ${proxyTime}\n実行しますか？`)) return;

    try {
      // 既存の人数カウントなどは無視してねじ込むことも可能ですが、ここでは正規の手順でカウントアップさせます
      await updateDoc(doc(db, "attractions", proxyShopId), {
        [`slots.${proxyTime}`]: increment(1),
        reservations: arrayUnion({
            userId: targetUserId,
            time: proxyTime,
            timestamp: Date.now(),
            status: "reserved",
            note: "admin_proxy" // 管理者による追加の目印
        })
      });
      alert("代理予約完了");
    } catch (e) {
      console.error(e);
      alert("エラー: " + e);
    }
  };

  // 強制キャンセル
  const handleForceCancel = async (ticket: any) => {
    if(!confirm("この予約を強制削除しますか？")) return;
    try {
        await updateDoc(doc(db, "attractions", ticket.shopId), {
            [`slots.${ticket.time}`]: increment(-1),
            reservations: arrayRemove({
                userId: ticket.userId,
                time: ticket.time,
                timestamp: ticket.timestamp,
                status: ticket.status
            })
        });
        // 備考: status: "used" のものなど細かい一致が必要なので、実運用ではID検索などで厳密にやるほうが良いですが、今回は簡易版
        alert("削除しました");
    } catch(e) {
        alert("削除失敗(データ不整合の可能性あり)");
    }
  };

  return (
    <div className="min-h-screen bg-black text-green-400 p-4 font-mono">
      <h1 className="text-2xl font-bold border-b border-green-700 pb-2 mb-4">
        /// COUNCIL HACK MODE ///
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* 左カラム: ユーザーリスト */}
        <div className="border border-green-800 p-2 h-[80vh] overflow-y-auto">
          <h2 className="text-sm font-bold mb-2 text-green-600">DETECTED IDs ({allUserIds.length})</h2>
          <ul>
            {allUserIds.map(id => (
              <li key={id}>
                <button 
                  onClick={() => setTargetUserId(id)}
                  className={`w-full text-left px-2 py-1 hover:bg-green-900 ${targetUserId === id ? "bg-green-800 text-white" : ""} ${bannedIds.includes(id) ? "line-through text-red-500" : ""}`}
                >
                  {id} {bannedIds.includes(id) && "[BAN]"}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* 右カラム: 詳細操作 */}
        <div className="md:col-span-2 space-y-6">
          {targetUserId ? (
            <>
              <div className="border border-green-600 p-4 bg-gray-900">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">TARGET: {targetUserId}</h2>
                    <button 
                        onClick={toggleBan}
                        className={`px-4 py-1 font-bold ${bannedIds.includes(targetUserId) ? "bg-blue-600 text-white" : "bg-red-600 text-black"}`}
                    >
                        {bannedIds.includes(targetUserId) ? "BAN解除 (UNBAN)" : "BAN実行 (EXECUTE)"}
                    </button>
                </div>

                {/* 予約状況 */}
                <h3 className="text-sm text-gray-400 border-b border-gray-700 mb-2">CURRENT TICKETS</h3>
                {targetUserTickets.length === 0 ? <p>No tickets found.</p> : (
                    <ul className="space-y-2 mb-6">
                        {targetUserTickets.map((t, i) => (
                            <li key={i} className="flex justify-between items-center bg-gray-800 p-2 rounded border border-gray-700">
                                <span>{t.shopName} @ {t.time} <span className="text-xs text-gray-500">({t.status})</span></span>
                                <button onClick={() => handleForceCancel(t)} className="text-red-400 hover:text-red-200 text-xs">[DEL]</button>
                            </li>
                        ))}
                    </ul>
                )}

                {/* 代理予約フォーム */}
                <div className="border-t border-gray-700 pt-4 mt-4">
                    <h3 className="text-sm text-yellow-500 mb-2">INJECT RESERVATION (代理予約)</h3>
                    <div className="flex gap-2 mb-2">
                        <select className="bg-gray-800 border border-green-800 p-1" onChange={e => setProxyShopId(e.target.value)} value={proxyShopId}>
                            <option value="">Select Shop...</option>
                            {attractions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <select className="bg-gray-800 border border-green-800 p-1" onChange={e => setProxyTime(e.target.value)} value={proxyTime}>
                            <option value="">Time...</option>
                            {/* 選択中の店のスロットを表示 */}
                            {proxyShopId && attractions.find(s=>s.id===proxyShopId)?.slots && 
                                Object.keys(attractions.find(s=>s.id===proxyShopId).slots).sort().map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))
                            }
                        </select>
                    </div>
                    <button onClick={handleProxyBook} disabled={!proxyShopId || !proxyTime} className="bg-green-700 text-black px-4 py-2 font-bold w-full hover:bg-green-600 disabled:opacity-50">
                        INJECT
                    </button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center text-gray-500 mt-20">
              Select a User ID from the list to inspect.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
