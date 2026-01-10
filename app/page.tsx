// ＃予約画面 (app/page.tsx)
"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../firebase"; // パスは環境に合わせて調整してください
import { collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, increment, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

type Ticket = {
  shopId: string;
  shopName: string;
  time: string;
  timestamp: number;
  status: "reserved" | "used";
  count: number; // ★追加: 人数
};

export default function Home() {
  const [attractions, setAttractions] = useState<any[]>([]);
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [selectedShop, setSelectedShop] = useState<any | null>(null);
  const [userId, setUserId] = useState("");
  const [isBanned, setIsBanned] = useState(false);

  // ★追加: 予約時の人数選択用ステート
  const [draftBooking, setDraftBooking] = useState<{ time: string; remaining: number } | null>(null);
  const [peopleCount, setPeopleCount] = useState<number>(1);

  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));
    
    // 1. ユーザーIDの生成・取得
    let storedId = localStorage.getItem("bunkasai_user_id");
    if (!storedId) {
      storedId = Math.random().toString(36).substring(2, 8).toUpperCase();
      localStorage.setItem("bunkasai_user_id", storedId);
    }
    setUserId(storedId);

    // ============================================================
    // ★ 追加機能: ユーザーDBへの自動保存 & BAN監視
    // ============================================================
    const userDocRef = doc(db, "users", storedId);

    getDoc(userDocRef).then((snap) => {
        if (!snap.exists()) {
            setDoc(userDocRef, {
                userId: storedId,
                createdAt: serverTimestamp(),
                nickname: "",       
                isPinned: false,    
                isBanned: false     
            }).catch(err => console.error("User regist error:", err));
        }
    });

    const unsubUser = onSnapshot(userDocRef, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            setIsBanned(data.isBanned === true);
        }
    });
    // ============================================================

    // 3. データのリアルタイム取得 (Attractions)
    const unsubAttractions = onSnapshot(collection(db, "attractions"), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttractions(data);

      const myFoundTickets: Ticket[] = [];
      data.forEach((shop: any) => {
        if (shop.reservations) {
          shop.reservations.forEach((r: any) => {
            if (r.userId === storedId) {
              myFoundTickets.push({
                shopId: shop.id,
                shopName: shop.name,
                time: r.time,
                timestamp: r.timestamp,
                status: r.status,
                count: r.count || 1 // ★追加: データがない場合は1名として扱う
              });
            }
          });
        }
      });
      myFoundTickets.sort((a, b) => b.timestamp - a.timestamp);
      setMyTickets(myFoundTickets);
    });

    return () => {
        unsubUser();        
        unsubAttractions(); 
    };
  }, []);

  const activeTickets = myTickets.filter(t => t.status === "reserved");
  const usedTickets = myTickets.filter(t => t.status === "used");

  // ============================================================
  // ★ BANされている場合の表示
  // ============================================================
  if (isBanned) {
      return (
          <div className="min-h-screen bg-red-900 text-white flex flex-col items-center justify-center p-4 text-center">
              <div className="text-6xl mb-4">🚫</div>
              <h1 className="text-3xl font-bold mb-2">ACCESS DENIED</h1>
              <p className="font-bold text-lg mb-4">利用停止処分が適用されています</p>
              <p className="text-sm opacity-80">
                  あなたのID ({userId}) は管理者により操作が制限されています。<br/>
                  誤りだと思われる場合は実行委員会へお問い合わせください。
              </p>
          </div>
      );
  }

  // ★変更: 時間を選択した段階の処理（まだ予約完了しない）
  const handleSelectTime = (shop: any, time: string) => {
    // 1. 店舗別BANチェック
    if (shop.bannedUsers && shop.bannedUsers.includes(userId)) {
        return alert("申し訳ありませんが、この店舗の利用は管理者により制限されています。");
    }

    // 2. 制限モード(招待制)チェック
    if (shop.isRestricted) {
        const allowedList = shop.allowedUsers || [];
        if (!allowedList.includes(userId)) {
            return alert("🔒 この時間は招待されたお客様のみ予約可能です。\n(制限モード)");
        }
    }

    if (activeTickets.length >= 3) return alert("同時に持てる予約は3つまでです！\n入場又はキャンセルすると枠が空きます。");
    if (activeTickets.some(t => t.shopId === shop.id && t.time === time)) return alert("すでに同じ時間を予約済みです！");
    
    // 残り人数の計算
    const currentCount = shop.slots[time] || 0;
    const capacity = shop.groupLimit || shop.capacity; // groupLimitがあれば優先、なければcapacity
    const remaining = capacity - currentCount;

    if (remaining <= 0) return alert("満席です。");
    if (shop.isPaused) return alert("現在、受付を停止しています。");
    
    // 予約ドラフト状態にする（人数選択モーダルを開く）
    setPeopleCount(1); // 人数リセット
    setDraftBooking({ time, remaining });
  };

  // ★追加: 人数を決めて最終予約する処理
  const handleConfirmBooking = async () => {
    if (!selectedShop || !draftBooking) return;

    const { time } = draftBooking;
    const count = peopleCount;

    if (!confirm(`${selectedShop.name}\n時間: ${time}\n人数: ${count}名\n\nこの内容で予約しますか？`)) return;

    try {
      const timestamp = Date.now();
      // ★追加: count を保存
      const reservationData = { userId, time, timestamp, status: "reserved", count };

      await updateDoc(doc(db, "attractions", selectedShop.id), { 
        [`slots.${time}`]: increment(count), // ★変更: 人数分増やす
        reservations: arrayUnion(reservationData)
      });
      
      setDraftBooking(null); // モーダル閉じる
      setSelectedShop(null); // 一覧に戻る
      alert("予約しました！");
    } catch (e) { 
      console.error(e);
      alert("エラーが発生しました。"); 
    }
  };

  const handleCancel = async (ticket: Ticket) => {
    if (!confirm(`キャンセルしますか？\n(${ticket.shopName} ${ticket.time})`)) return;
    try {
      const shopRef = doc(db, "attractions", ticket.shopId);
      const shopSnap = await getDoc(shopRef);
      if (!shopSnap.exists()) return;
      const shopData = shopSnap.data();
      const targetRes = shopData.reservations?.find((r: any) => r.userId === userId && r.time === ticket.time && r.timestamp === ticket.timestamp);

      if (targetRes) {
        const countToCancel = targetRes.count || 1; // 昔のデータなら1

        await updateDoc(shopRef, { 
          [`slots.${ticket.time}`]: increment(-countToCancel), // ★変更: 人数分減らす
          reservations: arrayRemove(targetRes)
        });
        alert("キャンセルしました");
      }
    } catch (e) { alert("キャンセル失敗"); }
  };

  const handleEnter = async (ticket: Ticket) => {
    const shop = attractions.find(s => s.id === ticket.shopId);
    if (!shop) return alert("データが見つかりません");

    const inputPass = prompt(`${shop.name}のスタッフパスワード(5桁)を入力：`);
    if (inputPass === null) return;

    if (inputPass === shop.password) {
      try {
        const oldRes = shop.reservations.find((r: any) => r.userId === userId && r.time === ticket.time && r.status === "reserved");
        if(oldRes) {
            await updateDoc(doc(db, "attractions", shop.id), {
                reservations: arrayRemove(oldRes)
            });
            await updateDoc(doc(db, "attractions", shop.id), {
                // statusを変更して再追加
                reservations: arrayUnion({ ...oldRes, status: "used" })
            });
        }
        alert("認証成功！入場しました。");
      } catch(e) {
        alert("通信エラーが発生しましたが、入場はOKです。");
      }
    } else {
      alert("パスワードが違います！");
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-gray-50 min-h-screen pb-20 relative">
      <header className="mb-6">
        <div className="flex justify-between items-center mb-2">
           <h1 className="text-xl font-bold text-blue-900">予約システム</h1>
           <div className={`px-3 py-1 rounded-full text-sm font-bold ${activeTickets.length >= 3 ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
               予約: {activeTickets.length}/3
           </div>
        </div>
        <div className="bg-gray-800 text-white text-center py-2 rounded-lg font-mono tracking-widest shadow-md">
            ID: <span className="text-yellow-400 font-bold text-lg">{userId}</span>
        </div>
      </header>

      {/* 1. 有効なチケットエリア */}
      {activeTickets.length > 0 && (
        <div className="mb-8 space-y-4">
          <p className="text-blue-900 text-sm font-bold flex items-center gap-1">
              🎟️ 現在の予約チケット
          </p>
          {activeTickets.map((t) => (
            <div key={t.timestamp} className="bg-white border-l-4 border-green-500 p-4 rounded shadow-lg relative overflow-hidden">
              <div className="flex justify-between items-center mb-3">
                <div>
                    <h2 className="font-bold text-lg flex items-center gap-2">
                        {t.shopName}
                        {/* ★追加: 予約人数の表示 */}
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full border border-green-200">
                           {t.count}名
                        </span>
                    </h2>
                    <p className="text-3xl font-bold text-blue-600 font-mono">{t.time}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleEnter(t)} className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-lg shadow hover:bg-blue-500 transition">
                  入場画面へ
                </button>
                <button onClick={() => handleCancel(t)} className="px-4 text-red-500 border border-red-200 rounded-lg text-xs hover:bg-red-50">
                  キャンセル
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. 出し物一覧 / 詳細 */}
      {!selectedShop ? (
        <div className="space-y-3">
          <p className="text-sm font-bold text-gray-600 mb-2 border-b pb-2">新しく予約する</p>
          {attractions.map((shop) => (
            <button key={shop.id} onClick={() => setSelectedShop(shop)} className={`w-full bg-white p-3 rounded-xl shadow-sm border text-left flex items-start gap-3 hover:bg-gray-50 transition ${shop.isPaused ? 'opacity-60 grayscale' : ''}`}>
              
              {shop.imageUrl && (
                  <div className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0 relative">
                      <img src={shop.imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
              )}

              <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1 mb-1">
                      {shop.department && (
                          <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200 truncate max-w-full">
                              {shop.department}
                          </span>
                      )}
                      {shop.isPaused && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded">受付停止中</span>}
                      {shop.isRestricted && <span className="bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded">招待制</span>}
                  </div>
                  
                  <h3 className="font-bold text-lg leading-tight truncate text-gray-800 mb-1">
                      {shop.name}
                  </h3>
                  
                  <div className="text-xs text-gray-400">
                      {shop.openTime} - {shop.closeTime} / 定員: {shop.groupLimit || shop.capacity}名
                  </div>
              </div>
              
              <div className="self-center text-gray-300">
                  &gt;
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden pb-10">
            {/* 詳細ヘッダー */}
            <div className="relative">
                {selectedShop.imageUrl && (
                    <div className="w-full h-40 bg-gray-200">
                        <img src={selectedShop.imageUrl} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                    </div>
                )}
                
                <button onClick={() => { setSelectedShop(null); setDraftBooking(null); }} className="absolute top-2 left-2 bg-black/60 text-white px-3 py-1 rounded-full text-sm backdrop-blur-sm z-10">
                    ← もどる
                </button>

                <div className={`${selectedShop.imageUrl ? "absolute bottom-0 left-0 right-0 p-4 text-white" : "pt-12 px-4 pb-4 text-gray-800 border-b"}`}>
                    {selectedShop.department && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded mb-1 inline-block ${selectedShop.imageUrl ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-800"}`}>
                            {selectedShop.department}
                        </span>
                    )}
                    <h2 className="text-2xl font-bold leading-tight flex items-end gap-2">
                        {selectedShop.name}
                    </h2>
                    {/* ★追加: 定員表示 */}
                    <div className={`text-sm ${selectedShop.imageUrl ? "text-gray-200" : "text-gray-500"}`}>
                        定員: {selectedShop.groupLimit || selectedShop.capacity}名 / 回
                    </div>
                </div>
            </div>

            <div className="p-4">
                {selectedShop.description && (
                    <div className="mb-6 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 p-3 rounded-lg border border-gray-100">
                        {selectedShop.description}
                    </div>
                )}

                {selectedShop.isRestricted && (
                    <div className="mb-4 bg-purple-50 border border-purple-200 text-purple-800 px-3 py-2 rounded text-sm flex items-center gap-2">
                        <span>🔒</span>
                        <span>招待制モード有効中</span>
                    </div>
                )}

                {selectedShop.isPaused ? (
                    <p className="text-red-500 font-bold mb-4 bg-red-100 p-3 rounded text-center border border-red-200">
                        現在、新規の受付を停止しています
                    </p>
                ) : (
                    <>
                        <p className="text-gray-500 mb-4 text-sm flex items-center gap-2">
                            <span>🕒 以下の時間枠を選択してください</span>
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            {Object.entries(selectedShop.slots || {}).sort().map(([time, count]: any) => {
                            const capacity = selectedShop.groupLimit || selectedShop.capacity;
                            const isFull = count >= capacity;
                            const isBooked = activeTickets.some(t => t.shopId === selectedShop.id && t.time === time);
                            const remaining = capacity - count;
                            
                            const isNotAllowed = selectedShop.isRestricted && (!selectedShop.allowedUsers || !selectedShop.allowedUsers.includes(userId));

                            return (
                                <button key={time} disabled={isFull || isBooked || selectedShop.isPaused || isNotAllowed} 
                                // ★変更: クリック時に時間選択処理(handleSelectTime)を呼ぶ
                                onClick={() => handleSelectTime(selectedShop, time)}
                                className={`p-2 rounded border h-24 flex flex-col items-center justify-center transition relative overflow-hidden
                                    ${isFull || selectedShop.isPaused || isNotAllowed 
                                        ? "bg-gray-100 text-gray-300 border-gray-200" 
                                        : isBooked 
                                            ? "bg-green-50 border-green-500 text-green-700" 
                                            : "bg-white border-blue-200 text-blue-900 shadow-sm hover:border-blue-400"
                                    }`}
                                >
                                <span className="text-xl font-bold mb-1 z-10">{time}</span>
                                <span className="text-xs font-bold z-10">
                                    {isBooked ? "予約済" : isNotAllowed ? "招待のみ" : isFull ? "満席" : `あと${remaining}名`}
                                </span>
                                {!isFull && !isBooked && !isNotAllowed && remaining <= 2 && (
                                    <div className="absolute top-0 right-0 w-3 h-3 bg-red-400 rounded-bl-full"></div>
                                )}
                                </button>
                            );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
      )}

      {/* 3. 入場済み履歴エリア */}
      {usedTickets.length > 0 && (
        <div className="mt-12 mb-8">
            <details className="group">
                <summary className="text-gray-400 text-xs text-center cursor-pointer list-none flex justify-center items-center gap-2 mb-2 hover:text-gray-600">
                    📂 入場済みの履歴を見る ({usedTickets.length})
                </summary>
                <div className="space-y-2 pl-2 border-l-2 border-gray-200 mt-2">
                    {usedTickets.map((t) => (
                        <div key={t.timestamp} className="bg-gray-100 p-3 rounded opacity-70 grayscale flex justify-between items-center">
                            <div>
                                <h2 className="font-bold text-sm text-gray-600 flex items-center gap-2">
                                    {t.shopName}
                                    <span className="text-[10px] bg-gray-200 px-1 rounded">{t.count}名</span>
                                </h2>
                                <p className="text-sm font-bold text-gray-500">{t.time}</p>
                            </div>
                            <div className="text-xs font-bold text-white bg-gray-400 px-2 py-1 rounded">
                                入場済
                            </div>
                        </div>
                    ))}
                </div>
            </details>
        </div>
      )}

      {/* ★追加: 人数選択用のモーダル (Overlay) */}
      {draftBooking && selectedShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-blue-600 text-white p-4 text-center">
              <h3 className="text-lg font-bold">予約内容の確認</h3>
            </div>
            
            <div className="p-6">
              <div className="text-center mb-6">
                <p className="text-gray-500 text-sm mb-1">{selectedShop.name}</p>
                <p className="text-3xl font-bold text-blue-900 mb-4">{draftBooking.time}〜</p>
                
                <label className="block text-left text-sm font-bold text-gray-700 mb-2">
                  予約人数を選択してください
                  <span className="text-xs font-normal text-gray-500 ml-2">
                    (最大 {draftBooking.remaining}名)
                  </span>
                </label>
                
                <select 
                  value={peopleCount}
                  onChange={(e) => setPeopleCount(Number(e.target.value))}
                  className="w-full text-lg p-3 border-2 border-blue-100 rounded-lg focus:border-blue-500 focus:outline-none bg-white"
                >
                  {/* 残り人数分だけ選択肢を作る */}
                  {[...Array(draftBooking.remaining)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}名
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setDraftBooking(null)} 
                  className="flex-1 py-3 text-gray-500 font-bold bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  戻る
                </button>
                <button 
                  onClick={handleConfirmBooking}
                  className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-500"
                >
                  予約する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 text-center border-t pt-4"><a href="/debugG" className="text-xs text-gray-300">/debug</a></div>
    </div>
  );
}
