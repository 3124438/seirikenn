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

  // UI表示切り替え用（true=ホワイトリスト編集, false=ブラックリスト編集）
  const [showGuestWhite, setShowGuestWhite] = useState(false);
  const [showStudentWhite, setShowStudentWhite] = useState(false);

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

  // --- ★重要: 会場を選択した瞬間に、その会場のモードに合わせて編集画面をセットする ---
  useEffect(() => {
    if (selectedConfigShopId) {
        const shop = attractions.find(s => s.id === selectedConfigShopId);
        if (shop) {
            // DBに設定がない(undefined)場合も 'black' (false) として扱い、全員許可状態（ブラックリスト編集）にする
            setShowGuestWhite(shop.guestListType === "white");
            setShowStudentWhite(shop.studentListType === "white");
        }
    }
  }, [selectedConfigShopId, attractions]);

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

  // --- 機能: 全店舗一括停止 ---
  const toggleGlobalPause = async (currentState: boolean) => {
      if(!confirm(currentState ? "全店舗の受付を再開させますか？" : "全店舗 緊急停止しますか？")) return;
      attractions.forEach(async (shop) => {
          await updateDoc(doc(db, "attractions", shop.id), { isPaused: !currentState });
      });
  };

  // --- 機能: モード切替（White/Black） ---
  const toggleListMode = async (type: "guest" | "student") => {
      if (!selectedConfigShopId) return;
      const targetShop = attractions.find(s => s.id === selectedConfigShopId);
      if(!targetShop) return;
      
      const field = type === "guest" ? "guestListType" : "studentListType";
      // undefinedの場合は "black" 扱いなので、次は "white" になる
      const currentMode = targetShop[field] === "white" ? "white" : "black";
      const newMode = currentMode === "white" ? "black" : "white";

      if (!confirm(`設定を「${newMode === "white" ? "ホワイトリスト(許可制)" : "ブラックリスト(拒否制)"}」に変更しますか？\n\n※ホワイトリストにすると、登録されていない人は一切操作できなくなります。`)) return;

      await updateDoc(doc(db, "attractions", selectedConfigShopId), {
          [field]: newMode
      });
      
      // UIも即座に同期
      if(type === "guest") setShowGuestWhite(newMode === "white");
      else setShowStudentWhite(newMode === "white");
  };

  // --- 機能: 全ユーザー一括追加（救済措置） ---
  const addAllUsersToWhiteList = async (type: "guest" | "student") => {
      if (!selectedConfigShopId) return;
      const targetShop = attractions.find(s => s.id === selectedConfigShopId);
      if(!targetShop) return;
      
      const field = type === "guest" ? "userAllowedUsers" : "adminAllowedUsers";
      const currentList = targetShop[field] || [];
      const idsToAdd = allUserIds.filter(id => !currentList.includes(id));

      if(idsToAdd.length === 0) return alert("追加対象の新規ユーザーはいません。（全員登録済み）");

      if(!confirm(`【注意】\n現在システムで認識している全ユーザー(${idsToAdd.length}人)を許可リストに追加しますか？`)) return;

      try {
          await updateDoc(doc(db, "attractions", selectedConfigShopId), {
              [field]: arrayUnion(...idsToAdd)
          });
          alert("完了しました");
      } catch(e) { console.error(e); alert("エラーが発生しました。"); }
  };

  // --- 機能: リスト更新 ---
  const handleListUpdate = async (type: "guest" | "student", action: "add" | "remove", userId: string) => {
      if (!userId || !selectedConfigShopId) return;
      const targetShop = attractions.find(s => s.id === selectedConfigShopId);
      if(!targetShop) return;

      // 現在UIで表示しているリスト（White/Black）に対して操作を行う
      // showGuestWhite が true なら AllowedUsers を操作、false なら BannedUsers を操作
      const isUiWhite = type === "guest" ? showGuestWhite : showStudentWhite;
      
      const targetField = type === "guest" 
          ? (isUiWhite ? "userAllowedUsers" : "userBannedUsers")
          : (isUiWhite ? "adminAllowedUsers" : "adminBannedUsers");

      try {
          await updateDoc(doc(db, "attractions", selectedConfigShopId), {
              [targetField]: action === "add" ? arrayUnion(userId) : arrayRemove(userId)
          });
          if(action === "add") setConfigInputUserId(""); 
      } catch (e) { console.error(e); alert("更新エラー"); }
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

  const targetShop = attractions.find(s => s.id === selectedConfigShopId);
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
              <span>裏管理コンソール</span>
          </h1>

          {/* --- A. 特定ユーザー操作パネル (常時一番上に配置) --- */}
          <section className="mb-10 bg-blue-900/10 border border-blue-800 rounded p-6 shadow-lg shadow-blue-900/20">
              <h2 className="text-xl font-bold text-blue-400 mb-4 flex items-center gap-2">
                  <span>特定ユーザー操作</span>
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
                  <span className="text-xl font-bold">🛠️ 会場設定 (リスト管理)</span>
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
                                    className={`p-5 rounded border text-left hover:bg-gray-800 transition shadow-lg
                                        ${shop.isPaused ? 'border-red-500 bg-red-900/20' : 'border-gray-600 bg-black'}`}
                                  >
                                      <div className="flex justify-between items-start mb-2">
                                          <span className="text-2xl font-mono text-yellow-500">{shop.id}</span>
                                          {shop.isPaused && <span className="bg-red-600 text-white text-[10px] px-2 py-1 rounded">停止中</span>}
                                      </div>
                                      <span className="text-lg font-bold text-white block">{shop.name}</span>
                                      <div className="mt-2 text-[10px] text-gray-400 flex gap-2">
                                          <span>客: {shop.guestListType === 'white' ? '許可制' : '拒否制(全員OK)'}</span>
                                          <span>生: {shop.studentListType === 'white' ? '許可制' : '拒否制(全員OK)'}</span>
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

                              {/* 受付スイッチ */}
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

                              {/* リスト追加用入力欄 */}
                              <div className="mb-4">
                                  <label className="text-xs text-gray-500 block mb-1">リストに追加するID (左サイドバーで選択可)</label>
                                  <input 
                                    className="w-full bg-black text-white border border-green-500 p-2 rounded"
                                    placeholder="IDを入力..."
                                    value={configInputUserId}
                                    onChange={e => setConfigInputUserId(e.target.value.toUpperCase())}
                                  />
                              </div>

                              <div className="grid md:grid-cols-2 gap-6">
                                  {/* 客設定 */}
                                  <div className={`p-4 rounded border transition duration-300 ${showGuestWhite ? 'border-white bg-green-900/20' : 'border-gray-600 bg-black'}`}>
                                      <div className="flex justify-between items-center mb-2">
                                          <h3 className="font-bold">一般客設定</h3>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs">{showGuestWhite ? '現在: ホワイト(許可)リスト' : '現在: ブラック(拒否)リスト'}</span>
                                            <button 
                                                onClick={() => toggleListMode("guest")} 
                                                className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded border border-gray-500"
                                            >
                                                モード切替
                                            </button>
                                          </div>
                                      </div>
                                      <p className="text-xs mb-4 text-gray-400">
                                          {showGuestWhite 
                                            ? "※ リストにいる人だけが予約できます" 
                                            : "※ 基本全員OK (リストの人だけ拒否)"}
                                      </p>
                                      
                                      <button 
                                        onClick={() => handleListUpdate("guest", "add", configInputUserId)}
                                        className={`w-full py-2 rounded font-bold mb-2 ${showGuestWhite ? 'bg-green-700 text-white' : 'bg-red-900 text-white'}`}
                                      >
                                          {showGuestWhite ? "ホワイトリストに追加" : "ブラックリストに追加(BAN)"}
                                      </button>

                                      {/* 救済ボタン (Whiteモードのみ) */}
                                      {showGuestWhite && (
                                          <button 
                                            onClick={() => addAllUsersToWhiteList("guest")}
                                            className="w-full py-2 mb-4 bg-green-900/50 border border-green-500 text-green-200 text-xs rounded hover:bg-green-800"
                                          >
                                              ＋ 全ユーザーを一括許可 (救済)
                                          </button>
                                      )}

                                      <ul className="text-sm space-y-1 max-h-40 overflow-y-auto bg-black/30 p-2 rounded">
                                          {(showGuestWhite ? targetShop.userAllowedUsers : targetShop.userBannedUsers)?.map((uid: string) => (
                                              <li key={uid} className="flex justify-between border-b border-gray-700 py-1">
                                                  <span>{uid}</span>
                                                  <button onClick={() => handleListUpdate("guest", "remove", uid)} className="text-red-500 hover:text-red-300">削除</button>
                                              </li>
                                          ))}
                                          <li className="text-[10px] text-right text-gray-500 mt-2">
                                            {(showGuestWhite ? targetShop.userAllowedUsers : targetShop.userBannedUsers)?.length || 0}人 登録中
                                          </li>
                                      </ul>
                                  </div>

                                  {/* 生徒設定 */}
                                  <div className={`p-4 rounded border transition duration-300 ${showStudentWhite ? 'border-blue-400 bg-blue-900/10' : 'border-purple-900 bg-purple-900/10'}`}>
                                      <div className="flex justify-between items-center mb-2">
                                          <h3 className="font-bold text-blue-300">運営生徒設定</h3>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs">{showStudentWhite ? '現在: ホワイト(許可)' : '現在: ブラック(拒否)'}</span>
                                            <button 
                                                onClick={() => toggleListMode("student")} 
                                                className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded border border-gray-500"
                                            >
                                                モード切替
                                            </button>
                                          </div>
                                      </div>
                                      <p className="text-xs mb-4 text-gray-400">
                                          {showStudentWhite 
                                            ? "※ リストにいる人だけが管理画面に入れます" 
                                            : "※ 基本全員OK (リストの人だけ拒否)"}
                                      </p>

                                      <button 
                                        onClick={() => handleListUpdate("student", "add", configInputUserId)}
                                        className={`w-full py-2 rounded font-bold mb-2 ${showStudentWhite ? 'bg-blue-600 text-white' : 'bg-purple-800 text-white'}`}
                                      >
                                          {showStudentWhite ? "ホワイトリストに追加" : "ブラックリストに追加(BAN)"}
                                      </button>

                                      {/* 救済ボタン (Whiteモードのみ) */}
                                      {showStudentWhite && (
                                          <button 
                                            onClick={() => addAllUsersToWhiteList("student")}
                                            className="w-full py-2 mb-4 bg-blue-900/50 border border-blue-500 text-blue-200 text-xs rounded hover:bg-blue-800"
                                          >
                                              ＋ 全ユーザーを一括許可 (救済)
                                          </button>
                                      )}

                                      <ul className="text-sm space-y-1 max-h-40 overflow-y-auto bg-black/30 p-2 rounded">
                                          {(showStudentWhite ? targetShop.adminAllowedUsers : targetShop.adminBannedUsers)?.map((uid: string) => (
                                              <li key={uid} className="flex justify-between border-b border-gray-700 py-1">
                                                  <span>{uid}</span>
                                                  <button onClick={() => handleListUpdate("student", "remove", uid)} className="text-red-500 hover:text-red-300">削除</button>
                                              </li>
                                          ))}
                                      </ul>
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
