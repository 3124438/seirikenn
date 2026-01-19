import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, onSnapshot, doc, updateDoc, 
  deleteDoc, setDoc, runTransaction, arrayUnion 
} from "firebase/firestore";

// --- Firebase設定 (ご自身の環境に合わせてください) ---
const firebaseConfig = {
  // ここにFirebaseコンソールの設定を貼り付けてください
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- 簡易的なユーザーID生成 (ブラウザごとに固定) ---
const getUserId = () => {
  let id = localStorage.getItem('app_user_id');
  if (!id) {
    id = 'USER_' + Math.random().toString(36).substr(2, 5).toUpperCase();
    localStorage.setItem('app_user_id', id);
  }
  return id;
};

export default function App() {
  const [venues, setVenues] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false); // trueで管理画面、falseでユーザー画面
  const [userId] = useState(getUserId());
  
  // 管理画面用フォーム状態
  const [editShop, setEditShop] = useState(null); // 編集中のショップ
  const [newMenu, setNewMenu] = useState({ name: '', price: 0, stock: 0, limit: 5 }); // 新規メニュー用

  // ユーザー画面用状態
  const [cart, setCart] = useState({}); // { menuId: quantity }
  const [paymentPassword, setPaymentPassword] = useState('');

  // --- データ監視 ---
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'venues'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setVenues(data);
    });
    return () => unsub();
  }, []);

  // --- 管理者機能: ショップ作成/更新 ---
  const handleSaveShop = async (shopData) => {
    const ref = doc(collection(db, 'venues')); // 新規ID
    const id = shopData.id || ref.id;
    await setDoc(doc(db, 'venues', id), {
      ...shopData,
      updatedAt: new Date(),
      // 既存データがない場合の初期値
      queue: shopData.queue || [],
      orders: shopData.orders || [],
      menu: shopData.menu || [],
      slots: shopData.slots || {} 
    }, { merge: true });
    setEditShop(null);
  };

  // --- 管理者機能: メニュー追加 ---
  const handleAddMenuItem = () => {
    if (!newMenu.name) return;
    const item = { ...newMenu, id: 'M_' + Math.random().toString(36).substr(2, 5) };
    const updatedMenu = [...(editShop.menu || []), item];
    setEditShop({ ...editShop, menu: updatedMenu });
    setNewMenu({ name: '', price: 0, stock: 0, limit: 5 }); // リセット
  };

  const handleDeleteMenuItem = (menuId) => {
    const updatedMenu = editShop.menu.filter(m => m.id !== menuId);
    setEditShop({ ...editShop, menu: updatedMenu });
  };

  // --- ユーザー機能: 注文処理 (トランザクション) ---
  const handleOrder = async (shop) => {
    if (Object.keys(cart).length === 0) return;

    try {
      await runTransaction(db, async (transaction) => {
        const shopRef = doc(db, 'venues', shop.id);
        const sfDoc = await transaction.get(shopRef);
        if (!sfDoc.exists()) throw "Shop does not exist!";

        const currentData = sfDoc.data();
        const currentMenu = currentData.menu || [];
        const newOrders = currentData.orders || [];

        // 在庫チェック & 減算
        const updatedMenu = currentMenu.map(item => {
          const qty = cart[item.id] || 0;
          if (qty > 0) {
            if (item.stock < qty) {
              throw new Error(`在庫切れ: ${item.name}`);
            }
            return { ...item, stock: item.stock - qty };
          }
          return item;
        });

        // 注文チケット作成
        const total = updatedMenu.reduce((sum, item) => sum + (item.price * (cart[item.id] || 0)), 0);
        const ticketId = 'T-' + Math.floor(1000 + Math.random() * 9000); // 簡易ID
        
        const newOrder = {
          ticketId,
          userId,
          items: cart, // { menuId: qty }
          total,
          status: 'ordered', // ordered -> paying -> completed
          timestamp: new Date().toISOString()
        };

        transaction.update(shopRef, {
          menu: updatedMenu,
          orders: [...newOrders, newOrder]
        });
      });

      alert("注文が完了しました！");
      setCart({}); // カートリセット
    } catch (e) {
      alert("注文失敗: " + e.message);
    }
  };

  // --- ユーザー機能: 支払いステータス更新 ---
  const handlePaymentStatus = async (shop, order, newStatus) => {
    // 支払い画面へ遷移（paying） または 完了（completed）
    const updatedOrders = shop.orders.map(o => {
      if (o.ticketId === order.ticketId) {
        return { ...o, status: newStatus };
      }
      return o;
    });
    await updateDoc(doc(db, 'venues', shop.id), { orders: updatedOrders });
  };

  // --- ユーザー機能: 支払い完了処理 ---
  const completePayment = async (shop, order) => {
    if (paymentPassword.length < 5) {
      alert("パスワードは5文字以上で入力してください");
      return;
    }
    await handlePaymentStatus(shop, order, 'completed');
    setPaymentPassword('');
  };

  // --- 管理者: 在庫手動修正 ---
  const handleAdminUpdateStock = async (shop, menuId, newStock) => {
    const updatedMenu = shop.menu.map(m => m.id === menuId ? { ...m, stock: Number(newStock) } : m);
    await updateDoc(doc(db, 'venues', shop.id), { menu: updatedMenu });
  };

  // --- 管理画面: モード設定UI ---
  const renderEditModal = () => {
    if (!editShop) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 p-6 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <h2 className="text-xl font-bold mb-4 text-white">設定編集</h2>
          
          <div className="space-y-4">
            <input 
              className="w-full bg-gray-700 p-2 rounded text-white" 
              placeholder="店舗・ブース名"
              value={editShop.name || ''} 
              onChange={e => setEditShop({...editShop, name: e.target.value})} 
            />
            <textarea 
              className="w-full bg-gray-700 p-2 rounded text-white" 
              placeholder="説明文"
              value={editShop.description || ''} 
              onChange={e => setEditShop({...editShop, description: e.target.value})} 
            />

            {/* モード選択 */}
            <div className="bg-gray-700 p-3 rounded">
              <p className="text-gray-300 text-sm mb-2 font-bold">運用モード</p>
              <div className="flex gap-4">
                <label className="text-white flex items-center gap-2">
                  <input type="radio" name="mode" 
                    checked={editShop.isQueueMode} 
                    onChange={() => setEditShop({...editShop, isQueueMode: true, isOrderMode: false})} 
                  /> 順番待ち制
                </label>
                <label className="text-white flex items-center gap-2">
                  <input type="radio" name="mode" 
                    checked={editShop.isOrderMode} 
                    onChange={() => setEditShop({...editShop, isQueueMode: false, isOrderMode: true})} 
                  /> オーダー制
                </label>
                <label className="text-white flex items-center gap-2">
                  <input type="radio" name="mode" 
                    checked={!editShop.isQueueMode && !editShop.isOrderMode} 
                    onChange={() => setEditShop({...editShop, isQueueMode: false, isOrderMode: false})} 
                  /> 時間予約制
                </label>
              </div>
            </div>

            {/* オーダー制の場合のメニュー登録 */}
            {editShop.isOrderMode && (
              <div className="bg-gray-700 p-3 rounded">
                <p className="text-gray-300 text-sm mb-2 font-bold">メニュー登録</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input placeholder="品名" className="bg-gray-600 p-1 text-white text-sm" value={newMenu.name} onChange={e => setNewMenu({...newMenu, name: e.target.value})} />
                  <input type="number" placeholder="価格" className="bg-gray-600 p-1 text-white text-sm" value={newMenu.price} onChange={e => setNewMenu({...newMenu, price: Number(e.target.value)})} />
                  <input type="number" placeholder="初期在庫" className="bg-gray-600 p-1 text-white text-sm" value={newMenu.stock} onChange={e => setNewMenu({...newMenu, stock: Number(e.target.value)})} />
                  <input type="number" placeholder="購入制限" className="bg-gray-600 p-1 text-white text-sm" value={newMenu.limit} onChange={e => setNewMenu({...newMenu, limit: Number(e.target.value)})} />
                </div>
                <button onClick={handleAddMenuItem} className="w-full bg-blue-600 text-white text-xs py-1 rounded mb-2">＋ 追加</button>
                
                <div className="space-y-1">
                  {(editShop.menu || []).map((m, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs text-gray-300 bg-gray-600 p-1 rounded">
                      <span>{m.name} (¥{m.price}) 在庫:{m.stock}</span>
                      <button onClick={() => handleDeleteMenuItem(m.id)} className="text-red-400">削除</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <button onClick={() => handleSaveShop(editShop)} className="flex-1 bg-green-600 text-white py-2 rounded font-bold">保存</button>
              <button onClick={() => setEditShop(null)} className="flex-1 bg-gray-500 text-white py-2 rounded">キャンセル</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans p-4 pb-20">
      {/* ヘッダー */}
      <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
          Smart Venue
        </h1>
        <button onClick={() => setIsAdmin(!isAdmin)} className="text-xs bg-gray-700 px-3 py-1 rounded text-gray-300">
          {isAdmin ? 'User View' : 'Admin View'}
        </button>
      </div>

      {isAdmin && (
        <div className="mb-6">
          <button onClick={() => setEditShop({ name: '', isQueueMode: true })} className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold py-3 rounded-lg shadow-lg">
            ＋ 新規ブース作成
          </button>
        </div>
      )}

      {renderEditModal()}

      <div className="space-y-8">
        {venues.map(shop => {
          // --- Admin View ---
          if (isAdmin) {
            // お支払いステータスの注文を優先的にソート
            const sortedOrders = [...(shop.orders || [])].sort((a, b) => {
              const isPayingA = a.status === 'paying';
              const isPayingB = b.status === 'paying';
              if (isPayingA && !isPayingB) return -1;
              if (!isPayingA && isPayingB) return 1;
              return new Date(b.timestamp) - new Date(a.timestamp); // 新しい順
            });

            return (
              <div key={shop.id} className="bg-gray-800 rounded-xl shadow-xl overflow-hidden border border-gray-700">
                <div className="bg-gray-700 p-4 flex justify-between items-center">
                  <h2 className="font-bold text-lg">{shop.name}</h2>
                  <div className="flex gap-2">
                    <button onClick={() => setEditShop(shop)} className="bg-blue-600 text-xs px-3 py-2 rounded">⚙️ 編集</button>
                  </div>
                </div>
                
                <div className="p-4">
                  {/* オーダー制 管理画面 */}
                  {shop.isOrderMode ? (
                    <div>
                      {/* 注文リスト */}
                      <h3 className="font-bold text-blue-300 mb-2">📋 注文リスト (リアルタイム)</h3>
                      <div className="space-y-2 mb-6">
                        {sortedOrders.length === 0 && <p className="text-gray-500 text-sm">注文はありません</p>}
                        {sortedOrders.map(order => {
                          const isPaying = order.status === 'paying';
                          return (
                            <div key={order.ticketId} 
                              className={`p-3 rounded flex justify-between items-center ${isPaying ? 'bg-red-900/80 border-2 border-red-500 animate-pulse' : 'bg-gray-700'}`}
                            >
                              <div>
                                <div className={`font-mono font-bold ${isPaying ? 'text-2xl text-white' : 'text-yellow-400'}`}>
                                  {order.ticketId}
                                </div>
                                <div className="text-xs text-gray-300">合計: ¥{order.total} / {order.status}</div>
                              </div>
                              {isPaying && <div className="text-red-300 font-bold text-sm">💰 支払い待機中</div>}
                              <button className="bg-gray-600 text-xs px-2 py-1 rounded" onClick={() => {/* 詳細表示等のアクション */}}>詳細</button>
                            </div>
                          );
                        })}
                      </div>

                      {/* 在庫管理 */}
                      <h3 className="font-bold text-green-300 mb-2">📦 在庫管理</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {(shop.menu || []).map(m => (
                          <div key={m.id} className="bg-gray-900 p-2 rounded flex justify-between items-center">
                            <span className="text-sm">{m.name}</span>
                            <input 
                              type="number" 
                              className="w-16 bg-gray-700 text-center text-white text-sm rounded"
                              value={m.stock}
                              onChange={(e) => handleAdminUpdateStock(shop, m.id, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : shop.isQueueMode ? (
                    // 順番待ち制 管理画面 (既存コードの簡略版)
                    <div className="text-center text-gray-400 py-4">順番待ち管理モード (Queue List)</div>
                  ) : (
                    // 予約制 管理画面 (既存コードの簡略版)
                    <div className="text-center text-gray-400 py-4">時間予約管理モード (Time Slots)</div>
                  )}
                </div>
              </div>
            );
          }

          // --- User View ---
          // 自分のアクティブな注文を探す
          const myActiveOrder = (shop.orders || []).find(o => o.userId === userId && o.status !== 'completed');

          return (
            <div key={shop.id} className="bg-gray-800 rounded-xl shadow-xl overflow-hidden border border-gray-700 relative">
               {/* Header Info */}
               <div className="bg-gray-700/50 p-4 border-b border-gray-600">
                  <h2 className="text-xl font-bold text-white mb-1">{shop.name}</h2>
                  <p className="text-xs text-gray-400">{shop.description}</p>
               </div>

               <div className="p-4">
                  {/* ★★★ オーダー制 (User) ★★★ */}
                  {shop.isOrderMode ? (
                    <div>
                      {myActiveOrder ? (
                        // 2. 注文後：チケット＆支払い画面
                        <div className="text-center space-y-6">
                          <div className="bg-gray-900 p-6 rounded-lg border border-yellow-500/30">
                            <p className="text-gray-400 text-sm mb-2">Your Ticket Number</p>
                            <p className="text-4xl font-mono font-bold text-yellow-400 tracking-widest mb-4">{myActiveOrder.ticketId}</p>
                            <div className="text-xl font-bold text-white border-t border-gray-700 pt-4">
                              お会計: ¥{myActiveOrder.total.toLocaleString()}
                            </div>
                            <p className="text-sm text-blue-300 mt-2">Status: {myActiveOrder.status}</p>
                          </div>

                          {myActiveOrder.status === 'ordered' && (
                            <button 
                              onClick={() => handlePaymentStatus(shop, myActiveOrder, 'paying')}
                              className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg shadow-lg text-lg animate-bounce"
                            >
                              お支払いへ進む
                            </button>
                          )}

                          {myActiveOrder.status === 'paying' && (
                            <div className="bg-gray-700 p-4 rounded-lg space-y-3">
                              <p className="text-sm font-bold text-red-300">スタッフに画面を見せてください</p>
                              <input 
                                type="password" 
                                placeholder="スタッフ用パスワード (5桁以上)" 
                                className="w-full bg-gray-900 text-white p-3 rounded text-center tracking-widest"
                                value={paymentPassword}
                                onChange={(e) => setPaymentPassword(e.target.value)}
                              />
                              <button 
                                onClick={() => completePayment(shop, myActiveOrder)}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded"
                              >
                                購入完了 (スタッフ操作)
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        // 1. 注文画面：メニュー選択
                        <div>
                           <h3 className="font-bold text-lg mb-4 text-white border-l-4 border-blue-500 pl-2">Menu</h3>
                           <div className="space-y-3 mb-6">
                             {(shop.menu || []).map(item => {
                               const currentQty = cart[item.id] || 0;
                               const isStockOut = item.stock <= 0;
                               return (
                                 <div key={item.id} className={`flex justify-between items-center bg-gray-900/50 p-3 rounded border ${isStockOut ? 'border-red-900 opacity-50' : 'border-gray-600'}`}>
                                   <div>
                                     <div className="font-bold text-white">{item.name}</div>
                                     <div className="text-xs text-gray-400">¥{item.price} / 残り{item.stock}</div>
                                   </div>
                                   {isStockOut ? (
                                     <span className="text-red-500 text-xs font-bold px-3">SOLD OUT</span>
                                   ) : (
                                     <div className="flex items-center gap-3 bg-gray-800 rounded px-2 py-1">
                                       <button 
                                         onClick={() => setCart({ ...cart, [item.id]: Math.max(0, currentQty - 1) })}
                                         className="text-blue-400 font-bold w-6 h-6 flex items-center justify-center bg-gray-700 rounded disabled:opacity-30"
                                         disabled={currentQty === 0}
                                       >−</button>
                                       <span className="font-mono text-lg w-4 text-center">{currentQty}</span>
                                       <button 
                                          onClick={() => setCart({ ...cart, [item.id]: currentQty + 1 })}
                                          className="text-blue-400 font-bold w-6 h-6 flex items-center justify-center bg-gray-700 rounded disabled:opacity-30"
                                          disabled={currentQty >= item.limit || currentQty >= item.stock}
                                       >+</button>
                                     </div>
                                   )}
                                 </div>
                               );
                             })}
                           </div>
                           
                           {/* 合計と注文ボタン */}
                           <div className="sticky bottom-0 bg-gray-800/95 p-4 -mx-4 border-t border-gray-700 backdrop-blur">
                             <div className="flex justify-between items-center mb-3">
                               <span className="text-gray-400">合計数量: {Object.values(cart).reduce((a, b) => a + b, 0)}</span>
                               <span className="text-xl font-bold text-white">
                                 ¥{(shop.menu || []).reduce((sum, item) => sum + (item.price * (cart[item.id] || 0)), 0).toLocaleString()}
                               </span>
                             </div>
                             <button 
                               onClick={() => handleOrder(shop)}
                               disabled={Object.values(cart).reduce((a, b) => a + b, 0) === 0}
                               className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg shadow-lg transition"
                             >
                               注文する
                             </button>
                           </div>
                        </div>
                      )}
                    </div>
                  ) : shop.isQueueMode ? (
                    // ★★★ 順番待ち制 (既存プレースホルダー) ★★★
                    <div className="text-center py-8">
                      <div className="text-4xl mb-2">📋</div>
                      <p className="text-gray-400">順番待ちシステム稼働中</p>
                      <button className="mt-4 bg-gray-700 px-4 py-2 rounded text-sm">整理券を発行する</button>
                    </div>
                  ) : (
                    // ★★★ 時間予約制 (既存プレースホルダー) ★★★
                    <div className="grid grid-cols-3 gap-2">
                       {['10:00', '11:00', '12:00'].map(t => (
                         <div key={t} className="bg-gray-700 p-2 rounded text-center text-sm border border-gray-600">
                           {t}
                         </div>
                       ))}
                    </div>
                  )}
               </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
