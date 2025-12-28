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
      await updateDoc(doc(db, "attractions", ticket.shopId), { [`slots.${ticket.time}`]: increment(-1) });
      const updated = myTickets.filter(t => t.timestamp !== ticket.timestamp);
      setMyTickets(updated);
      localStorage.setItem("my_tickets_multi", JSON.stringify(updated));
    } catch (e) { alert("キャンセル失敗"); }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-gray-50 min-h-screen pb-20">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-blue-900">旬 - 予約システム</h1>
        <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-bold">予約: {myTickets.length}/3</div>
      </header>

      {myTickets.length > 0 && (
        <div className="mb-8 space-y-4">
          <p className="text-gray-500 text-sm font-bold">あなたのチケット</p>
          {myTickets.map((t) => (
            <div key={t.timestamp} className="bg-white border-l-4 border-green-500 p-4 rounded shadow flex justify-between items-center">
              <div><h2 className="font-bold">{t.shopName}</h2><p className="text-2xl font-bold text-blue-600">{t.time}</p></div>
              <button onClick={() => handleCancel(t)} className="text-xs text-red-500 border border-red-200 px-3 py-2 rounded">キャンセル</button>
            </div>
          ))}
        </div>
      )}

      {!selectedShop ? (
        <div className="space-y-3">
          <p className="text-sm font-bold text-gray-600 mb-2 border-b pb-2">出し物一覧</p>
          {attractions.map((shop) => (
            <button key={shop.id} onClick={() => setSelectedShop(shop)} className="w-full bg-white p-4 rounded-xl shadow-sm border text-left flex justify-between items-center">
              <div><span className="font-bold text-lg">{shop.name}</span><div className="text-xs text-gray-400">{shop.openTime}-{shop.closeTime}</div></div>
              <span className="bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono text-xs">{shop.id}</span>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <button onClick={() => setSelectedShop(null)} className="mb-4 text-sm text-gray-500">← もどる</button>
          <h2 className="text-xl font-bold mb-4">{selectedShop.name}</h2>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(selectedShop.slots || {}).sort().map(([time, count]: any) => {
              const isFull = count >= selectedShop.capacity;
              const isBooked = myTickets.some(t => t.shopId === selectedShop.id && t.time === time);
              return (
                <button key={time} disabled={isFull || isBooked} onClick={() => handleBook(selectedShop, time)}
                  className={`p-2 rounded border h-20 flex flex-col items-center justify-center ${isFull ? "bg-gray-100 text-gray-300" : isBooked ? "bg-green-50 border-green-500 text-green-700" : "bg-white border-blue-200 text-blue-900"}`}>
                  <span className="text-lg font-bold">{time}</span>
                  <span className="text-xs font-bold">{isBooked ? "予約済" : isFull ? "満席" : "空き ◯"}</span>
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
