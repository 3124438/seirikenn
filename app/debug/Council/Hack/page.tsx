"use client";
import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../../../firebase"; 
import { collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function HackPage() {
  const [attractions, setAttractions] = useState<any[]>([]);
  
  // --- ユーザー操作用 ---
  const [targetStudentId, setTargetStudentId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [studentReservations, setStudentReservations] = useState<any[]>([]);

  // 強制予約用
  const [addShopId, setAddShopId] = useState("");
  const [addTime, setAddTime] = useState("");

  // --- 会場設定用 ---
  const [showVenueConfig, setShowVenueConfig] = useState(false); 
  const [selectedConfigShopId, setSelectedConfigShopId] = useState<string | null>(null);
  const [inputListId, setInputListId] = useState(""); // リスト追加用ID

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    const unsub = onSnapshot(collection(db, "attractions"), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttractions(data);
    });
    return () => unsub();
  }, []);

  // --- 全ユーザーIDの抽出（一括追加機能のために必要） ---
  const allUserIds = useMemo(() => {
      const ids = new Set<string>();
      attractions.forEach(shop => {
          shop.reservations?.forEach((res: any) => { if (res.userId) ids.add(res.userId); });
          // 既存のリストに入っている人も含める
          shop.adminAllowedUsers?.forEach((id: string) => ids.add(id));
          shop.userAllowedUsers?.forEach((id: string) => ids.add(id));
      });
      return Array.from(ids).sort();
  }, [attractions]);

  // --- 機能: 全店舗一括操作 ---
  const toggleGlobalPause = async (currentState: boolean) => {
      if(!confirm(currentState ? "全店舗の受付を再開させますか？" : "全店舗 緊急停止しますか？")) return;
      attractions.forEach(async (shop) => {
          await updateDoc(doc(db, "attractions", shop.id), { isPaused: !currentState });
      });
  };

  // --- 機能: モード切替（White/Black） ---
  const toggleListMode = async (type: "guest" | "student") => {
      if (!selectedConfigShopId || !targetShop) return;
      
      const field = type === "guest" ? "guestListType" : "studentListType";
      const currentMode = targetShop[field] === "white" ? "white" : "black";
      const newMode = currentMode === "white" ? "black" : "white";

      if (!confirm(`設定を「${newMode === "white" ? "ホワイトリスト(許可制)" : "ブラックリスト(拒否制)"}」に変更しますか？\n\n※ホワイトリストにすると、登録されていない人は一切操作できなくなります。`)) return;

      await updateDoc(doc(db, "attractions", selectedConfigShopId), {
          [field]: newMode
      });
  };

  // --- 機能: リストへの追加/削除 ---
  const updateList = async (type: "guest" | "student", action: "add" | "remove", userId: string) => {
      if (!userId || !selectedConfigShopId || !targetShop) return;
      
      // 現在のモードに合わせて追加先を自動判定
      const isWhite = (type === "guest" ? targetShop.guestListType : targetShop.studentListType) === "white";
      
      // WhiteモードならAllowedに追加、BlackモードならBannedに追加
      const targetField = type === "guest" 
          ? (isWhite ? "userAllowedUsers" : "userBannedUsers")
          : (isWhite ? "adminAllowedUsers" : "adminBannedUsers");

      try {
          await updateDoc(doc(db, "attractions", selectedConfigShopId), {
              [targetField]: action === "add" ? arrayUnion(userId) : arrayRemove(userId)
          });
          if(action === "add") setInputListId("");
      } catch (e) { console.error(e); alert("エラーが発生しました"); }
  };

  // --- 機能: 全ユーザー一括追加（救済措置） ---
  const addAllUsersToWhiteList = async (type: "guest" | "student") => {
      if (!selectedConfigShopId || !targetShop) return;
      
      // WhiteListモードじゃない時は押せないようにチェックしても良いが、念のため許可
      const field = type === "guest" ? "userAllowedUsers" : "adminAllowedUsers";
      
      // 既に許可されている人を除外して、新規追加分だけ計算（通信量節約）
      const currentList = targetShop[field] || [];
      const idsToAdd = allUserIds.filter(id => !currentList.includes(id));

      if(idsToAdd.length === 0) return alert("追加対象の新規ユーザーはいません。（全員登録済み）");

      if(!confirm(`【注意】\n現在システムで認識している全ユーザー(${idsToAdd.length}人)を許可リストに追加しますか？\n\n※通信量が増えるため、どうしても必要な時だけ実行してください。`)) return;

      try {
          await updateDoc(doc(db, "attractions", selectedConfigShopId), {
              [field]: arrayUnion(...idsToAdd)
          });
          alert("完了しました");
      } catch(e) {
          console.error(e);
          alert("エラー: 一度に追加する人数が多すぎます。");
      }
  };

  // --- 特定ユーザーデータ取得 ---
  const fetchStudentData = () => {
    if(!targetStudentId) return alert("生徒IDを入力してください");
    const foundReservations: any[] = [];
    attractions.forEach(shop => {
        shop.reservations?.forEach((res: any) => {
            if(res.userId === targetStudentId) {
                foundReservations.push({ shopId: shop.id, shopName: shop.name, ...res });
            }
        });
    });
    setStudentReservations(foundReservations);
    setIsModalOpen(true);
  };

  const forceToggleStatus = async (res: any, status: "used" | "reserved") => {
      const shop = attractions.find(s => s.id === res.shopId);
      if(!shop) return;
      const otherRes = shop.reservations.filter((r: any) => r.timestamp !== res.timestamp);
      const updatedRes = { ...res, status };
      delete updatedRes.shopId; delete updatedRes.shopName;
      await updateDoc(doc(db, "attractions", res.shopId), { reservations: [...otherRes, updatedRes] });
      fetchStudentData(); 
  };

  const forceDeleteReservation = async (res: any) => {
      if(!confirm(`削除しますか？\n${res.shopName}`)) return;
      const shop = attractions.find(s => s.id === res.shopId);
      if(!shop) return;
      const otherRes = shop.reservations.filter((r: any) => r.timestamp !== res.timestamp);
      const updatedSlots = { ...shop.slots, [res.time]: Math.max(0, (shop.slots[res.time] || 1) - 1) };
      await updateDoc(doc(db, "attractions", res.shopId), { reservations: otherRes, slots: updatedSlots });
      setIsModalOpen(false);
  };

  const forceAddReservation = async () => {
      if(!addShopId || !addTime) return alert("会場と時間を選択してください");
      const shop = attractions.find(s => s.id === addShopId);
      if(!shop) return;
      const newRes = { userId: targetStudentId, timestamp: Date.now(), time: addTime, status: "reserved" };
      const currentCount = shop.slots?.[addTime] || 0;
      const updatedSlots = { ...shop.slots, [addTime]: currentCount + 1 };
      await updateDoc(doc(db, "attractions", addShopId), { reservations: [...(shop.reservations || []), newRes], slots: updatedSlots });
      alert(`予約完了: ${shop.name} @ ${addTime}`);
      fetchStudentData();
  };

  const targetShop = attractions.find(s => s.id === selectedConfigShopId);
  const targetShopTimes = useMemo(() => {
      const shop = attractions.find(s => s.id === addShopId);
      if (!shop || !shop.slots) return [];
      return Object.keys(shop.slots).sort();
  }, [addShopId, attractions]);

  return (
    <div className="min-h-screen bg-black text-green-500 font-mono p-6 pb-40">
      <h1 className="text-3xl font-bold mb-8 border-b border-green-800 pb-2">裏管理コンソール (Full Control)</h1>

      {/* --- 1. 緊急停止エリア --- */}
      <div className="mb-12 border border-red-900/50 p-6 rounded bg-red-900/10 flex justify-between items-center">
          <div>
              <h2 className="text-xl font-bold text-red-500 mb-1">⚠️ 全店舗 緊急操作</h2>
              <p className="text-sm text-gray-400">現在: <span className="text-white font-bold">{attractions.filter(a => a.isPaused).length}</span> 店舗が停止中</p>
          </div>
          <button 
              onClick={() => toggleGlobalPause(attractions.every(a => a.isPaused))}
              className="bg-red-800 hover:bg-red-700 text-white font-bold px-8 py-3 rounded text-lg border border-red-500 shadow-lg"
          >
              {attractions.every(a => a.isPaused) ? "全店舗を一括再開" : "全店舗を緊急停止"}
          </button>
      </div>

      {/* --- 2. 特定ユーザー操作 --- */}
      <div className="mb-12 border border-blue-900/50 p-6 rounded bg-blue-900/10">
          <h2 className="text-xl font-bold text-blue-400 mb-4">💀 特定ユーザー操作 (予約確認・ねじ込み)</h2>
          <div className="flex gap-4 items-center">
              <input 
                  className="bg-black border border-blue-500 text-white p-3 rounded text-xl flex-1 outline-none focus:ring-2 ring-blue-500 font-mono tracking-widest" 
                  placeholder="IDを入力 (例: X9A2)" 
                  value={targetStudentId}
                  onChange={(e) => setTargetStudentId(e.target.value.toUpperCase())}
              />
              <button onClick={fetchStudentData} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-3 rounded shadow-lg">
                  決定・操作パネル
              </button>
          </div>
      </div>

      {/* --- 3. 会場設定 (ブラック/ホワイト両対応) --- */}
      <div className="border-t-2 border-green-900 pt-8">
          <button 
            onClick={() => setShowVenueConfig(!showVenueConfig)}
            className={`w-full py-4 px-6 rounded text-left flex justify-between items-center transition
                ${showVenueConfig ? 'bg-gray-800 text-white' : 'bg-gray-900 hover:bg-gray-800 text-green-400 border border-green-800'}`}
          >
              <span className="text-xl font-bold">🛠️ 会場設定 (セキュリティ・リスト管理)</span>
              <span className="text-sm">{showVenueConfig ? "▲ 閉じる" : "▼ 開く"}</span>
          </button>

          {showVenueConfig && (
              <div className="mt-4 p-6 bg-gray-900 border border-gray-700 rounded animate-fade-in">
                  {!selectedConfigShopId ? (
                      // 会場一覧
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {attractions.map(shop => (
                              <button 
                                key={shop.id}
                                onClick={() => setSelectedConfigShopId(shop.id)}
                                className={`p-4 rounded border text-left hover:bg-gray-800 transition shadow-lg relative
                                    ${shop.isPaused ? 'border-red-500 bg-red-900/20' : 'border-gray-600 bg-black'}`}
                              >
                                  <span className="text-xl font-mono block text-yellow-500">{shop.id}</span>
                                  <span className="text-sm font-bold text-white block">{shop.name}</span>
                                  {/* モード状態表示 */}
                                  <div className="mt-2 flex gap-1">
                                    <span className={`text-[10px] px-1 rounded ${shop.guestListType === 'white' ? 'bg-white text-black' : 'bg-gray-700 text-gray-400'}`}>
                                        客:{shop.guestListType === 'white' ? '許可' : '拒否'}
                                    </span>
                                  </div>
                              </button>
                          ))}
                      </div>
                  ) : targetShop && (
                      // 詳細編集
                      <div>
                          <div className="flex items-center gap-4 mb-6 pb-4 border-b border-gray-700">
                              <button onClick={() => setSelectedConfigShopId(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm">← 一覧に戻る</button>
                              <h2 className="text-2xl font-bold text-white"><span className="text-yellow-400 font-mono">{targetShop.id}</span> {targetShop.name}</h2>
                          </div>

                          {/* A. 受付スイッチ */}
                          <div className="flex items-center justify-between bg-black p-4 rounded border border-gray-600 mb-8">
                              <div>
                                  <h3 className="font-bold text-white">受付ステータス</h3>
                                  <p className="text-xs text-gray-500">{targetShop.isPaused ? "現在: 停止中" : "現在: 稼働中"}</p>
                              </div>
                              <button 
                                onClick={() => updateDoc(doc(db, "attractions", targetShop.id), { isPaused: !targetShop.isPaused })}
                                className={`px-6 py-2 rounded font-bold ${targetShop.isPaused ? 'bg-red-600 text-white' : 'bg-green-600 text-black'}`}
                              >
                                  {targetShop.isPaused ? "再開する" : "停止する"}
                              </button>
                          </div>

                          {/* 共通ID入力欄 */}
                          <div className="mb-4 flex gap-2">
                              <input 
                                  className="bg-black text-white border border-green-500 p-2 rounded flex-1"
                                  placeholder="IDを入力してリストに追加/削除..."
                                  value={inputListId}
                                  onChange={e => setInputListId(e.target.value.toUpperCase())}
                              />
                          </div>

                          {/* B. 一般客 設定エリア */}
                          <div className="bg-black p-4 rounded border border-gray-700 mb-4">
                              <div className="flex justify-between items-center mb-4">
                                  <h3 className="font-bold text-green-400">👽 一般客 設定</h3>
                                  <div className="flex items-center gap-2">
                                      <span className="text-xs text-gray-400">現在: {targetShop.guestListType === 'white' ? "許可制 (White)" : "拒否制 (Black)"}</span>
                                      <button 
                                        onClick={() => toggleListMode("guest")} 
                                        className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-white border border-gray-500"
                                      >
                                          モード切替
                                      </button>
                                  </div>
                              </div>

                              {/* モードによってUIが少し変わる */}
                              {targetShop.guestListType === 'white' ? (
                                  <div className="bg-green-900/20 p-3 rounded border border-green-900">
                                      <div className="flex justify-between items-center mb-2">
                                          <p className="text-xs text-green-300">許可リスト (ここにいる人だけ予約可)</p>
                                          <button onClick={() => updateList("guest", "add", inputListId)} className="bg-green-700 text-white px-3 py-1 rounded text-xs">IDを追加</button>
                                      </div>
                                      <button onClick={() => addAllUsersToWhiteList("guest")} className="w-full py-2 bg-green-800/50 hover:bg-green-800 text-green-200 text-xs border border-green-600 rounded mb-2">
                                          ＋ 過去の全ユーザーを一括許可 (救済)
                                      </button>
                                      <ul className="max-h-32 overflow-y-auto text-xs space-y-1">
                                          {targetShop.userAllowedUsers?.map((uid: string) => (
                                              <li key={uid} className="flex justify-between border-b border-gray-800">
                                                  <span>{uid}</span>
                                                  <button onClick={() => updateList("guest", "remove", uid)} className="text-red-500">×</button>
                                              </li>
                                          ))}
                                          <li className="text-[10px] text-right text-gray-500">{targetShop.userAllowedUsers?.length || 0}人 登録中</li>
                                      </ul>
                                  </div>
                              ) : (
                                  <div className="bg-red-900/20 p-3 rounded border border-red-900">
                                      <div className="flex justify-between items-center mb-2">
                                          <p className="text-xs text-red-300">拒否リスト (ここにいる人は予約不可)</p>
                                          <button onClick={() => updateList("guest", "add", inputListId)} className="bg-red-700 text-white px-3 py-1 rounded text-xs">IDを追加</button>
                                      </div>
                                      <ul className="max-h-32 overflow-y-auto text-xs space-y-1">
                                          {targetShop.userBannedUsers?.map((uid: string) => (
                                              <li key={uid} className="flex justify-between border-b border-gray-800">
                                                  <span>{uid}</span>
                                                  <button onClick={() => updateList("guest", "remove", uid)} className="text-red-500">×</button>
                                              </li>
                                          ))}
                                          {!targetShop.userBannedUsers?.length && <li className="text-gray-500 italic">リストは空です (全員OK)</li>}
                                      </ul>
                                  </div>
                              )}
                          </div>

                          {/* C. 生徒(運営) 設定エリア */}
                          <div className="bg-black p-4 rounded border border-gray-700">
                              <div className="flex justify-between items-center mb-4">
                                  <h3 className="font-bold text-blue-400">🎓 運営生徒 設定</h3>
                                  <div className="flex items-center gap-2">
                                      <span className="text-xs text-gray-400">現在: {targetShop.studentListType === 'white' ? "許可制 (White)" : "拒否制 (Black)"}</span>
                                      <button 
                                        onClick={() => toggleListMode("student")} 
                                        className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-white border border-gray-500"
                                      >
                                          モード切替
                                      </button>
                                  </div>
                              </div>

                              {targetShop.studentListType === 'white' ? (
                                  <div className="bg-blue-900/20 p-3 rounded border border-blue-900">
                                      <div className="flex justify-between items-center mb-2">
                                          <p className="text-xs text-blue-300">許可リスト</p>
                                          <button onClick={() => updateList("student", "add", inputListId)} className="bg-blue-700 text-white px-3 py-1 rounded text-xs">IDを追加</button>
                                      </div>
                                      <button onClick={() => addAllUsersToWhiteList("student")} className="w-full py-2 bg-blue-800/50 hover:bg-blue-800 text-blue-200 text-xs border border-blue-600 rounded mb-2">
                                          ＋ 過去の全ユーザーを一括許可 (救済)
                                      </button>
                                      <ul className="max-h-32 overflow-y-auto text-xs space-y-1">
                                          {targetShop.adminAllowedUsers?.map((uid: string) => (
                                              <li key={uid} className="flex justify-between border-b border-gray-800">
                                                  <span>{uid}</span>
                                                  <button onClick={() => updateList("student", "remove", uid)} className="text-red-500">×</button>
                                              </li>
                                          ))}
                                      </ul>
                                  </div>
                              ) : (
                                  <div className="bg-red-900/20 p-3 rounded border border-red-900">
                                      <div className="flex justify-between items-center mb-2">
                                          <p className="text-xs text-red-300">拒否リスト</p>
                                          <button onClick={() => updateList("student", "add", inputListId)} className="bg-red-700 text-white px-3 py-1 rounded text-xs">IDを追加</button>
                                      </div>
                                      <ul className="max-h-32 overflow-y-auto text-xs space-y-1">
                                          {targetShop.adminBannedUsers?.map((uid: string) => (
                                              <li key={uid} className="flex justify-between border-b border-gray-800">
                                                  <span>{uid}</span>
                                                  <button onClick={() => updateList("student", "remove", uid)} className="text-red-500">×</button>
                                              </li>
                                          ))}
                                      </ul>
                                  </div>
                              )}
                          </div>
                      </div>
                  )}
              </div>
          )}
      </div>

      {/* --- モーダル: ユーザー詳細 (ねじ込み機能含む) --- */}
      {isModalOpen && (
          <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 border border-green-600 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl p-6">
                  <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                      <h2 className="text-xl font-bold text-white">操作対象: <span className="text-yellow-400">{targetStudentId}</span></h2>
                      <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white text-2xl">×</button>
                  </div>
                  <div className="mb-8">
                      <h3 className="text-sm font-bold text-gray-400 mb-2">現在の予約</h3>
                      <div className="space-y-2">
                          {studentReservations.map((res, idx) => (
                              <div key={idx} className="bg-black border border-gray-700 p-3 rounded flex justify-between items-center">
                                  <div>
                                      <div className="text-white font-bold text-sm">{res.shopName}</div>
                                      <div className="text-xs text-gray-500">{res.time}</div>
                                  </div>
                                  <div className="flex gap-2">
                                      <button onClick={() => forceToggleStatus(res, res.status === 'used' ? 'reserved' : 'used')} className="bg-gray-800 text-xs px-2 py-1 rounded border border-gray-600">
                                          {res.status === 'used' ? '戻す' : '入場済'}
                                      </button>
                                      <button onClick={() => forceDeleteReservation(res)} className="bg-red-900 text-white text-xs px-2 py-1 rounded">削除</button>
                                  </div>
                              </div>
                          ))}
                          {studentReservations.length === 0 && <p className="text-gray-600 text-sm">予約データはありません</p>}
                      </div>
                  </div>
                  <div className="border-t border-gray-700 pt-6">
                      <h3 className="text-sm font-bold text-yellow-500 mb-2">強制予約追加 (ねじ込み)</h3>
                      <div className="bg-gray-800 p-4 rounded">
                          <select 
                            className="w-full bg-black text-white p-2 rounded border border-gray-600 mb-2 text-sm"
                            value={addShopId}
                            onChange={(e) => { setAddShopId(e.target.value); setAddTime(""); }}
                          >
                              <option value="">会場を選択...</option>
                              {attractions.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
                          </select>
                          <div className="flex gap-2">
                              <select 
                                className="bg-black text-white p-2 rounded border border-gray-600 flex-1 text-sm disabled:opacity-50"
                                value={addTime}
                                onChange={(e) => setAddTime(e.target.value)}
                                disabled={!addShopId}
                              >
                                  <option value="">時間を選択...</option>
                                  {targetShopTimes.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                              <button onClick={forceAddReservation} className="bg-yellow-600 text-black font-bold px-4 rounded text-sm hover:bg-yellow-500">追加</button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
