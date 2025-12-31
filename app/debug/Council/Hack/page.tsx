"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../../../../firebase"; // 階層注意: app/debug/Council/Hack/ からなので4つ戻る
import { collection, onSnapshot, doc, updateDoc, getDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function HackPage() {
  const [attractions, setAttractions] = useState<any[]>([]);
  
  // 管理者権限管理用
  const [adminBannedUsers, setAdminBannedUsers] = useState<string[]>([]); // 編集禁止リスト
  const [adminAllowedUsers, setAdminAllowedUsers] = useState<string[]>([]); // 特別許可リスト
  const [targetUserId, setTargetUserId] = useState("");

  // ★追加: ユーザー詳細管理用
  const [targetStudentId, setTargetStudentId] = useState(""); // 操作対象の生徒ID
  const [isModalOpen, setIsModalOpen] = useState(false); // モーダル開閉
  const [studentReservations, setStudentReservations] = useState<any[]>([]); // その生徒の全予約

  // 追加予約用フォーム
  const [addShopId, setAddShopId] = useState("");
  const [addTime, setAddTime] = useState("10:00");

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);

    // 全店舗データ監視
    const unsub = onSnapshot(collection(db, "attractions"), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttractions(data);
    });

    return () => unsub();
  }, []);

  // --- 管理者権限BANなどの既存機能 ---
  const toggleGlobalPause = async (currentState: boolean) => {
      if(!confirm(currentState ? "全店舗の受付を再開させますか？" : "緊急停止：全店舗の受付を停止しますか？")) return;
      
      // 全ドキュメントを一括更新（本来はBatch処理推奨だが簡易的にループ）
      attractions.forEach(async (shop) => {
          await updateDoc(doc(db, "attractions", shop.id), { isPaused: !currentState });
      });
      alert("実行しました");
  };

  // --- ★追加機能: 生徒詳細管理ロジック ---

  // 1. その生徒の予約を全店舗から洗い出す
  const fetchStudentData = () => {
    if(!targetStudentId) return alert("生徒IDを入力してください");
    
    const foundReservations: any[] = [];
    attractions.forEach(shop => {
        if(shop.reservations) {
            shop.reservations.forEach((res: any) => {
                // 部分一致ではなく完全一致で検索
                if(res.userId === targetStudentId) {
                    foundReservations.push({
                        shopId: shop.id,
                        shopName: shop.name,
                        ...res
                    });
                }
            });
        }
    });
    setStudentReservations(foundReservations);
    setIsModalOpen(true);
  };

  // 2. 予約のステータス変更 (入場/未入場)
  const forceToggleStatus = async (res: any, status: "used" | "reserved") => {
      const shop = attractions.find(s => s.id === res.shopId);
      if(!shop) return;
      
      const otherRes = shop.reservations.filter((r: any) => r.timestamp !== res.timestamp);
      const updatedRes = { ...res, status };
      // 不要なフィールド(shopId, shopName)を除去して保存
      delete updatedRes.shopId;
      delete updatedRes.shopName;

      await updateDoc(doc(db, "attractions", res.shopId), {
          reservations: [...otherRes, updatedRes]
      });
      // モーダル内の表示更新のために再取得はonSnapshotがやってくれるが、配列をローカルで更新
      fetchStudentData(); 
  };

  // 3. 予約の完全抹消
  const forceDeleteReservation = async (res: any) => {
      if(!confirm(`本当に削除しますか？\n会場: ${res.shopName}\n時間: ${res.time}`)) return;

      const shop = attractions.find(s => s.id === res.shopId);
      if(!shop) return;

      const otherRes = shop.reservations.filter((r: any) => r.timestamp !== res.timestamp);
      const updatedSlots = { ...shop.slots, [res.time]: Math.max(0, (shop.slots[res.time] || 1) - 1) };

      await updateDoc(doc(db, "attractions", res.shopId), {
          reservations: otherRes,
          slots: updatedSlots
      });
      alert("抹消しました");
      setIsModalOpen(false); // データ更新待ちのため一旦閉じるか、リロード推奨
  };

  // 4. 強制追加予約 (ねじ込み)
  const forceAddReservation = async () => {
      if(!addShopId || !addTime) return alert("会場と時間を選択してください");
      const shop = attractions.find(s => s.id === addShopId);
      if(!shop) return alert("会場が見つかりません");

      const newRes = {
          userId: targetStudentId,
          timestamp: Date.now(),
          time: addTime,
          status: "reserved"
      };

      // 容量無視でスロット加算
      const currentCount = shop.slots?.[addTime] || 0;
      const updatedSlots = { ...shop.slots, [addTime]: currentCount + 1 };

      await updateDoc(doc(db, "attractions", addShopId), {
          reservations: [...(shop.reservations || []), newRes],
          slots: updatedSlots
      });
      
      alert(`強制予約を実行しました。\n${shop.name} @ ${addTime}`);
      fetchStudentData(); // リスト更新
  };


  return (
    <div className="min-h-screen bg-black text-green-400 p-8 font-mono">
      <h1 className="text-4xl font-bold mb-8 border-b border-green-700 pb-2">HACK_CONSOLE_v9.0</h1>

      {/* 1. 緊急停止スイッチ */}
      <div className="mb-12 border border-red-900 p-4 rounded bg-red-900/10">
          <h2 className="text-xl font-bold text-red-500 mb-4">⚠️ GLOBAL OVERRIDE (全店一括操作)</h2>
          <p className="mb-4 text-sm text-gray-400">現在、{attractions.filter(a => a.isPaused).length} 店舗が停止中 / {attractions.length} 店舗中</p>
          <button 
            onClick={() => toggleGlobalPause(attractions.every(a => a.isPaused))}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded text-xl tracking-widest"
          >
              {attractions.every(a => a.isPaused) ? "全店舗 再開 (RESUME ALL)" : "全店舗 緊急停止 (EMERGENCY STOP)"}
          </button>
      </div>

      {/* 2. 生徒ID 指定管理パネル (要望の機能) */}
      <div className="mb-12 border border-blue-900 p-4 rounded bg-blue-900/10">
          <h2 className="text-xl font-bold text-blue-400 mb-4">💀 生徒ID 指定管理 (User Deep Control)</h2>
          <div className="flex gap-4 items-center bg-gray-900 p-4 rounded">
              <span className="text-xl">TARGET_ID:</span>
              <input 
                className="bg-black border border-blue-500 text-white p-2 rounded text-xl flex-1 outline-none" 
                placeholder="生徒のIDを入力 (例: X9A2)" 
                value={targetStudentId}
                onChange={(e) => setTargetStudentId(e.target.value.toUpperCase())}
              />
              {/* 右端に追加したボタン */}
              <button 
                onClick={fetchStudentData}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2 rounded text-lg shadow-[0_0_15px_rgba(37,99,235,0.7)]"
              >
                  ⚡ 完全操作 (Open Panel)
              </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">※ 指定したIDの「予約状況」「強制消去」「強制入場」「ねじ込み予約」を行います。</p>
      </div>

      {/* --- モーダル: 詳細操作パネル --- */}
      {isModalOpen && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 border border-green-500 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl p-6">
                  <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                      <h2 className="text-2xl font-bold text-white">操作対象: <span className="text-yellow-400 text-3xl">{targetStudentId}</span></h2>
                      <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white text-2xl">×</button>
                  </div>

                  {/* A. 現在の予約一覧 */}
                  <div className="mb-8">
                      <h3 className="text-lg font-bold text-green-400 mb-2">▼ 現在の予約リスト (Active Reservations)</h3>
                      {studentReservations.length === 0 ? (
                          <p className="text-gray-500">予約データなし</p>
                      ) : (
                          <div className="space-y-3">
                              {studentReservations.map((res, idx) => (
                                  <div key={idx} className="bg-black border border-gray-700 p-3 rounded flex justify-between items-center">
                                      <div>
                                          <div className="text-lg font-bold text-white">{res.shopName}</div>
                                          <div className="text-sm text-gray-400">{res.time} | {res.status === 'used' ? "✅ 入場済" : "🔵 予約中"}</div>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                          {res.status !== 'used' ? (
                                              <button onClick={() => forceToggleStatus(res, 'used')} className="bg-green-700 text-xs px-2 py-1 rounded hover:bg-green-600">強制入場にする</button>
                                          ) : (
                                              <button onClick={() => forceToggleStatus(res, 'reserved')} className="bg-gray-600 text-xs px-2 py-1 rounded hover:bg-gray-500">入場取消(戻す)</button>
                                          )}
                                          <button onClick={() => forceDeleteReservation(res)} className="bg-red-700 text-xs px-2 py-1 rounded hover:bg-red-600">💣 予約抹消</button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>

                  {/* B. 新規ねじ込み予約 */}
                  <div className="border-t border-gray-700 pt-6">
                      <h3 className="text-lg font-bold text-yellow-400 mb-2">▼ 強制追加予約 (Force Add)</h3>
                      <div className="bg-gray-800 p-4 rounded grid gap-4">
                          <select 
                            className="bg-black text-white p-2 rounded border border-gray-600"
                            value={addShopId}
                            onChange={(e) => setAddShopId(e.target.value)}
                          >
                              <option value="">会場を選択...</option>
                              {attractions.map(shop => (
                                  <option key={shop.id} value={shop.id}>{shop.name} ({shop.id})</option>
                              ))}
                          </select>
                          
                          <div className="flex gap-2">
                              <input 
                                type="time" 
                                className="bg-black text-white p-2 rounded border border-gray-600 flex-1"
                                value={addTime}
                                onChange={(e) => setAddTime(e.target.value)}
                              />
                              <button 
                                onClick={forceAddReservation}
                                className="bg-yellow-600 hover:bg-yellow-500 text-black font-bold px-4 py-2 rounded"
                              >
                                  ＋ ねじ込む
                              </button>
                          </div>
                          <p className="text-xs text-red-400">※ 定員オーバーでも強制的に予約を追加します。</p>
                      </div>
                  </div>

              </div>
          </div>
      )}

      {/* 参考: 現在の店舗リスト(デバッグ用) */}
      <div className="mt-12 text-xs text-gray-600 border-t border-gray-800 pt-4">
          <p>Managed Venues: {attractions.map(a => a.id).join(", ")}</p>
      </div>

    </div>
  );
}
