import React, { useState } from 'react';
import { UtensilsCrossed, ShoppingBag, Plus, Minus, Check, ShoppingCart, Info } from 'lucide-react';
import { EquipItem, ActiveOrder } from '../types';

interface EquipTabProps {
  items: EquipItem[];
  onOpenBookingModal: (initialCart?: { [key: string]: number }) => void;
  cart?: { [key: string]: number };
  onUpdateCart?: (cart: { [key: string]: number }) => void;
  activeOrder?: ActiveOrder | null;
  isLoggedIn?: boolean;
  onRequireLogin?: (reason: string, onLoggedIn?: () => void) => void;
}

export const EquipTab: React.FC<EquipTabProps> = ({
  items,
  onOpenBookingModal,
  cart: externalCart,
  onUpdateCart,
  activeOrder,
  isLoggedIn = false,
  onRequireLogin,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'bento' | 'drink' | 'dessert' | 'souvenir'>('all');
  const [internalCart, setInternalCart] = useState<{ [key: string]: number }>({});

  const cart = externalCart !== undefined ? externalCart : internalCart;
  const updateCart = (newCart: { [key: string]: number }) => {
    if (onUpdateCart) {
      onUpdateCart(newCart);
    } else {
      setInternalCart(newCart);
    }
  };

  const filteredItems = items.filter(
    (item) => selectedCategory === 'all' || item.category === selectedCategory
  );

  const handleQuantityChange = (itemId: string, delta: number) => {
    const current = cart[itemId] || 0;
    const updated = Math.max(0, current + delta);
    const newCart = { ...cart };
    if (updated === 0) {
      delete newCart[itemId];
    } else {
      newCart[itemId] = updated;
    }
    updateCart(newCart);
  };

  const totalCount: number = (Object.values(cart) as number[]).reduce((sum, qty) => sum + qty, 0);
  const totalPrice = Object.entries(cart).reduce((sum: number, [id, qty]) => {
    const item = items.find((i) => i.id === id);
    return sum + (item ? item.price * (qty as number) : 0);
  }, 0);

  // 購入済み（予約済み）アイテムのマップを作成
  const purchasedItemsMap: { [key: string]: number } = {};
  if (activeOrder && activeOrder.items) {
    activeOrder.items.forEach((ci) => {
      purchasedItemsMap[ci.item.id] = ci.quantity;
    });
  }
  const purchasedTotalCount = Object.values(purchasedItemsMap).reduce((sum, q) => sum + q, 0);

  return (
    <div className="space-y-4 pb-12">
      {/* Title Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base sm:text-lg font-black text-[#221C35] flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-[#5B21B6]" />
            E-DELIVERY 座席配送カタログ
          </h2>
          <p className="text-xs text-[#6B6380]">
            「めぐしーと」専用の座席直配送サービス
          </p>
        </div>
      </div>

      {/* Purchased Summary Banner */}
      {purchasedTotalCount > 0 && activeOrder && (
        <div className="bg-[#EFE8FA] border border-[#5B21B6]/30 rounded-2xl p-3.5 flex items-start gap-3 text-[#221C35] animate-fadeIn">
          <div className="w-8 h-8 rounded-xl bg-[#5B21B6] text-white flex items-center justify-center shrink-0 font-bold shadow-2xs mt-0.5">
            <Check className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-xs text-[#5B21B6]">
                現在ご予約の座席への配送予定（購入済み: {purchasedTotalCount}点）
              </span>
              <span className="text-[10px] font-bold text-[#5B21B6] bg-white px-2 py-0.5 rounded-full border border-[#5B21B6]/20">
                {activeOrder.carNo}号車 {activeOrder.seatNo}
              </span>
            </div>
            <div className="text-[11px] text-[#4A4063] font-medium flex flex-wrap gap-x-2 gap-y-0.5">
              {activeOrder.items.map((ci) => (
                <span key={ci.item.id} className="bg-white/80 px-2 py-0.5 rounded border border-[#5B21B6]/10 text-[10px] font-bold">
                  {ci.item.name} ×{ci.quantity}
                </span>
              ))}
            </div>
            <div className="text-[10px] text-[#6B6380]">
              ※下記カタログから商品を追加して【購入確定】を押すと、既存の注文に追加統合されます。
            </div>
          </div>
        </div>
      )}

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'all', label: 'すべて' },
          { id: 'bento', label: '特選駅弁' },
          { id: 'drink', label: 'お飲み物' },
          { id: 'dessert', label: 'スイーツ' },
          { id: 'souvenir', label: '限定グッズ' },
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id as any)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
              selectedCategory === cat.id
                ? 'bg-[#5B21B6] text-white shadow-xs font-bold'
                : 'bg-white text-[#6B6380] border border-[#E6E2EE] hover:bg-[#F4F3F8]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Product Items Responsive Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filteredItems.map((item) => {
          const qty = cart[item.id] || 0;
          const purchasedQty = purchasedItemsMap[item.id] || 0;
          return (
            <div
              key={item.id}
              className={`bg-white rounded-2xl p-3 shadow-2xs border transition-all flex gap-3 relative overflow-hidden ${
                qty > 0
                  ? 'border-[#5B21B6] ring-1 ring-[#5B21B6]/20'
                  : purchasedQty > 0
                  ? 'border-emerald-300 bg-emerald-50/20'
                  : 'border-[#E6E2EE]'
              }`}
            >
              <div className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-gray-100 border border-[#E6E2EE] flex items-center justify-center">
                <img
                  src={item.image}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover block text-[0px]"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.onerror = null;
                    const fallbackMap: Record<string, string> = {
                      'eq-01': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80',
                      'eq-02': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=600&q=80',
                      'eq-03': 'https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&w=600&q=80',
                      'eq-04': 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=600&q=80',
                      'eq-05': 'https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?auto=format&fit=crop&w=600&q=80',
                      'eq-06': 'https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?auto=format&fit=crop&w=600&q=80',
                    };
                    target.src = fallbackMap[item.id] || 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80';
                  }}
                />
                {purchasedQty > 0 ? (
                  <span className="absolute top-1 left-1 bg-emerald-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-2xs flex items-center gap-0.5">
                    <Check className="w-2.5 h-2.5" />
                    購入済 ×{purchasedQty}
                  </span>
                ) : item.isPopular ? (
                  <span className="absolute top-1 left-1 bg-[#5B21B6] text-white text-[8px] font-bold px-1 py-0.2 rounded shadow-2xs">
                    人気
                  </span>
                ) : null}
              </div>

              <div className="flex-1 flex flex-col justify-between min-w-0">
                <div>
                  <div className="flex flex-wrap items-center gap-1 mb-1">
                    {purchasedQty > 0 && (
                      <span className="inline-block bg-emerald-100 text-emerald-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border border-emerald-300">
                        購入済み: {purchasedQty}個
                      </span>
                    )}
                    {item.badge && (
                      <span className="inline-block bg-[#F3E8FF] text-[#6D28D9] text-[9px] font-bold px-1.5 py-0.5 rounded-md border border-[#DDD6FE]/60">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-[#221C35] leading-snug line-clamp-2">
                    {item.name}
                  </h4>
                  <div className="text-xs font-mono font-black text-[#5B21B6] mt-1">
                    ¥{item.price.toLocaleString()}
                  </div>
                  <p className="text-[10px] text-[#6B6380] line-clamp-2 mt-1 leading-normal">
                    {item.description}
                  </p>
                </div>

                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[#F4F3F8]">
                  <span className="text-[9px] text-[#857D99] font-mono">
                    {purchasedQty > 0 ? '追加注文可' : item.isLimited ? '数量限定' : item.isPopular ? '人気作' : '限定品'}
                  </span>

                  {/* Quantity Control Button */}
                  {qty === 0 ? (
                    <button
                      onClick={() => handleQuantityChange(item.id, 1)}
                      className="bg-[#EFE8FA] hover:bg-[#5B21B6] text-[#5B21B6] hover:text-white font-bold text-[10px] px-2.5 py-1 rounded-lg border border-[#5B21B6]/20 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>追加</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-[#F4F3F8] px-2 py-0.5 rounded-lg border border-[#E6E2EE]">
                      <button
                        onClick={() => handleQuantityChange(item.id, -1)}
                        className="text-[#5B21B6] hover:text-[#221C35] p-0.5 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-bold font-mono text-[#221C35] min-w-[12px] text-center">
                        {qty}
                      </span>
                      <button
                        onClick={() => handleQuantityChange(item.id, 1)}
                        className="text-[#5B21B6] hover:text-[#221C35] p-0.5 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Sticky Cart & Order Confirmation Bar */}
      {totalCount > 0 && (
        <div className="fixed bottom-16 inset-x-0 mx-auto max-w-md px-4 z-30 animate-fadeIn">
          <div className="bg-[#221C35] text-white p-3 rounded-2xl shadow-xl border border-[#5B21B6]/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 pl-1">
              <div className="relative shrink-0">
                <ShoppingBag className="w-5 h-5 text-[#A78BFA]" />
                <span className="absolute -top-1.5 -right-2 bg-[#5B21B6] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {totalCount}
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-[#A78BFA] font-bold">買い物カゴ</div>
                <div className="text-sm font-black font-mono text-white">
                  ¥{totalPrice.toLocaleString()}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                if (!isLoggedIn && onRequireLogin) {
                  onRequireLogin('車内デリバリーのご注文確定には、神埼IDログインが必要です。', () => onOpenBookingModal(cart));
                  return;
                }
                onOpenBookingModal(cart);
              }}
              className="bg-[#5B21B6] hover:bg-[#4C1D95] text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>{isLoggedIn ? '購入確定へ進む' : 'ログインして注文'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


