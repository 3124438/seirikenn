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

  // --- 2. 会場設定セクション用ステート ---
  const [showVenueConfig, setShowVenueConfig] = useState(false); 
  const [selectedConfigShopId, setSelectedConfigShopId] = useState<string | null>(null);
  const [configInputUserId, setConfigInputUserId] = useState(""); // リスト追加用

  // 左側サイドバー検索用
  const [userSearchQuery, setUserSearchQuery] = useState("");

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    const unsub = onSnapshot(collection(db, "attractions"), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttractions(data);
    });
    return () => unsub();
  }, []);

  // --- ヘルパー: ID抽出 ---
  const allUserIds = useMemo(() => {
      const ids = new Set<string>();
      attractions.forEach(shop => {
          shop.reservations?.forEach((res: any) => { if (res.userId) ids.add(res.userId); });
          shop.adminAllowedUsers?.forEach((id: string) => ids.add(id));
          shop.adminBannedUsers?.forEach((id: string) => ids.add(id));
          shop.userAllowedUsers?.forEach((id: string) => ids.add(id));
          shop.userBannedUsers?.forEach((id: string) => ids.add(id));
      });
      return Array.from(ids).sort();
  }, [attractions]);

  // --- 検索ロジック ---
  const filteredUserIds = useMemo(() => {
      if (!userSearchQuery) return allUserIds;
      const keywords = userSearchQuery.toUpperCase().split(/\s+/).filter(k => k.length > 0);
      return allUserIds.filter(id => {
          const idUpper = id.toUpperCase();
          return keywords.every(keyword => idUpper.includes(keyword));
      });
  }, [allUserIds, userSearchQuery]);

  // --- ID選択時の共通処理 ---
  const selectUser = (id: string) => {
      setTargetStudentId(id);       // 上部のユーザー操作用
      setConfigInputUserId(id);     // 下部の会場設定用
  };

  // --- 機能実装 ---
  const toggleGlobalPause = async (currentState: boolean) => {
      if(!confirm(currentState ? "全店舗の受付を再開させますか？" : "全店舗 緊急停止しますか？")) return;
      attractions.forEach(async (shop) => {
          await updateDoc(doc(db, "attractions", shop.id), { isPaused: !currentState });
      });
  };

  const fetchStudentData = () => {
    if(!targetStudentId) return alert("ユーザーを選択またはIDを入力してください");
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

  // --- リストモード切替 (重要修正: DBのフラグを更新) ---
  const toggleListMode = async (type: "guest" | "student") => {
      if (!selectedConfigShopId || !targetShop) return;
      
      // guestListType または studentListType というフィールドで管理 ("white" or "black")
      const field = type === "guest" ? "guestListType" : "studentListType";
      const currentMode = targetShop[field] === "white" ? "white" : "black";
      const newMode = currentMode === "white" ? "black" : "white";

      const label = type === "guest" ? "一般客" : "運営生徒";
      if (!confirm(`${label}の設定を「${newMode === "white" ? "ホワイトリスト(許可制)" : "ブラックリスト(拒否制)"}」に変更しますか？\n\n※設定は即座に反映されます。`)) return;

      await updateDoc(doc(db, "attractions", selectedConfigShopId), {
          [field]: newMode
      });
  };

  // --- リストへの追加/削除 ---
  const handleListUpdate = async (type: "guest" | "student", userId: string) => {
      if (!userId || !selectedConfigShopId || !targetShop) return;
      
      // 現在のモードを取得
      const isWhite = (type === "guest" ? targetShop.guestListType : targetShop.studentListType) === "white";

      // モードに合わせて追加すべき配列を決める
      // Whiteモードなら -> AllowedUsersに追加, BannedUsersから削除
      // Blackモードなら -> BannedUsersに追加, AllowedUsersから削除
      const targetField = type === "guest" 
          ? (isWhite ? "userAllowedUsers" : "userBannedUsers")
          : (isWhite ? "adminAllowedUsers" : "adminBannedUsers");
      
      const oppositeField = type === "guest"
          ? (isWhite ? "userBannedUsers" : "userAllowedUsers")
          : (isWhite ? "adminBannedUsers" : "adminAllowedUsers");

      try {
          await updateDoc(doc(db, "attractions", selectedConfigShopId), {
              [targetField]: arrayUnion(userId),
              [oppositeField]: arrayRemove(userId)
          });
          setConfigInputUserId(""); 
      } catch (e) { console.error(e); alert("更新エラー"); }
  };

  const handleRemoveFromList = async (field: string, userId: string) => {
      if (!selectedConfigShopId) return;
      if (!confirm(`${userId} をリストから削除しますか？`)) return;
      await updateDoc(doc(db, "attractions", selectedConfigShopId), { [field]: arrayRemove(userId) });
  };

  const targetShop = attractions.find(s => s.id === selectedConfigShopId);
  
  // ターゲットショップの現在のモード判定 (DB値依存)
  const isGuestWhite = targetShop?.guestListType === "white";
  const isStudentWhite = targetShop?.studentListType === "white";

  const targetShopTimes = useMemo(() => {
      const shop = attractions.find(s => s.id === addShopId);
      if (!shop || !shop.slots) return [];
      return Object.keys(shop.slots).sort();
  }, [addShopId, attractions]);

  return (
    <div className="flex h-screen bg-black text-green-500 font-mono overflow-hidden">
      
      {/* ================= 左サイドバー (常時表示) ================= */}
      <aside className="w-1/4 min-w-[250px] border-r border-green-900 flex flex-col bg-gray-900/50">
          <div className="p-4 border-b border-green-900">
              <h2 className="text-lg font-bold text-white mb-2">DB: 全ユーザー一覧</h2>
              <div className="relative">
                  <input 
                      className="w-full bg-black text-white border border-gray-600 p-2 pr-8 rounded text-sm outline-none focus:border-green-500"
                      placeholder="ID検索 (例: A 2)"
                      value={userSearchQuery}
                      onChange={e => setUserSearchQuery(e.target.value)}
                  />
                  {userSearchQuery && (
                      <button onClick={() => setUserSearchQuery("")} className="absolute right-2 top-2 text-gray-500 hover:text-white">✕</button>
                  )}
              </div>
              <p className="text-xs text-gray-500 mt-2 text-right">{filteredUserIds.length} 件ヒット</p>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
              {filteredUserIds.length > 0 ? (
                  filteredUserIds.map(id => (
                      <button 
                        key={id} 
                        onClick={() => selectUser(id)}
                        className={`w-full text-left text-sm p-3 border-b border-gray-800 hover:bg-green-900/30 transition flex items-center justify-between
                            ${(targetStudentId === id || configInputUserId === id) ? "bg-green-900/50 text-white border-l-4 border-l-green-500" : "text-gray-300"}`}
                      >
                          <span className="font-mono">{id}</span>
                          <span className="text-[10px] text-gray-600">選択</span>
                      </button>
                  ))
              ) : (
                  <div className="p-4 text-center text-gray-600 text-sm">ユーザーが見つかりません</div>
              )}
          </div>
      </aside>

      {/* ================= 右メインコンテンツ (スクロール可) ================= */}
      <main className="flex-1 overflow-y-auto p-6 relative">
          <h1 className="text-3xl font-bold mb-6 border-b border-green-800 pb-2 flex justify-between items-center">
              <span>裏管理コンソール v11.1 <span className="text-xs bg-green-900 text-white px-2 rounded">DB連動版</span></span>
          </h1>

          {/* --- A. 特定ユーザー操作パネル (常時一番上に配置) --- */}
          <section className="mb-10 bg-blue-900/10 border border-blue-800 rounded p-6 shadow-lg shadow-blue-900/20">
              <h2 className="text-xl font-bold text-blue-400 mb-4 flex items-center gap-2">
                  <span>💀 特定ユーザー操作</span>
                  <span className="text-xs text-gray-400 font-normal">（左のリストから選択するとIDが入ります）</span>
              </h2>
              <div className="flex gap-4 items-stretch">
                  <div className="flex-1">
                      <label className="text-xs text-gray-500 block mb-1">操作対象ID</label>
                      <input 
                          className="w-full bg-black border border-blue-500 text-white p-3 rounded text-2xl font-mono tracking-wider outline-none focus:ring-2 ring-blue-500" 
                          placeholder="ID未選択" 
                          value={targetStudentId}
                          onChange={(e) => setTargetStudentId(e.target.value.toUpperCase())}
                      />
                  </div>
                  <button 
                    onClick={fetchStudentData} 
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 rounded shadow-lg text-lg transition"
                  >
                      詳細・操作パネルを開く
                  </button>
              </div>
          </section>

          {/* --- B. 会場設定が開いていない時だけ表示 --- */}
          {!showVenueConfig && (
              <section className="animate-fade-in">
                  <div className="border border-red-900/50 p-6 rounded bg-red-900/10 flex flex-col md:flex-row justify-between items-center gap-4">
                      <div>
                          <h2 className="text-xl font-bold text-red-500 mb-1">⚠️ 全店舗 緊急操作</h2>
                          <p className="text-sm text-gray-400">現在: <span className="text-white font-bold">{attractions.filter(a => a.isPaused).length}</span> 店舗が停止中</p>
                      </div>
                      <button 
                          onClick={() => toggleGlobalPause(attractions.every(a => a.isPaused))}
                          className="bg-red-800 hover:bg-red-700 text-white font-bold px-8 py-3 rounded text-lg border border-red-500 shadow-red-900/50 shadow-lg"
                      >
                          {attractions.every(a => a.isPaused) ? "全店舗を一括再開" : "全店舗を緊急停止"}
                      </button>
                  </div>
              </section>
          )}

          {/* --- C. 会場設定 (Venue Settings) --- */}
          <div className="mt-10 pt-6 border-t border-gray-800">
              <button 
                onClick={() => setShowVenueConfig(!showVenueConfig)}
                className={`w-full py-4 px-6 rounded text-left flex justify-between items-center transition
                    ${showVenueConfig ? 'bg-gray-800 text-white' : 'bg-gray-900 hover:bg-gray-800 text-green-400 border border-green-900'}`}
              >
                  <span className="text-xl font-bold">🛠️ 会場設定 (ブラックリスト/ホワイトリスト/停止管理)</span>
                  <span className="text-sm">{showVenueConfig ? "▲ 閉じる" : "▼ 開く"}</span>
              </button>

              {showVenueConfig && (
                  <div className="mt-4 p-4 bg-gray-900 border border-gray-700 rounded animate-fade-in min-h-[500px]">
                      {!selectedConfigShopId ? (
                          // 一覧表示
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {attractions.map(shop => (
                                  <button 
                                    key={shop.id}
                                    onClick={() => setSelectedConfigShopId(shop.id)}
                                    className={`p-5 rounded border text-left hover:bg-gray-800 transition shadow-lg relative overflow-hidden
                                        ${shop.isPaused ? 'border-red-500 bg-red-900/20' : 'border-gray-600 bg-black'}`}
                                  >
                                      <div className="flex justify-between items-start mb-2 relative z-10">
                                          <span className="text-2xl font-mono text-yellow-500">{shop.id}</span>
                                          {shop.isPaused && <span className="bg-red-600 text-white text-[10px] px-2 py-1 rounded">停止中</span>}
                                      </div>
                                      <span className="text-lg font-bold text-white block relative z-10">{shop.name}</span>
                                      
                                      {/* モードインジケーター */}
                                      <div className="mt-2 flex gap-2 text-[10px] relative z-10">
                                          <span className={`px-1 rounded ${shop.guestListType === 'white' ? 'bg-white text-black' : 'bg-gray-700 text-gray-300'}`}>
                                              客: {shop.guestListType === 'white' ? 'White' : 'Black'}
                                          </span>
                                          <span className={`px-1 rounded ${shop.studentListType === 'white' ? 'bg-blue-200 text-blue-900' : 'bg-purple-900 text-purple-200'}`}>
                                              生: {shop.studentListType === 'white' ? 'White' : 'Black'}
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

                              {/* 1. 受付スイッチ */}
                              <div className="flex items-center justify-between bg-black p-4 rounded border border-gray-600 mb-8">
                                  <div>
                                      <h3 className="font-bold text-white">受付ステータス</h3>
                                      <p className="text-xs text-gray-500">{targetShop.isPaused ? "現在: 停止中" : "現在: 稼働中"}</p>
                                  </div>
                                  <button 
                                    onClick={() => updateDoc(doc(db, "attractions", targetShop.id), { isPaused: !targetShop.isPaused })}
                                    className={`px-6 py-2 rounded font-bold ${targetShop.isPaused ? 'bg-red-600 text-white' : 'bg-green-600 text-black'}`}
                                  >
                                      {targetShop.isPaused ? "停止中 (再開する)" : "稼働中 (停止する)"}
                                  </button>
                              </div>

                              {/* 共通: ID入力欄 */}
                              <div className="mb-4">
                                  <label className="text-xs text-gray-500 block mb-1">リストに追加するID (左サイドバーで選択すると自動入力)</label>
                                  <input 
                                    className="w-full bg-black text-white border border-green-500 p-2 rounded"
                                    placeholder="IDを入力..."
                                    value={configInputUserId}
                                    onChange={e => setConfigInputUserId(e.target.value.toUpperCase())}
                                  />
                              </div>

                              <div className="grid md:grid-cols-2 gap-6">
                                  
                                  {/* 2. 客設定 (Guests) */}
                                  <div className={`p-4 rounded border transition-colors duration-300 ${isGuestWhite ? 'border-white bg-gray-800' : 'border-gray-600 bg-black'}`}>
                                      <div className="flex justify-between items-center mb-2">
                                          <h3 className="font-bold">👽 一般客設定</h3>
                                          <div className="flex items-center gap-2">
                                              <span className={`text-[10px] px-2 py-0.5 rounded ${isGuestWhite ? 'bg-white text-black' : 'bg-gray-700 text-gray-400'}`}>
                                                  {isGuestWhite ? "Whitebox Mode" : "Blackbox Mode"}
                                              </span>
                                              <button 
                                                onClick={() => toggleListMode("guest")} 
                                                className="text-xs underline text-green-400 hover:text-white"
                                              >
                                                  モード切替
                                              </button>
                                          </div>
                                      </div>
                                      <p className="text-xs mb-4 text-gray-400 min-h-[32px]">
                                          {isGuestWhite 
                                            ? "【許可制】リストにあるIDのみ予約できます。（他は全員拒否）" 
                                            : "【拒否制】リストにあるIDは予約できません。（他は全員許可）"}
                                      </p>
                                      
                                      <button 
                                        onClick={() => handleListUpdate("guest", configInputUserId)}
                                        className={`w-full py-2 rounded font-bold mb-4 transition ${isGuestWhite ? 'bg-white text-black hover:bg-gray-200' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                                      >
                                          {isGuestWhite ? "ホワイトリストに追加 (許可)" : "ブラックリストに追加 (拒否)"}
                                      </button>

                                      <div className="bg-black/30 p-2 rounded max-h-40 overflow-y-auto custom-scrollbar">
                                          <h4 className="text-xs font-bold text-gray-500 mb-2 border-b border-gray-700 pb-1">
                                              {isGuestWhite ? "許可リスト (Allowed)" : "拒否リスト (Banned)"}
                                          </h4>
                                          <ul className="text-sm space-y-1">
                                              {(isGuestWhite ? targetShop.userAllowedUsers : targetShop.userBannedUsers)?.map((uid: string) => (
                                                  <li key={uid} className="flex justify-between border-b border-gray-800 py-1">
                                                      <span>{uid}</span>
                                                      <button onClick={() => handleRemoveFromList(isGuestWhite ? "userAllowedUsers" : "userBannedUsers", uid)} className="text-red-500 hover:text-red-300">×</button>
                                                  </li>
                                              ))}
                                              {(!(isGuestWhite ? targetShop.userAllowedUsers : targetShop.userBannedUsers)?.length) && (
                                                  <li className="text-gray-600 text-xs italic">リストは空です</li>
                                              )}
                                          </ul>
                                      </div>
                                  </div>

                                  {/* 3. 生徒設定 (Students) */}
                                  <div className={`p-4 rounded border transition-colors duration-300 ${isStudentWhite ? 'border-blue-400 bg-blue-900/10' : 'border-purple-900 bg-purple-900/10'}`}>
                                      <div className="flex justify-between items-center mb-2">
                                          <h3 className="font-bold text-blue-300">🎓 運営生徒設定</h3>
                                          <div className="flex items-center gap-2">
                                              <span className={`text-[10px] px-2 py-0.5 rounded ${isStudentWhite ? 'bg-blue-500 text-white' : 'bg-purple-900 text-purple-300'}`}>
                                                  {isStudentWhite ? "Whitebox Mode" : "Blackbox Mode"}
                                              </span>
                                              <button 
                                                onClick={() => toggleListMode("student")} 
                                                className="text-xs underline text-green-400 hover:text-white"
                                              >
                                                  モード切替
                                              </button>
                                          </div>
                                      </div>
                                      <p className="text-xs mb-4 text-gray-400 min-h-[32px]">
                                          {isStudentWhite 
                                            ? "【許可制】リストにあるIDのみ管理画面に入れます。" 
                                            : "【拒否制】リストにあるIDは管理画面に入れません。"}
                                      </p>

                                      <button 
                                        onClick={() => handleListUpdate("student", configInputUserId)}
                                        className={`w-full py-2 rounded font-bold mb-4 transition ${isStudentWhite ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-purple-800 text-white hover:bg-purple-700'}`}
                                      >
                                          {isStudentWhite ? "ホワイトリストに追加 (許可)" : "ブラックリストに追加 (拒否)"}
                                      </button>
                                      
                                      <div className="bg-black/30 p-2 rounded max-h-40 overflow-y-auto custom-scrollbar">
                                          <h4 className="text-xs font-bold text-gray-500 mb-2 border-b border-gray-700 pb-1">
                                              {isStudentWhite ? "許可リスト (Allowed)" : "拒否リスト (Banned)"}
                                          </h4>
                                          <ul className="text-sm space-y-1">
                                              {(isStudentWhite ? targetShop.adminAllowedUsers : targetShop.adminBannedUsers)?.map((uid: string) => (
                                                  <li key={uid} className="flex justify-between border-b border-gray-800 py-1">
                                                      <span>{uid}</span>
                                                      <button onClick={() => handleRemoveFromList(isStudentWhite ? "adminAllowedUsers" : "adminBannedUsers", uid)} className="text-red-500 hover:text-red-300">×</button>
                                                  </li>
                                              ))}
                                              {(!(isStudentWhite ? targetShop.adminAllowedUsers : targetShop.adminBannedUsers)?.length) && (
                                                  <li className="text-gray-600 text-xs italic">リストは空です</li>
                                              )}
                                          </ul>
                                      </div>
                                  </div>

                              </div>
                          </div>
                      )}
                  </div>
              )}
          </div>
      </main>

      {/* ================= モーダル: ユーザー詳細操作 ================= */}
      {isModalOpen && (
          <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 border border-green-600 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl p-6">
                  <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                      <h2 className="text-2xl font-bold text-white">操作対象: <span className="text-yellow-400">{targetStudentId}</span></h2>
                      <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white text-3xl">×</button>
                  </div>

                  {/* 予約リスト */}
                  <div className="mb-8">
                      <h3 className="text-sm font-bold text-gray-400 mb-2">現在の予約状況</h3>
                      <div className="space-y-2">
                          {studentReservations.map((res, idx) => (
                              <div key={idx} className="bg-black border border-gray-700 p-3 rounded flex justify-between items-center">
                                  <div>
                                      <div className="text-white font-bold">{res.shopName}</div>
                                      <div className="text-xs text-gray-500">{res.time}</div>
                                  </div>
                                  <div className="flex gap-2">
                                      <button onClick={() => forceToggleStatus(res, res.status === 'used' ? 'reserved' : 'used')} className="bg-gray-700 text-xs px-2 py-1 rounded hover:bg-gray-600">
                                          {res.status === 'used' ? '↩️ 未入場に戻す' : '✅ 入場済にする'}
                                      </button>
                                      <button onClick={() => forceDeleteReservation(res)} className="bg-red-900 text-red-200 text-xs px-2 py-1 rounded hover:bg-red-800">🗑️ 削除</button>
                                  </div>
                              </div>
                          ))}
                          {studentReservations.length === 0 && <p className="text-gray-600 text-sm">予約データはありません</p>}
                      </div>
                  </div>

                  {/* ねじ込み予約 */}
                  <div className="border-t border-gray-700 pt-6">
                      <h3 className="text-sm font-bold text-yellow-500 mb-2">強制予約追加 (ねじ込み)</h3>
                      <div className="grid gap-4 bg-gray-800 p-4 rounded">
                          <select 
                            className="bg-black text-white p-2 rounded border border-gray-600"
                            value={addShopId}
                            onChange={(e) => { setAddShopId(e.target.value); setAddTime(""); }}
                          >
                              <option value="">会場を選択してください...</option>
                              {attractions.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
                          </select>
                          
                          <div className="flex gap-2">
                              <select 
                                className="bg-black text-white p-2 rounded border border-gray-600 flex-1 disabled:opacity-50"
                                value={addTime}
                                onChange={(e) => setAddTime(e.target.value)}
                                disabled={!addShopId}
                              >
                                  <option value="">時間を選択...</option>
                                  {targetShopTimes.map(t => (
                                      <option key={t} value={t}>{t}</option>
                                  ))}
                              </select>
                              <button onClick={forceAddReservation} className="bg-yellow-600 text-black font-bold px-4 rounded hover:bg-yellow-500">追加実行</button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
