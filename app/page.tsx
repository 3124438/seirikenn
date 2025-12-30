"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../firebase"; 
import { collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, increment, getDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

type Ticket = { 
  shopId: string; 
  shopName: string; 
  time: string; 
  timestamp: number; 
  status: "reserved" | "used"; 
};

export default function Home() {
  const [attractions, setAttractions] = useState<any[]>([]);
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [selectedShop, setSelectedShop] = useState<any | null>(null);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));
    
    // 1. ユーザーIDの生成・取得
    let storedId = localStorage.getItem("bunkasai_user_id");
    if (!storedId) {
      storedId = Math.random().toString(36).substring(2, 8).toUpperCase();
      localStorage.setItem("bunkasai_user_id", storedId);
    }
    setUserId(storedId);

    // 2. データのリアルタイム取得
    const unsub = onSnapshot(collection(db, "attractions"), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttractions(data);

      // 自分の予約をデータから探し出す（スマホのキャッシュ消去対策）
      const myFoundTickets: Ticket[] = [];
      data.forEach((shop: any) => {
        if (shop.reservations) {
          shop.reservations.forEach((r: any) => {
            if (r.userId === storedId && r.status === "reserved") {
              myFoundTickets.push({
                shopId: shop.id,
                shopName: shop.name,
                time: r.time,
                timestamp: r.timestamp,
                status: r.status
              });
            }
          });
        }
      });
      // 新しい順に並び替え
      myFoundTickets.sort((a, b) => b.timestamp - a.timestamp);
      setMyTickets(myFoundTickets);
    });

    return () => unsub();
  }, []);

  const handleBook = async (shop: any, time: string) => {
    if (myTickets.length >= 3) return alert("予約は3つまでです！");
    if (myTickets.some(t => t.shopId === shop.id && t.time === time)) return alert("すでに同じ時間を予約済みです！");
    if (shop.slots[time] >= shop.capacity) return alert("満席です。");
    if (shop.isPaused) return alert("現在、受付を停止しています。");
    
    if (!confirm(`${shop.name} ${time}〜\n予約しますか？`)) return;

    try {
      const timestamp = Date.now();
      const reservationData = { userId, time, timestamp, status: "reserved" };

      // DB更新: 人数を増やし、予約リストに自分を追加
      await updateDoc(doc(db, "attractions", shop.id), { 
        [`slots.${time}`]: increment(1),
        reservations: arrayUnion(reservationData)
      });
      
      setSelectedShop(null);
      alert("予約しました！");
    } catch (e) { 
      console.error(e);
      alert("エラーが発生しました。もう一度お試しください。"); 
    }
  };

  const handleCancel = async (ticket: Ticket) => {
    if (!confirm("キャンセルしますか？")) return;
    try {
      const shopRef = doc(db, "attractions", ticket.shopId);
      const shopSnap = await getDoc(shopRef);
      if (!shopSnap.exists()) return;

      const shopData = shopSnap.data();
      // 正確なデータを削除するために検索
      const targetRes = shopData.reservations?.find((r: any) => r.userId === userId && r.time === ticket.time && r.timestamp === ticket.timestamp);

      if (targetRes) {
        await updateDoc(shopRef, { 
          [`slots.${ticket.time}`]: increment(-1),
          reservations: arrayRemove(targetRes)
        });
        alert("キャンセルしました");
      }
    } catch (e) { alert("キャンセル失敗"); }
  };

  const handleEnter = async (ticket: Ticket) => {
    const shop = attractions.find(s => s.id === ticket.shopId);
    if (!shop) return alert("データが見つかりません");

    const inputPass = prompt(`${ticket.shopName}のスタッフパスワード(5桁)を入力：`);
    if (inputPass === null) return;

    if (inputPass === shop.password) {
      try {
        // DB上のステータスを「used (入場済)」に変更する処理
        // (Firestoreの配列内更新は複雑なため、一度削除して追加し直す手法をとります)
        const oldRes = shop.reservations.find((r: any) => r.userId === userId && r.time === ticket.time);
        if(oldRes) {
            await updateDoc(doc(db, "attractions", shop.id), {
                reservations: arrayRemove(oldRes)
            });
            await updateDoc(doc(db, "attractions", shop.id), {
                reservations: arrayUnion({ ...oldRes, status: "used" })
            });
        }
        alert("認証成功！入場記録を保存しました。");
      } catch(e) {
        alert("通信エラーが発生しましたが、入場はOKです。");
      }
    } else {
      alert("パスワードが違います！");
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-gray-50 min-h-screen pb-20">
      <header className="mb-6">
        <div className="flex justify-between items-center mb-2">
           <h1 className="text-xl font-bold text-blue-900">予約システム</h1>
           <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-bold">予約: {myTickets.length}/3</div>
        </div>
        {/* User ID 表示 */}
        <div className="bg-gray-800 text-white text-center py-2 rounded-lg font-mono tracking-widest shadow-md">
            ID: <span className="text-yellow-400 font-bold text-lg">{userId}</span>
        </div>
      </header>

      {/* 予約済みチケットエリア */}
      {myTickets.length > 0 && (
        <div className="mb-8 space-y-4">
          <p className="text-gray-500 text-sm font-bold">あなたのチケット</p>
          {myTickets.map((t) => (
            <div key={t.timestamp} className="bg-white border-l-4 border-green-500 p-4 rounded shadow">
              <div className="flex justify-between items-center mb-3">
                <div><h2 className="font-bold text-lg">{t.shopName}</h2><p className="text-2xl font-bold text-blue-600">{t.time}</p></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleEnter(t)} className="flex-1 bg-blue-600 text-white font-bold py-2 rounded shadow hover:bg-blue-500">
                  入場する
                </button>
                <button onClick={() => handleCancel(t)} className="px-4 py-2 text-red-500 border border-red-200 rounded text-sm hover:bg-red-50">
                  キャンセル
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!selectedShop ? (
        <div className="space-y-3">
          <p className="text-sm font-bold text-gray-600 mb-2 border-b pb-2">出し物一覧</p>
          {attractions.map((shop) => (
            <button key={shop.id} onClick={() => setSelectedShop(shop)} className={`w-full bg-white p-4 rounded-xl shadow-sm border text-left flex justify-between items-center hover:bg-gray-50 transition ${shop.isPaused ? 'opacity-60 grayscale' : ''}`}>
              <div>
                  <span className="font-bold text-lg flex items-center gap-2">
                      {shop.name}
                      {shop.isPaused && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded">受付停止中</span>}
                  </span>
                  <div className="text-xs text-gray-400">{shop.openTime}-{shop.closeTime} (各{shop.groupLimit}名まで)</div>
              </div>
              <span className="bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono text-xs">詳細 &gt;</span>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <button onClick={() => setSelectedShop(null)} className="mb-4 text-sm text-gray-500 flex items-center gap-1">← もどる</button>
          <h2 className="text-2xl font-bold mb-1">{selectedShop.name}</h2>
          <p className="text-gray-500 mb-2 text-sm">定員: {selectedShop.groupLimit}名 / 組</p>
          {selectedShop.isPaused && <p className="text-red-500 font-bold mb-4 bg-red-100 p-2 rounded text-center">現在、新規の受付を停止しています</p>}
          
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(selectedShop.slots || {}).sort().map(([time, count]: any) => {
              const isFull = count >= selectedShop.capacity;
              const isBooked = myTickets.some(t => t.shopId === selectedShop.id && t.time === time);
              const remaining = selectedShop.capacity - count;
              
              return (
                <button key={time} disabled={isFull || isBooked || selectedShop.isPaused} onClick={() => handleBook(selectedShop, time)}
                  className={`p-2 rounded border h-24 flex flex-col items-center justify-center transition ${isFull || selectedShop.isPaused ? "bg-gray-100 text-gray-300" : isBooked ? "bg-green-50 border-green-500 text-green-700" : "bg-white border-blue-200 text-blue-900 shadow-sm"}`}>
                  <span className="text-xl font-bold mb-1">{time}</span>
                  <span className="text-xs font-bold">
                    {isBooked ? "予約済" : isFull ? "満席" : `あと${remaining}組`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-12 text-center border-t pt-4"><a href="/seisakusyanikannsyao" className="text-xs text-gray-300">Admin</a></div>
    </div>
  );
}
