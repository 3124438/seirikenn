"use client";
import { useState, useEffect } from "react";
import { db, auth } from "../../../../firebase"; 
import { collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function GodModePage() {
  const [attractions, setAttractions] = useState<any[]>([]);
  const [allUserIds, setAllUserIds] = useState<string[]>([]);
  
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [selectedShopId, setSelectedShopId] = useState<string>("");
  const [selectedShopData, setSelectedShopData] = useState<any>(null);

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);

    const unsubAttractions = onSnapshot(collection(db, "attractions"), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttractions(data);
      const ids = new Set<string>();
      data.forEach((shop: any) => {
        shop.reservations?.forEach((r: any) => ids.add(r.userId));
      });
      setAllUserIds(Array.from(ids).sort());
    });
    return () => unsubAttractions();
  }, []);

  useEffect(() => {
     if(selectedShopId) {
         const shop = attractions.find(s => s.id === selectedShopId);
         setSelectedShopData(shop);
     } else {
         setSelectedShopData(null);
     }
  }, [selectedShopId, attractions]);

  // モード切替 (通常 ⇔ 指名スタッフ限定)
  const toggleAdminRestriction = async () => {
      if(!selectedShopData) return;
      const newState = !selectedShopData.isAdminRestricted; // true = Restricted, false = Normal
      if(!confirm(`管理画面のセキュリティレベルを変更しますか？\n\n現在: ${selectedShopData.isAdminRestricted ? "🔒 指名限定 (厳重)" : "🔓 パスワードのみ (通常)"}\n変更後: ${newState ? "🔒 指名限定 (許可リスト必須)" : "🔓 パスワードのみ (誰でもOK)"}`)) return;
      
      await updateDoc(doc(db, "attractions", selectedShopId), {
          isAdminRestricted: newState
      });
  };

  // 汎用リスト操作
  const updateList = async (field: 'bannedUsers' | 'adminAllowedUsers' | 'adminBannedUsers', action: 'add' | 'remove') => {
      if(!selectedShopId || !targetUserId) return alert("店舗とユーザーを選択してください");
      
      // ユーザー確認
      if(field === 'adminAllowedUsers' && action === 'add') {
         if(!confirm(`${targetUserId} を「${selectedShopData.name}」の正規スタッフとして登録しますか？\n(制限モード時にログイン可能になります)`)) return;
      }
      if(field === 'adminBannedUsers' && action === 'add') {
         if(!confirm(`${targetUserId} の編集権限を完全に剥奪しますか？`)) return;
      }

      try {
        await updateDoc(doc(db, "attractions", selectedShopId), {
            [field]: action === 'add' ? arrayUnion(targetUserId) : arrayRemove(targetUserId)
        });
        alert("更新完了");
      } catch(e) { console.error(e); alert("エラー"); }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 font-sans text-sm">
      <header className="flex justify-between items-center border-b border-gray-700 pb-4 mb-6">
        <div>
            <h1 className="text-2xl font-bold text-red-500">裏管理システム (Hack Mode)</h1>
            <p className="text-gray-400 text-xs">Admin & Permission Control</p>
        </div>
        <div className="bg-gray-800 px-4 py-2 rounded text-right">
            <div className="text-xs text-gray-400">Detected Users</div>
            <div className="text-xl font-bold font-mono">{allUserIds.length}</div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* 1. ユーザー選択 */}
        <div className="md:col-span-1 border border-gray-700 rounded bg-gray-800 flex flex-col h-[80vh]">
          <div className="p-3 border-b border-gray-700 bg-gray-700 font-bold text-gray-300">
            1. ユーザー選択
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {allUserIds.map(id => (
              <button 
                key={id}
                onClick={() => setTargetUserId(id)}
                className={`w-full text-left px-3 py-2 rounded text-xs font-mono transition-all flex justify-between items-center
                  ${targetUserId === id ? "bg-blue-600 text-white shadow" : "hover:bg-gray-700 text-gray-400"}`}
              >
                {id}
              </button>
            ))}
          </div>
        </div>

        {/* 2. 操作エリア */}
        <div className="md:col-span-3 space-y-6">
          
          <div className="bg-gray-800 p-4 rounded border border-gray-600">
              <h3 className="font-bold text-gray-300 mb-2">2. 店舗を選択</h3>
              <select 
                className="bg-gray-900 border border-gray-600 text-white w-full p-2 rounded" 
                onChange={(e) => setSelectedShopId(e.target.value)} 
                value={selectedShopId}
              >
                <option value="">-- 選択 --</option>
                {attractions.map(s => (
                    <option key={s.id} value={s.id}>
                        {s.isAdminRestricted ? "🔒" : "🔓"} {s.name}
                    </option>
                ))}
              </select>
          </div>

          {selectedShopData && (
            <div className="space-y-6">

                {/* ★ モード切替スイッチエリア */}
                <div className="bg-gray-800 p-4 rounded border border-gray-600 flex justify-between items-center">
                    <div>
                        <h4 className="font-bold text-white">管理画面アクセス制限設定</h4>
                        <p className="text-xs text-gray-400">
                            現在: 
                            <span className={`ml-2 font-bold ${selectedShopData.isAdminRestricted ? "text-purple-400" : "text-green-400"}`}>
                                {selectedShopData.isAdminRestricted ? "🔒 指名スタッフ限定 (Whitelist)" : "🔓 通常開放 (Password Only)"}
                            </span>
                        </p>
                    </div>
                    <button 
                        onClick={toggleAdminRestriction}
                        className={`px-4 py-2 rounded font-bold text-xs ${selectedShopData.isAdminRestricted ? "bg-green-700 hover:bg-green-600 text-white" : "bg-purple-700 hover:bg-purple-600 text-white"}`}
                    >
                        {selectedShopData.isAdminRestricted ? "通常モードに戻す" : "指名限定モードにする"}
                    </button>
                </div>

                {targetUserId ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        
                        {/* A. 予約権限 (客) */}
                        <div className="bg-gray-800 p-4 rounded border-t-4 border-yellow-500 shadow-lg">
                            <h4 className="font-bold text-yellow-500 mb-2">① 予約権限 (対 客)</h4>
                            <p className="text-xs text-gray-400 mb-3 h-8">
                                この店舗の「予約」を禁止する。
                            </p>
                            <div className="flex gap-2">
                                <button onClick={() => updateList('bannedUsers', 'add')} className="flex-1 bg-red-900 hover:bg-red-700 text-red-100 py-2 rounded text-xs">BAN (禁止)</button>
                                <button onClick={() => updateList('bannedUsers', 'remove')} className="flex-1 bg-gray-700 text-white py-2 rounded text-xs">解除</button>
                            </div>
                        </div>

                        {/* B. スタッフ権限 (許可リスト) */}
                        <div className={`bg-gray-800 p-4 rounded border-t-4 shadow-lg ${selectedShopData.isAdminRestricted ? "border-purple-500 bg-purple-900/20" : "border-gray-500 opacity-50"}`}>
                            <h4 className="font-bold text-purple-400 mb-2">② スタッフ指名 (招待)</h4>
                            <p className="text-xs text-gray-300 mb-3 h-8">
                                {selectedShopData.isAdminRestricted 
                                    ? "制限モード中: このリストの人だけ管理画面に入れます。"
                                    : "※現在通常モードのため、このリストは機能しません。"}
                            </p>
                            <div className="flex gap-2">
                                <button onClick={() => updateList('adminAllowedUsers', 'add')} className="flex-1 bg-purple-700 hover:bg-purple-600 text-white py-2 rounded text-xs">リスト追加</button>
                                <button onClick={() => updateList('adminAllowedUsers', 'remove')} className="flex-1 bg-gray-700 text-white py-2 rounded text-xs">削除</button>
                            </div>
                        </div>

                        {/* C. 編集権限剥奪 (追放) */}
                        <div className="bg-gray-800 p-4 rounded border-t-4 border-red-600 shadow-lg">
                            <h4 className="font-bold text-red-500 mb-2">③ 編集権限剥奪 (追放)</h4>
                            <p className="text-xs text-gray-400 mb-3 h-8">
                                管理画面へのアクセスを完全にブロックする。
                            </p>
                            <div className="flex gap-2">
                                <button onClick={() => updateList('adminBannedUsers', 'add')} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded text-xs">ブロック</button>
                                <button onClick={() => updateList('adminBannedUsers', 'remove')} className="flex-1 bg-gray-700 text-white py-2 rounded text-xs">解除</button>
                            </div>
                        </div>

                    </div>
                ) : (
                    <p className="text-center text-gray-500 py-4">← 対象ユーザーを選択してください</p>
                )}

                {/* リスト状況の可視化 */}
                <div className="bg-gray-800 p-4 rounded border border-gray-700 text-xs">
                    <h4 className="font-bold text-gray-400 border-b border-gray-700 pb-1 mb-2">リスト登録状況</h4>
                    <div className="grid grid-cols-3 gap-2">
                         <div>
                            <span className="text-purple-400 font-bold">指名スタッフ (Allowed)</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {selectedShopData.adminAllowedUsers?.map((u:string)=><span key={u} className="bg-purple-900 px-1 rounded">{u}</span>)}
                            </div>
                         </div>
                         <div>
                            <span className="text-red-500 font-bold">追放スタッフ (AdminBan)</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {selectedShopData.adminBannedUsers?.map((u:string)=><span key={u} className="bg-red-900 px-1 rounded">{u}</span>)}
                            </div>
                         </div>
                         <div>
                            <span className="text-yellow-500 font-bold">予約禁止客 (UserBan)</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {selectedShopData.bannedUsers?.map((u:string)=><span key={u} className="bg-yellow-900 px-1 rounded">{u}</span>)}
                            </div>
                         </div>
                    </div>
                </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
