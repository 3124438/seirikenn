"use client";
import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../../../firebase"; 
import { collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function HackPage() {
  const [attractions, setAttractions] = useState<any[]>([]);
  
  // --- 1. ユーザー詳細管理用ステート ---
  const [targetStudentId, setTargetStudentId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [studentReservations, setStudentReservations] = useState<any[]>([]);

  // 強制予約用
  const [addShopId, setAddShopId] = useState("");
  const [addTime, setAddTime] = useState("");

  // --- 2. 下部: 会場設定セクション用ステート ---
  const [showVenueConfig, setShowVenueConfig] = useState(false); // エリア表示/非表示
  const [selectedConfigShopId, setSelectedConfigShopId] = useState<string | null>(null); // 編集中の会場ID
  const [userSearchQuery, setUserSearchQuery] = useState(""); // 左側のユーザー検索
  const [configInputUserId, setConfigInputUserId] = useState(""); // リストに追加するID入力欄

  // リスト表示切り替え (true = Whitebox表示, false = Blackbox表示)
  const [showGuestWhite, setShowGuestWhite] = useState(false);
  const [showStudentWhite, setShowStudentWhite] = useState(false);

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    const unsub = onSnapshot(collection(db, "attractions"), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttractions(data);
    });
    return () => unsub();
  }, []);

  // --- ヘルパー: 全予約からユニークなユーザーIDを抽出 ---
  const allUserIds = useMemo(() => {
      const ids = new Set<string>();
      attractions.forEach(shop => {
          shop.reservations?.forEach((res: any) => {
              if (res.userId) ids.add(res.userId);
          });
          // 既存のリストにあるIDも含める
          shop.adminAllowedUsers?.forEach((id: string) => ids.add(id));
          shop.adminBannedUsers?.forEach((id: string) => ids.add(id));
          shop.userAllowedUsers?.forEach((id: string) => ids.add(id));
          shop.userBannedUsers?.forEach((id: string) => ids.add(id));
      });
      return Array.from(ids).sort();
  }, [attractions]);

  // --- 検索ロジック (キーワード検索対応) ---
  const filteredUserIds = useMemo(() => {
      if (!userSearchQuery) return allUserIds;
      
      // スペース区切りでAND検索に対応 (例: "X 2" -> Xと2が含まれるID)
      const keywords = userSearchQuery.toUpperCase().split(/\s+/).filter(k => k.length > 0);
      
      return allUserIds.filter(id => {
          const idUpper = id.toUpperCase();
          return keywords.every(keyword => idUpper.includes(keyword));
      });
  }, [allUserIds, userSearchQuery]);


  // --- 機能A: グローバル操作 ---
  const toggleGlobalPause = async (currentState: boolean) => {
      if(!confirm(currentState ? "全店舗の受付を再開させますか？" : "全店舗 緊急停止しますか？")) return;
      attractions.forEach(async (shop) => {
          await updateDoc(doc(db, "attractions", shop.id), { isPaused: !currentState });
      });
  };

  // --- 機能B: 生徒ID指定操作 ---
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
      
      await updateDoc(doc(db, "attractions", addShopId), {
          reservations: [...(shop.reservations || []), newRes],
          slots: updatedSlots
      });
      alert(`強制予約完了: ${shop.name} @ ${addTime}`);
      fetchStudentData();
  };

  // --- 機能C: リスト操作 (Black/White Box) ---
  const handleListUpdate = async (type: "guest" | "student", listType: "white" | "black", userId: string) => {
      if (!userId || !selectedConfigShopId) return;
      
      const targetField = type === "guest" 
          ? (listType === "white" ? "userAllowedUsers" : "userBannedUsers")
          : (listType === "white" ? "adminAllowedUsers" : "adminBannedUsers");
      
      const oppositeField = type === "guest"
          ? (listType === "white" ? "userBannedUsers" : "userAllowedUsers")
          : (listType === "white" ? "adminBannedUsers" : "adminAllowedUsers");

      try {
          await updateDoc(doc(db, "attractions", selectedConfigShopId), {
              [targetField]: arrayUnion(userId),
              [oppositeField]: arrayRemove(userId)
          });
          setConfigInputUserId(""); 
      } catch (e) {
          console.error(e);
          alert("更新エラー");
      }
  };

  const handleRemoveFromList = async (field: string, userId: string) => {
      if (!selectedConfigShopId) return;
      if (!confirm(`${userId} をリストから削除しますか？`)) return;
      await updateDoc(doc(db, "attractions", selectedConfigShopId), {
          [field]: arrayRemove(userId)
      });
  };

  const targetShop = attractions.find(s => s.id === selectedConfigShopId);
  const targetShopTimes = useMemo(() => {
      const shop = attractions.find(s => s.id === addShopId);
      if (!shop || !shop.slots) return [];
      return Object.keys(shop.slots).sort();
  }, [addShopId, attractions]);


  return (
    <div className="min-h-screen bg-black text-green-500 p-6 font-mono selection:bg-green-900">
      <h1 className="text-4xl font-bold mb-8 border-b border-green-800 pb-2">HACK_CONSOLE_v10.1</h1>

      {/* --- 1. 緊急停止 --- */}
      <div className="mb-8 border border-red-900/50 p-4 rounded bg-red-900/10">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-red-500">⚠️ GLOBAL OVERRIDE</h2>
            <button 
                onClick={() => toggleGlobalPause(attractions.every(a => a.isPaused))}
                className="bg-red-700 hover:bg-red-600 text-white font-bold px-6 py-2 rounded transition"
            >
                {attractions.every(a => a.isPaused) ? "RESUME ALL" : "STOP ALL"}
            </button>
          </div>
      </div>

      {/* --- 2. 生徒ID指定操作 --- */}
      <div className="mb-12 border border-blue-900/50 p-6 rounded bg-blue-900/10">
          <h2 className="text-xl font-bold text-blue-400 mb-4">💀 TARGET USER CONTROL</h2>
          <div className="flex gap-4 items-center mb-2">
              <span className="text-xl">ID:</span>
              <input 
                className="bg-black border border-blue-500 text-white p-2 rounded text-xl flex-1 outline-none focus:ring-2 ring-blue-500" 
                placeholder="X9A2..." 
                value={targetStudentId}
                onChange={(e) => setTargetStudentId(e.target.value.toUpperCase())}
              />
              <button onClick={fetchStudentData} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2 rounded shadow-lg shadow-blue-900/50">
                  ⚡ EXECUTE
              </button>
          </div>
      </div>

      {/* --- モーダル: 詳細操作パネル --- */}
      {isModalOpen && (
          <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 border border-green-600 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl p-6">
                  <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                      <h2 className="text-2xl font-bold text-white">TARGET: <span className="text-yellow-400">{targetStudentId}</span></h2>
                      <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white text-2xl">×</button>
                  </div>

                  {/* 予約リスト */}
                  <div className="mb-8">
                      <h3 className="text-sm font-bold text-gray-400 mb-2">CURRENT RESERVATIONS</h3>
                      <div className="space-y-2">
                          {studentReservations.map((res, idx) => (
                              <div key={idx} className="bg-black border border-gray-700 p-3 rounded flex justify-between items-center">
                                  <div>
                                      <div className="text-white font-bold">{res.shopName}</div>
                                      <div className="text-xs text-gray-500">{res.time}</div>
                                  </div>
                                  <div className="flex gap-2">
                                      <button onClick={() => forceToggleStatus(res, res.status === 'used' ? 'reserved' : 'used')} className="bg-gray-700 text-xs px-2 py-1 rounded">
                                          {res.status === 'used' ? '↩️ Restore' : '✅ Admit'}
                                      </button>
                                      <button onClick={() => forceDeleteReservation(res)} className="bg-red-900 text-red-200 text-xs px-2 py-1 rounded">🗑️ Delete</button>
                                  </div>
                              </div>
                          ))}
                          {studentReservations.length === 0 && <p className="text-gray-600 text-sm">No Active Reservations</p>}
                      </div>
                  </div>

                  {/* ねじ込み予約 */}
                  <div className="border-t border-gray-700 pt-6">
                      <h3 className="text-sm font-bold text-yellow-500 mb-2">FORCE ADD RESERVATION</h3>
                      <div className="grid gap-4 bg-gray-800 p-4 rounded">
                          <select 
                            className="bg-black text-white p-2 rounded border border-gray-600"
                            value={addShopId}
                            onChange={(e) => { setAddShopId(e.target.value); setAddTime(""); }}
                          >
                              <option value="">Select Venue...</option>
                              {attractions.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
                          </select>
                          
                          <div className="flex gap-2">
                              <select 
                                className="bg-black text-white p-2 rounded border border-gray-600 flex-1 disabled:opacity-50"
                                value={addTime}
                                onChange={(e) => setAddTime(e.target.value)}
                                disabled={!addShopId}
                              >
                                  <option value="">Select Time...</option>
                                  {targetShopTimes.map(t => (
                                      <option key={t} value={t}>{t}</option>
                                  ))}
                              </select>
                              <button onClick={forceAddReservation} className="bg-yellow-600 text-black font-bold px-4 rounded">ADD</button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- 3. 会場設定 (Venue Settings) --- */}
      <div className="border-t-2 border-green-800 pt-8 mt-12">
          <button 
            onClick={() => setShowVenueConfig(!showVenueConfig)}
            className="w-full bg-gray-900 hover:bg-gray-800 text-green-400 border border-green-700 py-3 rounded text-lg font-bold mb-4"
          >
              {showVenueConfig ? "⬇️ HIDE VENUE SETTINGS" : "🛠️ OPEN VENUE SETTINGS"}
          </button>

          {showVenueConfig && (
              <div className="flex flex-col md:flex-row gap-4 h-[600px]">
                  
                  {/* 左側: ユーザーIDリスト (検索付き) */}
                  <div className="w-full md:w-1/4 bg-gray-900 border border-gray-700 rounded p-4 flex flex-col">
                      <h3 className="text-sm font-bold text-gray-400 mb-2">USER DATABASE</h3>
                      <div className="relative mb-2">
                          <input 
                              className="bg-black text-white border border-gray-600 p-2 pr-8 rounded text-sm w-full outline-none focus:border-green-500"
                              placeholder="Search ID (e.g. A2)"
                              value={userSearchQuery}
                              onChange={e => setUserSearchQuery(e.target.value)}
                          />
                          {userSearchQuery && (
                              <button 
                                onClick={() => setUserSearchQuery("")}
                                className="absolute right-2 top-2 text-gray-500 hover:text-white"
                              >
                                  ✕
                              </button>
                          )}
                      </div>
                      <div className="text-xs text-gray-500 mb-2 text-right">
                          Found: {filteredUserIds.length} users
                      </div>
                      
                      <div className="flex-1 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                          {filteredUserIds.length > 0 ? (
                              filteredUserIds.map(id => (
                                  <button 
                                    key={id} 
                                    onClick={() => { setConfigInputUserId(id); setTargetStudentId(id); }}
                                    className="w-full text-left text-xs p-2 hover:bg-green-900/30 rounded font-mono text-gray-300 truncate border-b border-gray-800"
                                  >
                                      {id}
                                  </button>
                              ))
                          ) : (
                              <div className="text-gray-600 text-xs text-center py-4">No users found</div>
                          )}
                      </div>
                  </div>

                  {/* 中央: 会場リスト または 詳細設定 */}
                  <div className="w-full md:w-3/4 bg-gray-900 border border-gray-700 rounded p-4 overflow-y-auto">
                      
                      {!selectedConfigShopId ? (
                          // 会場一覧表示モード
                          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                              {attractions.map(shop => (
                                  <button 
                                    key={shop.id}
                                    onClick={() => setSelectedConfigShopId(shop.id)}
                                    className={`p-4 rounded border text-left hover:bg-gray-800 transition ${shop.isPaused ? 'border-red-500 bg-red-900/10' : 'border-gray-600 bg-black'}`}
                                  >
                                      <span className="text-xl font-mono block text-yellow-500">{shop.id}</span>
                                      <span className="text-sm font-bold text-white">{shop.name}</span>
                                      {shop.isPaused && <span className="text-xs text-red-500 block mt-1">⛔ PAUSED</span>}
                                  </button>
                              ))}
                          </div>
                      ) : targetShop && (
                          // 詳細編集モード
                          <div className="animate-fade-in">
                              <div className="flex items-center gap-4 mb-6 border-b border-gray-700 pb-4">
                                  <button onClick={() => setSelectedConfigShopId(null)} className="text-gray-400 hover:text-white">← BACK</button>
                                  <h2 className="text-2xl font-bold text-white"><span className="text-yellow-400 font-mono">{targetShop.id}</span> {targetShop.name}</h2>
                              </div>

                              {/* A. 受付停止スイッチ */}
                              <div className="mb-6 p-4 bg-black border border-gray-600 rounded flex justify-between items-center">
                                  <div>
                                      <h3 className="font-bold text-white">RECEPTION STATUS</h3>
                                      <p className="text-xs text-gray-500">{targetShop.isPaused ? "現在: 停止中 (受付不可)" : "現在: 稼働中 (受付可)"}</p>
                                  </div>
                                  <button 
                                    onClick={() => updateDoc(doc(db, "attractions", targetShop.id), { isPaused: !targetShop.isPaused })}
                                    className={`px-4 py-2 rounded font-bold ${targetShop.isPaused ? 'bg-red-600 text-white' : 'bg-green-600 text-black'}`}
                                  >
                                      {targetShop.isPaused ? "⛔ STOPPED" : "✅ ACTIVE"}
                                  </button>
                              </div>

                              {/* 共通: 追加フォーム */}
                              <div className="mb-6 flex gap-2">
                                  <input 
                                    className="bg-black text-white border border-green-500 p-2 rounded flex-1"
                                    placeholder="Add ID to List (Select from left)"
                                    value={configInputUserId}
                                    onChange={e => setConfigInputUserId(e.target.value.toUpperCase())}
                                  />
                              </div>

                              <div className="grid md:grid-cols-2 gap-6">
                                  {/* B. 客 (Guests) 設定 */}
                                  <div className={`p-4 rounded border ${showGuestWhite ? 'border-white bg-gray-800' : 'border-gray-600 bg-black'}`}>
                                      <div className="flex justify-between items-center mb-4">
                                          <h3 className="font-bold text-lg">👽 GUESTS (予約制限)</h3>
                                          <button 
                                            onClick={() => setShowGuestWhite(!showGuestWhite)} 
                                            className="text-xs underline text-gray-400 hover:text-white"
                                          >
                                              {showGuestWhite ? "Switch to Blackbox" : "Switch to Whitebox"}
                                          </button>
                                      </div>
                                      
                                      <div className="mb-4">
                                          <span className={`text-xs font-bold px-2 py-1 rounded ${showGuestWhite ? 'bg-white text-black' : 'bg-gray-800 text-gray-300'}`}>
                                              Currently: {showGuestWhite ? "WHITEBOX (許可リスト)" : "BLACKBOX (拒否リスト)"}
                                          </span>
                                      </div>

                                      <button 
                                        onClick={() => handleListUpdate("guest", showGuestWhite ? "white" : "black", configInputUserId)}
                                        className={`w-full py-2 rounded font-bold mb-4 ${showGuestWhite ? 'bg-white text-black hover:bg-gray-200' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                                      >
                                          Add to {showGuestWhite ? "Whitebox" : "Blackbox"}
                                      </button>

                                      <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
                                          {(showGuestWhite ? targetShop.userAllowedUsers : targetShop.userBannedUsers)?.map((uid: string) => (
                                              <li key={uid} className="flex justify-between border-b border-gray-800 py-1">
                                                  <span>{uid}</span>
                                                  <button onClick={() => handleRemoveFromList(showGuestWhite ? "userAllowedUsers" : "userBannedUsers", uid)} className="text-red-500 hover:text-red-400">×</button>
                                              </li>
                                          ))}
                                          {(!targetShop.userAllowedUsers && showGuestWhite) || (!targetShop.userBannedUsers && !showGuestWhite) ? <li className="text-gray-600 italic">Empty</li> : null}
                                      </ul>
                                  </div>

                                  {/* C. 生徒 (Staff) 設定 */}
                                  <div className={`p-4 rounded border ${showStudentWhite ? 'border-blue-400 bg-blue-900/10' : 'border-purple-900 bg-purple-900/10'}`}>
                                      <div className="flex justify-between items-center mb-4">
                                          <h3 className="font-bold text-lg text-blue-300">🎓 STUDENTS (管理権限)</h3>
                                          <button 
                                            onClick={() => setShowStudentWhite(!showStudentWhite)} 
                                            className="text-xs underline text-gray-400 hover:text-white"
                                          >
                                              {showStudentWhite ? "Switch to Blackbox" : "Switch to Whitebox"}
                                          </button>
                                      </div>

                                      <div className="mb-4">
                                          <span className={`text-xs font-bold px-2 py-1 rounded ${showStudentWhite ? 'bg-blue-500 text-white' : 'bg-purple-900 text-purple-200'}`}>
                                              Currently: {showStudentWhite ? "WHITEBOX (許可リスト)" : "BLACKBOX (拒否リスト)"}
                                          </span>
                                      </div>

                                      <button 
                                        onClick={() => handleListUpdate("student", showStudentWhite ? "white" : "black", configInputUserId)}
                                        className={`w-full py-2 rounded font-bold mb-4 ${showStudentWhite ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-800 hover:bg-purple-700'}`}
                                      >
                                          Add to {showStudentWhite ? "Whitebox" : "Blackbox"}
                                      </button>

                                      <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
                                          {(showStudentWhite ? targetShop.adminAllowedUsers : targetShop.adminBannedUsers)?.map((uid: string) => (
                                              <li key={uid} className="flex justify-between border-b border-gray-800 py-1">
                                                  <span>{uid}</span>
                                                  <button onClick={() => handleRemoveFromList(showStudentWhite ? "adminAllowedUsers" : "adminBannedUsers", uid)} className="text-red-500 hover:text-red-400">×</button>
                                              </li>
                                          ))}
                                          {(!targetShop.adminAllowedUsers && showStudentWhite) || (!targetShop.adminBannedUsers && !showStudentWhite) ? <li className="text-gray-600 italic">Empty</li> : null}
                                      </ul>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          )}
      </div>
    </div>
  );
}
