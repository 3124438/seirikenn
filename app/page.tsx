"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../firebase"; 
import { collection, onSnapshot, doc, updateDoc, increment } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

type Ticket = { shopId: string; shopName: string; time: string; timestamp: number; };

export default function Home() {
  const [attractions, setAttractions] = useState<any[]>([]);
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [selectedShop, setSelectedShop] = useState<any | null>(null);

  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));
    const unsub = onSnapshot(collection(db, "attractions"), (snapshot) => {
      setAttractions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    // 保存されたチケットを読み込み
    const saved = localStorage.getItem("my_tickets_multi");
    if (saved) setMyTickets(JSON.parse(saved));
    return () => unsub();
  }, []);

  const handleBook = async (shop: any, time: string) => {
    if (myTickets.length >= 3) return alert("予約は3つまでです！");
    if (myTickets.some(t => t.shopId === shop.id && t.time === time)) return alert("すでに予約済みです！");
    if (shop.slots[time] >= shop.capacity) return alert("満席です。");
    if (!confirm(`${shop.name} ${time}〜\n予約しますか？`)) return;

    try {
      // データベースの人数を増やす
      await updateDoc(doc(db, "attractions", shop.id), { [`slots.${time}`]: increment(1) });
      
      const newTicket = { shopId: shop.id, shopName: shop.name, time, timestamp: Date.now() };
      const updated = [...myTickets, newTicket];
      setMyTickets(updated);
      localStorage.setItem("my_tickets_multi", JSON.stringify(updated));
      setSelectedShop(null);
      alert("予約しました！");
    } catch (e) { alert("エラーが発生しました"); }
  };

  const handleCancel = async (ticket: Ticket) => {
    if (!confirm("キャンセルしますか？")) return;
    try {
      // データベースの人数を減らす
      await updateDoc(doc(db, "attractions", ticket.shopId), { [`slots.${ticket.time}`]: increment(-1) });
      
      const updated = myTickets.filter(t => t.timestamp !== ticket.timestamp);
      setMyTickets(updated);
      localStorage.setItem("my_tickets_multi", JSON.stringify(updated));
    } catch (e) { alert("キャンセル失敗"); }
  };

  // ★新機能: 入場処理（パスワード確認）
  const handleEnter = (ticket: Ticket) => {
    // 最新の出し物データを検索
    const shop = attractions.find(s => s.id === ticket.shopId);
    if (!shop) return alert("データが見つかりません");

    const inputPass = prompt(`${ticket.shopName}のスタッフパスワード(5桁)を入力してください：`);
    if (inputPass === null) return; // キャンセル時

    // パスワード照合
    if (inputPass === shop.password) {
      alert("認証成功！入場済みとしてチケットを消去します。");
      
      // ★重要: DBのカウントは減らさず、スマホ上のチケットだけ消す
      const updated = myTickets.filter(t => t.timestamp !== ticket.timestamp);
      setMyTickets(updated);
      localStorage.setItem("my_tickets_multi", JSON.stringify(updated));
    } else {
      alert("パスワードが違います！");
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-gray-50 min-h-screen pb-20">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-blue-900">旬 - 予約システム</h1>
        <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-bold">予約: {myTickets.length}/3</div>
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
                {/* ★入場ボタン */}
                <button onClick={() => handleEnter(t)} className="flex-1 bg-blue-600 text-white font-bold py-2 rounded shadow hover:bg-blue-500">
                  入場する
                </button>
                {/* キャンセルボタン */}
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
            <button key={shop.id} onClick={() => setSelectedShop(shop)} className="w-full bg-white p-4 rounded-xl shadow-sm border text-left flex justify-between items-center hover:bg-gray-50 transition">
              <div><span className="font-bold text-lg">{shop.name}</span><div className="text-xs text-gray-400">{shop.openTime}-{shop.closeTime}</div></div>
              <span className="bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono text-xs">詳細へ &gt;</span>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <button onClick={() => setSelectedShop(null)} className="mb-4 text-sm text-gray-500 flex items-center gap-1">← もどる</button>
          <h2 className="text-2xl font-bold mb-1">{selectedShop.name}</h2>
          <p className="text-gray-500 mb-6 text-sm">希望の時間を選んでください</p>
          
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(selectedShop.slots || {}).sort().map(([time, count]: any) => {
              const isFull = count >= selectedShop.capacity;
              const isBooked = myTickets.some(t => t.shopId === selectedShop.id && t.time === time);
              // ★残り人数の計算
              const remaining = selectedShop.capacity - count;
              
              return (
                <button key={time} disabled={isFull || isBooked} onClick={() => handleBook(selectedShop, time)}
                  className={`p-2 rounded border h-24 flex flex-col items-center justify-center transition ${isFull ? "bg-gray-100 text-gray-300" : isBooked ? "bg-green-50 border-green-500 text-green-700" : "bg-white border-blue-200 text-blue-900 shadow-sm"}`}>
                  <span className="text-xl font-bold mb-1">{time}</span>
                  {/* ★残り人数の表示 */}
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
