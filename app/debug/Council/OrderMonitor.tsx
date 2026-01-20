"use client";
import React from "react";

// 型定義（必要に応じて拡張）
type Props = {
  orderList: any[];
  menuList: any[];
  onUpdateStock: (menuId: string, currentStock: number, change: number) => void;
};

export default function OrderMonitor({ orderList, menuList, onUpdateStock }: Props) {
  return (
    <div className="grid md:grid-cols-3 gap-6">
      {/* Left: オーダーモニター */}
      <div className="md:col-span-2">
        <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
          📋 注文リスト
          <span className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300">
            {orderList.length}件
          </span>
        </h3>
        <div className="space-y-3">
          {orderList.map((order) => {
            const isPaying = order.status === "paying";
            return (
              <div
                key={order.id}
                className={`p-4 rounded-lg border flex justify-between items-center transition-all 
                  ${
                    isPaying
                      ? "bg-red-900/40 border-red-500 shadow-red-900/50 shadow-lg animate-pulse"
                      : "bg-gray-700/50 border-gray-600"
                  }
                `}
              >
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono font-bold text-xl text-yellow-400">
                      No.{order.ticketId}
                    </span>
                    {isPaying && (
                      <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded animate-bounce">
                        お支払い中
                      </span>
                    )}
                    {order.status === "completed" && (
                      <span className="bg-green-600 text-white text-xs px-2 py-1 rounded">
                        受取済み
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {order.createdAt?.toDate().toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-200">
                    {order.items?.map((item: any, idx: number) => (
                      <span key={idx} className="mr-3">
                        {item.name} x{item.quantity}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 font-mono">
                    ID: {order.id.slice(0, 6)}...
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">¥{order.totalAmount}</div>
                </div>
              </div>
            );
          })}
          {orderList.length === 0 && (
            <div className="text-center text-gray-500 py-10">
              現在、注文はありません
            </div>
          )}
        </div>
      </div>

      {/* Right: 在庫クイック管理 */}
      <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 h-fit">
        <h3 className="text-sm font-bold mb-3 text-orange-300">
          📦 在庫緊急修正
        </h3>
        <div className="space-y-2">
          {menuList.map((menu) => (
            <div
              key={menu.id}
              className="bg-gray-800 p-2 rounded border border-gray-700"
            >
              <div className="flex justify-between text-sm mb-1">
                <span>{menu.name}</span>
                <span
                  className={`font-mono font-bold ${
                    menu.stock < 5 ? "text-red-500" : "text-green-400"
                  }`}
                >
                  {menu.stock}
                </span>
              </div>
              <div className="flex gap-1 justify-end">
                <button
                  onClick={() => onUpdateStock(menu.id, menu.stock, -1)}
                  className="bg-red-900/50 hover:bg-red-800 text-red-200 text-xs px-2 py-1 rounded"
                >
                  -1
                </button>
                <button
                  onClick={() => onUpdateStock(menu.id, menu.stock, 1)}
                  className="bg-blue-900/50 hover:bg-blue-800 text-blue-200 text-xs px-2 py-1 rounded"
                >
                  +1
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
