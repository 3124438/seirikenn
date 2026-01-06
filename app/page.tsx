// ＃予約画面 (app/page.tsx)
"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../firebase"; // パスは適宜調整してください
import { collection, onSnapshot, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function BookingPage() {
  const [attractions, setAttractions] = useState<any[]>([]);
  const [selectedShop, setSelectedShop] = useState<any | null>(null);
  const [myUserId, setMyUserId] = useState("");
  const [loading, setLoading] = useState(true);

  // 初回ロード処理
  useEffect(() => {
    signInAnonymously(auth)
      .then(() => {
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
      })
      .catch((e) => console.error(e));

    const unsub = onSnapshot(collection(db, "attractions"), (snapshot) => {
      setAttractions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 予約処理
  const handleReserve = async (shop: any, time: string) => {
    if (!myUserId) return alert("ユーザーIDが取得できません");
    if (shop.isPaused) return alert("現在受付停止中です");

    const currentSlots = shop.slots[time] || 0;
    if (currentSlots >= shop.capacity) {
      alert("満席のため予約できません");
      return;
    }

    // 重複チェック
    const already = shop.reservations?.find((r: any) => r.userId === myUserId && r.status !== "used");
    if (already) {
      alert(`既に ${already.time} の回を予約済みです`);
      return;
    }

    const confirmMsg = `【${shop.name}】\n${time}〜 の回を予約しますか？`;
    if (!confirm(confirmMsg)) return;

    try {
      const reservationData = {
        userId: myUserId,
        time: time,
        timestamp: Date.now(),
        status: "reserved",
      };

      await updateDoc(doc(db, "attractions", shop.id), {
        reservations: arrayUnion(reservationData),
        [`slots.${time}`]: currentSlots + 1,
      });

      alert(`予約完了！\nあなたのID: ${myUserId}\n時間: ${time}`);
      setSelectedShop(null); // モーダルを閉じる
    } catch (err) {
      console.error(err);
      alert("エラーが発生しました");
    }
  };

  if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans pb-20">
      {/* ヘッダー */}
      <header className="bg-gray-800 p-4 sticky top-0 z-40 shadow-lg border-b border-gray-700">
        <h1 className="text-xl font-bold text-center">文化祭 予約サイト</h1>
        <div className="text-center text-xs text-gray-400 mt-1">
          Your ID: <span className="text-yellow-400 font-mono font-bold text-lg">{myUserId}</span>
        </div>
      </header>

      {/* 会場リスト */}
      <div className="p-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
        {attractions.map((shop) => (
          <div
            key={shop.id}
            onClick={() => setSelectedShop(shop)}
            className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 shadow-lg cursor-pointer hover:border-blue-500 transition group flex flex-col"
          >
            {/* ★追加: 画像エリア (アスペクト比固定) */}
            <div className="relative h-40 bg-gray-700 overflow-hidden">
                {shop.imageUrl ? (
                    <img src={shop.imageUrl} alt={shop.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl text-gray-600">🎪</div>
                )}
                {/* 混雑状況バッジ(例) */}
                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-white">
                    ID: {shop.id}
                </div>
            </div>

            {/* 詳細情報 */}
            <div className="p-4 flex-1 flex flex-col">
              {/* ★追加: 団体名バッジ */}
              {shop.department && (
                  <span className="self-start text-xs font-bold bg-blue-900/60 text-blue-200 px-2 py-0.5 rounded mb-2 border border-blue-500/30">
                      {shop.department}
                  </span>
              )}

              <h2 className="text-xl font-bold mb-1 group-hover:text-blue-400 transition">{shop.name}</h2>
              
              <div className="mt-auto pt-3 flex justify-between items-center text-sm text-gray-400">
                  <span>受付時間: {shop.openTime} - {shop.closeTime}</span>
                  {shop.isPaused ? (
                      <span className="text-red-500 font-bold border border-red-500 px-2 rounded">受付停止中</span>
                  ) : (
                      <span className="text-green-400 font-bold">予約受付中 ›</span>
                  )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 予約モーダル */}
      {selectedShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-gray-800 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-gray-600 max-h-[90vh] flex flex-col">
            
            {/* モーダルヘッダー画像 */}
            <div className="h-32 bg-gray-700 relative flex-shrink-0">
                {selectedShop.imageUrl ? (
                    <img src={selectedShop.imageUrl} className="w-full h-full object-cover opacity-60" alt="" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">🎪</div>
                )}
                <button
                    onClick={() => setSelectedShop(null)}
                    className="absolute top-3 right-3 bg-black/50 text-white w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/80 text-xl"
                >
                    ×
                </button>
                <div className="absolute bottom-3 left-4 right-4">
                     {selectedShop.department && (
                        <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded mb-1 inline-block shadow">
                            {selectedShop.department}
                        </span>
                     )}
                    <h2 className="text-2xl font-bold text-white drop-shadow-md leading-tight">{selectedShop.name}</h2>
                </div>
            </div>

            {/* コンテンツ */}
            <div className="p-4 overflow-y-auto">
              <p className="text-sm text-gray-300 mb-4">
                空いている時間帯を選択して予約してください。<br/>
                <span className="text-xs text-gray-500">※1人1枠まで予約可能です。</span>
              </p>

              {selectedShop.isPaused ? (
                  <div className="bg-red-900/30 border border-red-600 text-red-200 p-4 rounded text-center font-bold">
                      現在、受付を一時停止しています。
                  </div>
              ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {Object.keys(selectedShop.slots || {})
                      .sort()
                      .map((time) => {
                        const count = selectedShop.slots[time];
                        const isFull = count >= selectedShop.capacity;
                        
                        // 既に自分が予約している枠か確認
                        const isMyRes = selectedShop.reservations?.some((r:any) => r.userId === myUserId && r.time === time && r.status !== 'used');

                        return (
                          <button
                            key={time}
                            disabled={isFull && !isMyRes}
                            onClick={() => handleReserve(selectedShop, time)}
                            className={`
                              flex flex-col items-center justify-center p-2 rounded border transition
                              ${isMyRes 
                                ? "bg-green-600 border-green-400 text-white ring-2 ring-green-300" // 自分の予約
                                : isFull
                                    ? "bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed opacity-50" // 満席
                                    : "bg-gray-800 border-gray-600 hover:bg-blue-600 hover:border-blue-400 text-white" // 空きあり
                              }
                            `}
                          >
                            <span className="text-sm font-bold">{time}</span>
                            <span className="text-xs mt-1">
                                {isMyRes ? "予約済" : isFull ? "満席" : "〇"}
                            </span>
                          </button>
                        );
                      })}
                  </div>
              )}
            </div>
            
            <div className="p-3 border-t border-gray-700 bg-gray-800 text-center">
                <button onClick={()=>setSelectedShop(null)} className="text-gray-400 text-sm underline">閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
