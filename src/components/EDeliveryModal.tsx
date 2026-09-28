import React, { useState } from 'react';
import { X, UtensilsCrossed, Check, ShoppingBag, AlertCircle, Tag } from 'lucide-react';
import { EquipItem, ActiveOrder } from '../types';

interface EDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  equipItems: EquipItem[];
  onConfirmOrder: (order: ActiveOrder) => void;
  initialCart?: { [key: string]: number };
  activeOrder?: ActiveOrder | null;
  isLoggedIn?: boolean;
  onRequireLogin?: (reason: string, onLoggedIn?: () => void) => void;
  isCouponUsed?: (code: string) => boolean;
  onCouponUsed?: (code: string) => void;
}

const getRandomSeat = () => {
  const row = Math.floor(Math.random() * 15) + 1;
  const letter = ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
  return `${row}${letter}`;
};

export const EDeliveryModal: React.FC<EDeliveryModalProps> = ({
  isOpen,
  onClose,
  equipItems,
  onConfirmOrder,
  initialCart,
  activeOrder,
  isLoggedIn = false,
  onRequireLogin,
  isCouponUsed,
  onCouponUsed,
}) => {
  const [selectedTrain, setSelectedTrain] = useState('特急めぐり 8号 (14:43発 松戸駅)');
  const [carNo, setCarNo] = useState(1);
  const [seatNo, setSeatNo] = useState(() => getRandomSeat());
  const [cart, setCart] = useState<{ [key: string]: number }>(() => initialCart || {});

  // Coupon state for delivery
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedDeliveryCoupon, setAppliedDeliveryCoupon] = useState<{ code: string; label: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setCart(initialCart || {});
      if (activeOrder) {
        setSelectedTrain(activeOrder.trainName);
        setCarNo(activeOrder.carNo);
        setSeatNo(activeOrder.seatNo);
      } else {
        setSelectedTrain('特急めぐり 8号 (14:43発 松戸駅)');
        setCarNo(1);
        setSeatNo(getRandomSeat());
      }
    }
  }, [isOpen, initialCart, activeOrder]);

  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  // 判定: 自由席での予約有無 & 未予約有無 (指定席・めぐシート1号車などはデリバリー可能)
  const isStandardSeat = Boolean(activeOrder && activeOrder.seatType === 'standard');
  const hasNoOrder = !activeOrder;

  const selectedItems = Object.entries(cart)
    .map(([id, qty]) => {
      const item = equipItems.find((i) => i.id === id);
      return item && (qty as number) > 0 ? { item, quantity: qty as number } : null;
    })
    .filter(Boolean) as { item: EquipItem; quantity: number }[];

  const rawTotalPrice = selectedItems.reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0);

  // 1品割引計算 (最も高額な1品をクーポンの割引率で割引)
  let discountAmount = 0;
  if (appliedDeliveryCoupon && selectedItems.length > 0) {
    const highestPricedItem = [...selectedItems].sort((a, b) => b.item.price - a.item.price)[0];
    if (highestPricedItem) {
      discountAmount = Math.ceil(highestPricedItem.item.price * (appliedDeliveryCoupon.discount / 100));
    }
  }

  const finalTotalPrice = Math.max(0, rawTotalPrice - discountAmount);

  const handleApplyCoupon = () => {
    const code = couponCodeInput.trim().toUpperCase().replace(/\s+/g, '');
    if (!code) return;

    let coupon: { code: string; label: string; discount: number } | null = null;
    if (code === 'DISH20') {
      coupon = { code: 'DISH20', label: '【クリア記念特典】デリバリー1品 20%OFF', discount: 20 };
    } else if (code === 'KZ-EASY-20' || code === 'KZEASY20' || code === 'KZ-EASY-20%' || code === 'KZ-EASY-DELIV' || code === 'KZ-EASY-200' || code === 'KZEASY200') {
      coupon = { code: 'KZ-EASY-20', label: '【初級制覇特典】デリバリー1品 20%OFF', discount: 20 };
    }

    if (!coupon) {
      setCouponError('無効なクーポンコードです。');
      return;
    }
    if (isCouponUsed?.(coupon.code)) {
      setCouponError('このクーポンは既に使用済みです。');
      return;
    }

    setAppliedDeliveryCoupon(coupon);
    setCouponError(null);
    setCouponCodeInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0 || isStandardSeat || hasNoOrder) return;

    if (!isLoggedIn && onRequireLogin) {
      onRequireLogin('車内デリバリーのご注文確定には、神埼IDログインが必要です。');
      return;
    }

    // 適用中クーポンが、確定までの間に使用済みになっていないか再確認(1回限り)
    if (appliedDeliveryCoupon && isCouponUsed?.(appliedDeliveryCoupon.code)) {
      setAppliedDeliveryCoupon(null);
      setCouponError('このクーポンは既に使用済みです。');
      return;
    }
    if (appliedDeliveryCoupon && discountAmount > 0) {
      onCouponUsed?.(appliedDeliveryCoupon.code);
    }

    const newOrder: ActiveOrder = {
      orderId: `NZ-DELIV-${Math.floor(1000 + Math.random() * 9000)}`,
      trainName: selectedTrain,
      carNo,
      seatNo,
      seatType: 'megu',
      items: selectedItems,
      totalPrice: finalTotalPrice,
      status: 'confirmed',
      estimatedDeliveryTime: '乗車駅発車後 5分頃',
      deliveryStation: activeOrder?.deliveryStation || '松戸駅',
    };

    setIsSuccess(true);
    setTimeout(() => {
      onConfirmOrder(newOrder);
      setIsSuccess(false);
      setCart({});
      setAppliedDeliveryCoupon(null);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white text-[#221C35] w-full max-w-lg rounded-3xl border border-[#E6E2EE] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#F5F2FA] via-[#EFE8FA] to-[#F5F2FA] p-4 border-b border-[#E6E2EE] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#5B21B6] text-white flex items-center justify-center shrink-0 shadow-xs">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-[#5B21B6] font-extrabold uppercase tracking-wider whitespace-nowrap truncate">
                E-DELIVERY （車内デリバリー）
              </div>
              <h3 className="text-sm sm:text-base font-black text-[#221C35] leading-tight line-clamp-2">
                車内デリバリー注文の購入確定
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-black/5 text-[#857D99] hover:text-[#221C35] transition-colors cursor-pointer shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Scroll */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {isSuccess ? (
            <div className="py-10 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 border-2 border-emerald-500 text-emerald-600 flex items-center justify-center mx-auto animate-bounce">
                <Check className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-black text-[#221C35]">デリバリーの購入が確定いたしました！</h4>
              <p className="text-sm text-[#5B21B6] font-bold">
                指定の {carNo}号車 {seatNo} へアテンダントが温かい状態でお届けいたします。
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Warning Notice when Standard Seat or No Order */}
              {isStandardSeat && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-rose-900 animate-fadeIn">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-extrabold text-xs text-rose-950">自由席にはデリバリーできません</div>
                    <div className="text-[11px] leading-snug text-rose-800">
                      現在ご予約中の座席は<strong className="underline decoration-rose-400">【自由席 ({activeOrder?.carNo}号車 {activeOrder?.seatNo})】</strong>です。車内デリバリーは「めぐシート（1号車）」または指定席専用サービスのため、自由席への配達・購入確定はできません。
                    </div>
                  </div>
                </div>
              )}

              {hasNoOrder && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-amber-900 animate-fadeIn">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-extrabold text-xs text-amber-950">特急券（めぐシート・指定席）予約が必要です</div>
                    <div className="text-[11px] leading-snug text-amber-800">
                      特急券・座席予約が見つかりません。車内デリバリーをご利用いただくには、先に「予約」タブより特急めぐりの『めぐシート（1号車）』や指定席をご予約ください。
                    </div>
                  </div>
                </div>
              )}

              {/* Step 1: Seat Info */}
              <div className="bg-[#F9F8FD] p-4 rounded-2xl border border-[#E6E2EE] space-y-3">
                <div className="font-extrabold text-[#5B21B6] flex items-center justify-between text-xs gap-2">
                  <span className="whitespace-nowrap">① ご乗車・座席情報</span>
                  <span className="text-[10px] text-[#5B21B6] bg-[#EFE8FA] px-2 py-0.5 rounded border border-[#5B21B6]/20 font-bold whitespace-nowrap">
                    予約連携済み
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-[#6B6380] block mb-1 whitespace-nowrap">乗車列車</label>
                    <input
                      type="text"
                      readOnly
                      value={selectedTrain}
                      className="w-full bg-white border border-[#D1C9E3] rounded-xl px-3 py-2 text-xs text-[#221C35] font-bold shadow-2xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-[#6B6380] block mb-1 whitespace-nowrap">号車</label>
                      <input
                        type="text"
                        readOnly
                        value={
                          activeOrder
                            ? `${activeOrder.carNo}号車 (${
                                activeOrder.seatType === 'megu' || activeOrder.carNo === 1
                                  ? 'めぐシート'
                                  : activeOrder.seatType === 'reserved'
                                  ? '普通指定席'
                                  : '自由席'
                              })`
                            : '1号車 (めぐシート)'
                        }
                        className="w-full bg-white border border-[#D1C9E3] rounded-xl px-3 py-2 text-xs text-[#221C35] font-bold shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-[#6B6380] block mb-1 whitespace-nowrap">座席番号</label>
                      <input
                        type="text"
                        readOnly={!!activeOrder}
                        value={seatNo}
                        onChange={(e) => setSeatNo(e.target.value)}
                        className="w-full bg-white border border-[#D1C9E3] rounded-xl px-3 py-2 text-xs text-[#221C35] font-bold shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Selected Items & Purchased Items Summary */}
              <div className="space-y-3">
                {/* 既存の購入済み商品リスト */}
                {activeOrder && activeOrder.items && activeOrder.items.length > 0 && (
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 space-y-2">
                    <div className="font-extrabold text-[#065F46] flex items-center justify-between text-xs gap-2">
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        【購入済み】現在配送手配中の商品 ({activeOrder.items.reduce((s, i) => s + i.quantity, 0)}点)
                      </span>
                      <span className="text-[10px] text-emerald-800 bg-emerald-100 font-bold px-2 py-0.5 rounded-md border border-emerald-300 whitespace-nowrap">
                        注文確定済み
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {activeOrder.items.map(({ item, quantity }) => (
                        <div
                          key={item.id}
                          className="bg-white p-2.5 rounded-xl border border-emerald-200/80 flex items-center justify-between gap-2 shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={item.image}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 object-cover rounded-lg shrink-0 border border-emerald-100 text-[0px]"
                              onError={(e) => {
                                const target = e.currentTarget;
                                target.onerror = null;
                                const fallbackMap: Record<string, string> = {
                                  'eq-01': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80',
                                  'eq-02': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&q=80',
                                  'eq-03': 'https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&w=400&q=80',
                                  'eq-04': 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=400&q=80',
                                  'eq-05': 'https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?auto=format&fit=crop&w=400&q=80',
                                  'eq-06': 'https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?auto=format&fit=crop&w=400&q=80',
                                };
                                target.src = fallbackMap[item.id] || 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80';
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-[#221C35] text-xs leading-snug truncate">{item.name}</div>
                              <div className="text-emerald-700 font-mono font-black text-[11px]">
                                ¥{item.price.toLocaleString()}
                              </div>
                            </div>
                          </div>

                          <div className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-lg shrink-0 text-xs flex items-center gap-1 border border-emerald-300">
                            <span className="text-[9px] text-emerald-700">購入数:</span>
                            <span className="font-mono font-black">{quantity}個</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 今回追加する注文商品（デリバリータブで選択済みの商品） */}
                <div className="space-y-2.5">
                  <div className="font-extrabold text-[#221C35] flex items-center justify-between text-xs gap-2">
                    <span className="whitespace-nowrap">
                      {activeOrder && activeOrder.items && activeOrder.items.length > 0
                        ? '② 今回追加するお弁当・商品（デリバリータブ選択分）'
                        : '② ご注文商品（めぐしーと座席へお届け）'}
                    </span>
                    <span className="text-[10px] text-[#5B21B6] bg-[#EFE8FA] px-2 py-0.5 rounded font-bold whitespace-nowrap">
                      保温パックでお届け
                    </span>
                  </div>

                  {selectedItems.length > 0 ? (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {selectedItems.map(({ item, quantity }) => (
                        <div
                          key={item.id}
                          className="bg-white p-2.5 rounded-xl border border-[#D1C9E3] flex items-center justify-between gap-2 shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <img
                              src={item.image}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 object-cover rounded-lg shrink-0 border border-[#E6E2EE] text-[0px]"
                              onError={(e) => {
                                const target = e.currentTarget;
                                target.onerror = null;
                                const fallbackMap: Record<string, string> = {
                                  'eq-01': 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80',
                                  'eq-02': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&q=80',
                                  'eq-03': 'https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&w=400&q=80',
                                  'eq-04': 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=400&q=80',
                                  'eq-05': 'https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?auto=format&fit=crop&w=400&q=80',
                                  'eq-06': 'https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?auto=format&fit=crop&w=400&q=80',
                                };
                                target.src = fallbackMap[item.id] || 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80';
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-[#221C35] text-xs leading-snug truncate">{item.name}</div>
                              <div className="text-[#5B21B6] font-mono font-black text-[11px]">
                                ¥{item.price.toLocaleString()} × {quantity}個 = ¥{(item.price * quantity).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <span className="bg-[#EFE8FA] text-[#5B21B6] font-mono font-extrabold px-2 py-1 rounded-lg text-xs border border-[#5B21B6]/20 shrink-0">
                            {quantity}点
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-[#FAF9FC] border border-[#DDD6FE] rounded-2xl p-4 text-center space-y-2">
                      <ShoppingBag className="w-7 h-7 text-[#5B21B6] mx-auto opacity-70" />
                      <div className="font-extrabold text-xs text-[#221C35]">デリバリー商品が選択されていません</div>
                      <p className="text-[11px] text-[#6B6380] leading-relaxed">
                        商品は「エキップ（E-DELIVERY）」タブのカタログよりお選びいただけます。
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Coupon Section for Delivery */}
              <div className="bg-[#F9F8FD] p-3.5 rounded-2xl border border-[#E6E2EE] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="font-extrabold text-[#5B21B6] flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" />
                    <span>デリバリー割引クーポン</span>
                  </div>
                  {appliedDeliveryCoupon && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md">
                      {appliedDeliveryCoupon.discount}%OFF適用中
                    </span>
                  )}
                </div>

                {appliedDeliveryCoupon ? (
                  <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-black text-emerald-900 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{appliedDeliveryCoupon.code}</span>
                      </div>
                      <div className="text-[11px] text-emerald-700 font-medium">
                        {appliedDeliveryCoupon.label}（-¥{discountAmount.toLocaleString()}）
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAppliedDeliveryCoupon(null)}
                      className="p-1 rounded-lg text-emerald-700 hover:bg-emerald-100 transition-all cursor-pointer text-xs font-bold shrink-0"
                    >
                      解除
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={couponCodeInput}
                        onChange={(e) => {
                          setCouponCodeInput(e.target.value);
                          if (couponError) setCouponError(null);
                        }}
                        placeholder="クーポンコード（例: KZ-EASY-20）"
                        className="flex-1 bg-white border border-[#D1C9E3] rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-[#221C35] focus:outline-none focus:border-[#5B21B6] placeholder:text-gray-400"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCoupon}
                        className="bg-[#5B21B6] hover:bg-[#4C1D95] text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer shrink-0 shadow-2xs"
                      >
                        適用
                      </button>
                    </div>
                    {couponError && (
                      <div className="text-[10px] font-bold text-rose-600 px-1">
                        {couponError}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 3: Total & Order Submit Button */}
              <div className="pt-3 border-t border-[#E6E2EE] flex items-center justify-between gap-3 text-xs sm:text-sm">
                <div className="shrink-0">
                  <div className="text-[10px] font-bold text-[#6B6380] whitespace-nowrap">
                    {activeOrder && activeOrder.items && activeOrder.items.length > 0
                      ? '今回追加のお支払い額'
                      : 'お支払い合計 (N-POINT対象)'}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl sm:text-2xl font-black text-[#5B21B6] font-mono whitespace-nowrap">
                      ¥{finalTotalPrice.toLocaleString()}
                    </span>
                    {discountAmount > 0 && (
                      <span className="text-xs text-gray-400 line-through font-mono">
                        ¥{rawTotalPrice.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={selectedItems.length === 0 || isStandardSeat || hasNoOrder}
                  className="bg-[#5B21B6] hover:bg-[#4C1D95] disabled:opacity-40 text-white font-extrabold text-xs sm:text-sm py-3 px-5 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all whitespace-nowrap shrink-0"
                >
                  <ShoppingBag className="w-4 h-4 text-white shrink-0" />
                  <span className="whitespace-nowrap">
                    {isStandardSeat
                      ? '普通席へのデリバリー不可'
                      : hasNoOrder
                      ? 'めぐしーと予約が必要'
                      : selectedItems.length === 0
                      ? '商品を選択してください'
                      : activeOrder && activeOrder.items && activeOrder.items.length > 0
                      ? '追加注文を確定する'
                      : 'デリバリーの購入を確定する'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
