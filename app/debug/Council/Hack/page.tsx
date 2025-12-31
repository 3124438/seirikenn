"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../../../../firebase"; 
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

    // 2. ブラックリストの監視
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
    // 日付順にならべる
    tickets.sort((a, b) => b.timestamp - a.timestamp);
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

  // 強制予約 (代理予約)
  const handleProxyBook = async () => {
    if (!targetUserId || !proxyShopId || !proxyTime) return;
    const shop = attractions.find(s => s.id === proxyShopId);
    if (!shop) return;

    if (!confirm(`【強制予約を実行】\n対象ID: ${targetUserId}\n店舗: ${shop.name}\n時間: ${proxyTime}\n\nこの内容でチケットを発行しますか？`)) return;

    try {
      await updateDoc(doc(db, "attractions", proxyShopId), {
        [`slots.${proxyTime}`]: increment(1),
        reservations: arrayUnion({
            userId: targetUserId,
            time: proxyTime,
            timestamp: Date.now(),
            status: "reserved",
            note: "admin_proxy" // 管理者操作の証拠
        })
      });
      alert("強制予約が完了しました");
    } catch (e) {
      console.error(e);
      alert("エラー: " + e);
    }
  };

  // 強制キャンセル (予約削除)
  const handleForceCancel = async (ticket: any) => {
    if(!confirm(`【警告】\n${ticket.shopName} (${ticket.time})\n\nこの予約を完全に削除しますか？\n(スロットの空き数も1つ戻ります)`)) return;
    try {
        await updateDoc(doc(db, "attractions", ticket.shopId), {
            [`slots.${ticket.time}`]: increment(-1),
            reservations: arrayRemove({
                userId: ticket.userId,
                time: ticket.time,
                timestamp: ticket.timestamp,
                status: ticket.status,
                note: ticket.note || null // noteがある場合への対応（型合わせのため厳密には本来もう少しケアが必要ですが簡易実装）
            })
        });
        
        // 配列削除は完全一致が必要なため、もしnoteの有無で削除失敗する場合は
        // note無しのパターンもトライするなどの工夫がいりますが、一旦標準データで削除試行
        // (厳密にはIDでfilterしてupdateする方が安全ですが、既存構造維持のためこのままいきます)

        // 念のためnoteあり/なし両方消すトライ（安全策）
        const baseObj = {
            userId: ticket.userId,
            time: ticket.time,
            timestamp: ticket.timestamp,
            status: ticket.status
        };
        // noteプロパティがあるデータの場合
        if(ticket.note) {
             // 上ですでに実行済み
        } else {
             // noteがないデータとして再トライ(念の為)
             await updateDoc(doc(db, "attractions", ticket.shopId), {
                reservations: arrayRemove(baseObj)
            });
        }

        alert("予約を削除しました");
    } catch(e) {
        alert("削除失敗: データが一致しない可能性があります");
        console.error(e);
    }
  };

  // ステータス変更 (強制入場 / 入場キャンセル)
  const handleToggleStatus = async (ticket: any) => {
    const isUsed = ticket.status === "used";
    const newStatus = isUsed ? "reserved" : "used";
    const actionName = isUsed ? "「未入場」に戻す" : "「入場済み」にする";

    if(!confirm(`${ticket.shopName} (${ticket.time})\n\nこのチケットを${actionName}ですか？`)) return;

    try {
        // 古いデータを削除
        await updateDoc(doc(db, "attractions", ticket.shopId), {
            reservations: arrayRemove({
                userId: ticket.userId,
                time: ticket.time,
                timestamp: ticket.timestamp,
                status: ticket.status,
                ...(ticket.note ? { note: ticket.note } : {})
            })
        });
        // 新しいステータスで追加
        await updateDoc(doc(db, "attractions", ticket.shopId), {
            reservations: arrayUnion({
                userId: ticket.userId,
                time: ticket.time,
                timestamp: ticket.timestamp,
                status: newStatus,
                ...(ticket.note ? { note: ticket.note } : {})
            })
        });
        alert(`ステータスを変更しました: ${newStatus}`);
    } catch(e) {
        alert("変更失敗");
        console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 font-sans text-sm">
      <header className="flex justify-between items-center border-b border-gray-700 pb-4 mb-6">
        <div>
            <h1 className="text-2xl font-bold text-red-500">裏管理システム (Hack Mode)</h1>
            <p className="text-gray-400 text-xs">Admin Control Panel - Authorized Personnel Only</p>
        </div>
        <div className="bg-gray-800 px-4 py-2 rounded text-right">
            <div className="text-xs text-gray-400">Total Users</div>
            <div className="text-xl font-bold font-mono">{allUserIds.length}</div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* 左カラム: ユーザーリスト */}
        <div className="md:col-span-1 border border-gray-700 rounded bg-gray-800 flex flex-col h-[80vh]">
          <div className="p-3 border-b border-gray-700 bg-gray-700 font-bold text-gray-300">
            検知されたID一覧
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {allUserIds.map(id => (
              <button 
                key={id}
                onClick={() => setTargetUserId(id)}
                className={`w-full text-left px-3 py-2 rounded text-xs font-mono transition-all flex justify-between items-center
                  ${targetUserId === id 
                    ? "bg-blue-600 text-white shadow-lg scale-105" 
                    : "hover:bg-gray-700 text-gray-400"} 
                  ${bannedIds.includes(id) ? "opacity-50" : ""}`}
              >
                <span>{id}</span>
                {bannedIds.includes(id) && <span className="bg-red-500 text-white text-[10px] px-1 rounded">BAN</span>}
              </button>
            ))}
          </div>
        </div>

        {/* 右カラム: 詳細操作エリア */}
        <div className="md:col-span-3 space-y-6">
          {targetUserId ? (
            <>
              {/* ユーザーヘッダー */}
              <div className="bg-gray-800 p-4 rounded border border-gray-700 flex justify-between items-center shadow-lg">
                <div>
                    <h2 className="text-xs text-gray-400 mb-1">TARGET USER ID</h2>
                    <div className="text-3xl font-bold font-mono text-white tracking-widest">{targetUserId}</div>
                </div>
                <button 
                    onClick={toggleBan}
                    className={`px-6 py-2 rounded font-bold transition shadow ${bannedIds.includes(targetUserId) ? "bg-blue-500 hover:bg-blue-400 text-white" : "bg-red-600 hover:bg-red-500 text-white"}`}
                >
                    {bannedIds.includes(targetUserId) ? "BANを解除する" : "このIDをBANする"}
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* 1. 予約リスト & 操作 */}
                <div className="space-y-4">
                    <h3 className="font-bold text-gray-300 border-l-4 border-blue-500 pl-2">所持チケットの操作</h3>
                    {targetUserTickets.length === 0 ? (
                        <p className="text-gray-500 p-4 bg-gray-800 rounded">予約データなし</p>
                    ) : (
                        <div className="space-y-3">
                            {targetUserTickets.map((t, i) => (
                                <div key={i} className={`p-3 rounded border shadow-sm relative ${t.status === 'used' ? 'bg-gray-700 border-gray-600 opacity-70' : 'bg-white text-gray-900 border-blue-500'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <div className="font-bold text-sm">{t.shopName}</div>
                                            <div className="text-xl font-bold font-mono">{t.time}</div>
                                            <div className="text-xs mt-1">
                                                状態: 
                                                <span className={`ml-1 font-bold ${t.status === 'used' ? 'text-gray-400' : 'text-green-600'}`}>
                                                    {t.status === 'reserved' ? '予約中' : '入場済み'}
                                                </span>
                                            </div>
                                        </div>
                                        <button onClick={() => handleForceCancel(t)} className="bg-red-100 text-red-600 px-2 py-1 rounded text-xs border border-red-200 hover:bg-red-200">
                                            削除
                                        </button>
                                    </div>
                                    
                                    {/* ステータス切替ボタン */}
                                    <button onClick={() => handleToggleStatus(t)} className="w-full py-1 text-xs font-bold rounded bg-gray-200 hover:bg-gray-300 text-gray-700">
                                        {t.status === 'reserved' ? '▼ 強制入場済みにする' : '▲ 未入場に戻す'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 2. 新規代理予約 (変更用) */}
                <div className="space-y-4">
                    <h3 className="font-bold text-gray-300 border-l-4 border-green-500 pl-2">強制代理予約 (変更/追加)</h3>
                    <div className="bg-gray-800 p-4 rounded border border-gray-700">
                        <p className="text-xs text-gray-400 mb-4">
                            ※予約内容を変更したい場合は、左側のリストで「削除」してから、ここで新しい時間を予約してください。
                        </p>
                        
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">出し物を選択</label>
                                <select className="w-full bg-gray-900 border border-gray-600 text-white p-2 rounded" onChange={e => setProxyShopId(e.target.value)} value={proxyShopId}>
                                    <option value="">-- 選択してください --</option>
                                    {attractions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">時間を選択</label>
                                <select className="w-full bg-gray-900 border border-gray-600 text-white p-2 rounded" onChange={e => setProxyTime(e.target.value)} value={proxyTime}>
                                    <option value="">-- 選択してください --</option>
                                    {proxyShopId && attractions.find(s=>s.id===proxyShopId)?.slots && 
                                        Object.keys(attractions.find(s=>s.id===proxyShopId).slots).sort().map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))
                                    }
                                </select>
                            </div>

                            <button 
                                onClick={handleProxyBook} 
                                disabled={!proxyShopId || !proxyTime} 
                                className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                この内容で強制予約する
                            </button>
                        </div>
                    </div>
                </div>

              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-50">
                <div className="text-6xl mb-4">☜</div>
                <p>左のリストから操作したいユーザーIDを選択してください</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
