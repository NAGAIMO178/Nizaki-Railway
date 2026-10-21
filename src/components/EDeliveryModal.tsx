import React, { useState } from 'react';
import { X, UtensilsCrossed, Check, ShoppingBag, AlertCircle, Tag } from 'lucide-react';
import { EquipItem, ActiveOrder } from '../types';
import { getSeatClassLabel, canOrderItem, canUseDelivery, getItemRestrictionLabel, effectiveAllocation, formatSeats, seatDisplayName, splitSeats, tapSeatAllocation, untapSeatAllocation } from '../utils/seatUtils';
import { handleImageError } from '../utils/imageFallback';
import { NPointPayRow } from './NPointPayRow';
import { exceedsOrderTotal, MAX_ORDER_TOTAL, withinLimits } from '../utils/cartLimits';
import { isLaunched } from '../utils/launch';
import { CompletionModal, CompletionRow } from './CompletionModal';
import { DeliverySeatList } from './SeatList';

interface EDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFinish?: () => void; // 注文できたあと、「注文内容を確認する」を押したとき
  equipItems: EquipItem[];
  onConfirmOrder: (order: ActiveOrder) => void;
  initialCart?: { [key: string]: number };
  onCartChange?: (cart: { [key: string]: number }) => void; // 画面内でカゴを変えたときに、アプリ側のカゴにも反映する
  activeOrder?: ActiveOrder | null;
  isLoggedIn?: boolean;
  onRequireLogin?: (reason: string, onLoggedIn?: () => void) => void;
  isCouponUsed?: (code: string) => boolean;
  onCouponUsed?: (code: string) => void;
  // N-POINT で払う(1pt=1円。公開後で、クラウドが基準の会員だけ。渡されなければ、使う欄を出さない)
  pointBalance?: number;
  onSpendPoints?: (orderId: string, points: number, title: string) => Promise<{ ok: boolean; message: string }>;
}

export const EDeliveryModal: React.FC<EDeliveryModalProps> = ({
  isOpen,
  onClose,
  onFinish,
  equipItems,
  onConfirmOrder,
  initialCart,
  onCartChange,
  activeOrder,
  isLoggedIn = false,
  onRequireLogin,
  isCouponUsed,
  onCouponUsed,
  pointBalance,
  onSpendPoints,
}) => {
  const [cart, setCart] = useState<{ [key: string]: number }>(() => initialCart || {});
  // 複数席の予約で、商品ごとに、先頭の席以外へ届ける個数({ 商品: { 席: 個数 } })。指定のない分は、先頭の席へ届ける
  const [seatAlloc, setSeatAlloc] = useState<{ [itemId: string]: { [seat: string]: number } }>({});

  // Coupon state for delivery
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedDeliveryCoupon, setAppliedDeliveryCoupon] = useState<{ code: string; label: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setCart(initialCart || {});
      setSeatAlloc({});
    }
  }, [isOpen, initialCart, activeOrder]);

  // 注文できたあとに出す画面の内容(注文した時点のもの)
  const [completed, setCompleted] = useState<{ orderId: string; rows: CompletionRow[] } | null>(null);

  // N-POINT で払うか / 使う額 / ポイントを引いているあいだ / うまくいかなかったときの理由
  const [usePoints, setUsePoints] = useState(false);
  const [pointsAmount, setPointsAmount] = useState(0);
  const [spending, setSpending] = useState(false);
  const [spendError, setSpendError] = useState<string | null>(null);
  // ポイントを引く通信の名札。うまくいくまで同じものを使う(通信のやり直しで、二重に引かれないように)
  const spendIdRef = React.useRef<string | null>(null);
  const canUsePoints = !!onSpendPoints && (pointBalance ?? 0) > 0;

  if (!isOpen) return null;

  // 判定: 自由席での予約有無 & 未予約有無 (指定席・めぐシート1号車などはデリバリー可能)
  // めぐシート以外の座席では、車内デリバリーは使えない
  const isNotMegu = Boolean(activeOrder && !canUseDelivery(activeOrder.seatType));
  const hasNoOrder = !activeOrder;

  const selectedItems = Object.entries(cart)
    .map(([id, qty]) => {
      const item = equipItems.find((i) => i.id === id);
      return item && (qty as number) > 0 ? { item, quantity: qty as number } : null;
    })
    .filter(Boolean) as { item: EquipItem; quantity: number }[];

  // 座席の種類で制限された商品(めぐシート限定など)が、対象外の座席のカゴに入っている場合
  const blockedItems = hasNoOrder ? [] : selectedItems.filter((ci) => !canOrderItem(ci.item, activeOrder?.seatType));
  const hasBlockedItems = blockedItems.length > 0;
  const removeFromCart = (itemId: string) => {
    const next = { ...cart };
    delete next[itemId];
    setCart(next);
    onCartChange?.(next);
  };

  const rawTotalPrice = selectedItems.reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0);

  // 複数席の予約(公開後): 商品ごとに、どの席に何個届けるか
  const seats = activeOrder ? splitSeats(activeOrder.seatNo) : [];
  const multiSeat = isLaunched() && seats.length >= 2;
  const allocationOf = (itemId: string, quantity: number) => effectiveAllocation(quantity, seats, seatAlloc[itemId]);
  const tapSeat = (itemId: string, quantity: number, seat: string) =>
    setSeatAlloc((prev) => ({ ...prev, [itemId]: tapSeatAllocation(quantity, seats, prev[itemId], seat) }));
  const untapSeat = (itemId: string, quantity: number, seat: string) =>
    setSeatAlloc((prev) => ({ ...prev, [itemId]: untapSeatAllocation(quantity, seats, prev[itemId], seat) }));

  // 1品割引計算 (最も高額な1品をクーポンの割引率で割引)
  let discountAmount = 0;
  if (appliedDeliveryCoupon && selectedItems.length > 0) {
    const highestPricedItem = [...selectedItems].sort((a, b) => b.item.price - a.item.price)[0];
    if (highestPricedItem) {
      discountAmount = Math.ceil(highestPricedItem.item.price * (appliedDeliveryCoupon.discount / 100));
    }
  }

  const finalTotalPrice = Math.max(0, rawTotalPrice - discountAmount);
  // 1回の注文の合計(特急券+デリバリー。N-POINTで払った分も含む)の上限。超える追加は、押す前に止める
  const overOrderTotal = isLaunched() && !!activeOrder && exceedsOrderTotal(activeOrder.totalPrice + (activeOrder.pointsUsed ?? 0), finalTotalPrice);
  const pointsMax = Math.min(pointBalance ?? 0, finalTotalPrice);
  const pointsToUse = usePoints && canUsePoints ? Math.min(pointsAmount, pointsMax) : 0;

  const handleApplyCoupon = () => {
    const code = couponCodeInput.trim().toUpperCase().replace(/\s+/g, '');
    if (!code) return;

    let coupon: { code: string; label: string; discount: number } | null = null;
    if (code === 'DISH20') {
      coupon = { code: 'DISH20', label: '【クリア記念特典】デリバリー1品 20%OFF', discount: 20 };
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder || selectedItems.length === 0 || isNotMegu || hasNoOrder || hasBlockedItems || overOrderTotal || spending) return;
    // 数量の上限(画面で止めているが、確定の前にも確かめる)
    const purchased: { [id: string]: number } = {};
    (activeOrder.items || []).forEach((ci) => {
      purchased[ci.item.id] = ci.quantity;
    });
    if (!withinLimits(cart, purchased)) return;

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
    // N-POINT で払うときは、注文を確定する前に、サーバーでポイントを引く(引けなければ、注文しない)
    if (pointsToUse > 0 && onSpendPoints) {
      if (!spendIdRef.current) spendIdRef.current = `${activeOrder.orderId}-D${Date.now().toString(36)}`;
      setSpending(true);
      setSpendError(null);
      const r = await onSpendPoints(spendIdRef.current, pointsToUse, 'デリバリーのお支払い');
      setSpending(false);
      if (!r.ok) {
        setSpendError(r.message || 'N-POINTを使えませんでした。もう一度お試しください。');
        return;
      }
      spendIdRef.current = null;
    }

    if (appliedDeliveryCoupon && discountAmount > 0) {
      onCouponUsed?.(appliedDeliveryCoupon.code);
    }

    // 予約済みの内容に、今回追加する商品だけを載せる(アプリ側で既存の注文に合算する)
    // (pointsUsed は、今回の分だけ。予約の特急券で使った分は、アプリ側で足し合わせる)
    // 複数席: 今回の商品を、席ごとに何個届けるか(指定のない分は先頭の席)
    const itemSeats: NonNullable<ActiveOrder['itemSeats']> = {};
    if (multiSeat) selectedItems.forEach((ci) => (itemSeats[ci.item.id] = allocationOf(ci.item.id, ci.quantity)));
    const newOrder: ActiveOrder = {
      ...activeOrder,
      items: selectedItems,
      ...(multiSeat ? { itemSeats } : {}),
      totalPrice: finalTotalPrice - pointsToUse,
      itemDiscount: discountAmount,
      pointsUsed: pointsToUse,
      status: 'confirmed',
    };

    onConfirmOrder(newOrder);
    setCompleted({
      orderId: activeOrder.orderId,
      rows: [
        // 複数席: お届け先の席ごとの一覧が、商品の行と同じ情報
        ...(multiSeat ? [] : [{ label: '商品', value: selectedItems.map((ci) => `${ci.item.name} ×${ci.quantity}`).join('、') }]),
        {
          label: 'お届け先',
          value: multiSeat ? (
            <DeliverySeatList order={{ seatNo: activeOrder.seatNo, items: selectedItems, itemSeats }} className="max-h-40 text-left" />
          ) : (
            `${activeOrder.carNo}号車 ${formatSeats(activeOrder.seatNo)}`
          ),
        },
        { label: '合計', value: `¥${finalTotalPrice.toLocaleString()}` },
        ...(pointsToUse > 0 ? [{ label: 'N-POINT', value: `−${pointsToUse.toLocaleString()}pt` }] : []),
      ],
    });
  };

  const handleCloseCompleted = () => {
    setCompleted(null);
    setCart({});
    setAppliedDeliveryCoupon(null);
    setUsePoints(false);
    onClose();
    onFinish?.();
  };

  if (completed) {
    return (
      <CompletionModal title="注文しました" orderId={completed.orderId} rows={completed.rows} buttonLabel="注文内容を確認する" onClose={handleCloseCompleted} />
    );
  }

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
          <form onSubmit={handleSubmit} className="space-y-4">
              {/* Warning Notice when Standard Seat or No Order */}
              {isNotMegu && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-rose-900 animate-fadeIn">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-extrabold text-xs text-rose-950">めぐシート以外にはデリバリーできません</div>
                    <div className="text-[11px] leading-snug text-rose-800">
                      現在ご予約中の座席は<strong className="underline decoration-rose-400">【{getSeatClassLabel(activeOrder?.seatType)} ({activeOrder?.carNo}号車 {activeOrder ? formatSeats(activeOrder.seatNo) : ''})】</strong>です。車内デリバリーはめぐシート専用サービスのため、購入確定はできません。
                    </div>
                  </div>
                </div>
              )}

              {hasBlockedItems && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 space-y-2 text-rose-900 animate-fadeIn">
                  <div className="font-extrabold text-xs text-rose-950">ご予約の座席では注文できない商品があります</div>
                  {blockedItems.map(({ item }) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-[11px] text-rose-800">
                      <span className="min-w-0">
                        {item.name}（{getItemRestrictionLabel(item)}）
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        className="shrink-0 px-2 py-1 rounded-lg bg-white border border-rose-300 text-rose-700 font-bold cursor-pointer"
                      >
                        カゴから外す
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {hasNoOrder && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-amber-900 animate-fadeIn">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-extrabold text-xs text-amber-950">めぐシートの予約が必要です</div>
                    <div className="text-[11px] leading-snug text-amber-800">
                      特急券・座席予約が見つかりません。車内デリバリーをご利用いただくには、先に「予約」タブより、特急めぐりのめぐシートをご予約ください。
                    </div>
                  </div>
                </div>
              )}

              {/* Step 1: Seat Info */}
              <div className="bg-[#F9F8FD] p-4 rounded-2xl border border-[#E6E2EE] space-y-3">
                <div className="font-extrabold text-[#5B21B6] flex items-center justify-between text-xs gap-2">
                  <span className="whitespace-nowrap">① ご乗車・座席情報</span>
                  {activeOrder ? (
                    <span className="text-[10px] text-[#5B21B6] bg-[#EFE8FA] px-2 py-0.5 rounded border border-[#5B21B6]/20 font-bold whitespace-nowrap">
                      予約連携済み
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-300 font-bold whitespace-nowrap">
                      予約なし
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-[#6B6380] block mb-1 whitespace-nowrap">乗車列車</label>
                    <input
                      type="text"
                      readOnly
                      value={activeOrder ? activeOrder.trainName : '—'}
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
                            ? `${activeOrder.carNo}号車 (${getSeatClassLabel(activeOrder.seatType)})`
                            : '—'
                        }
                        className="w-full bg-white border border-[#D1C9E3] rounded-xl px-3 py-2 text-xs text-[#221C35] font-bold shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-[#6B6380] block mb-1 whitespace-nowrap">座席番号</label>
                      {multiSeat && activeOrder ? (
                        <div className="w-full bg-white border border-[#D1C9E3] rounded-xl px-3 py-2 text-xs text-[#221C35] font-bold shadow-2xs break-words max-h-20 overflow-y-auto">
                          {formatSeats(activeOrder.seatNo)}
                        </div>
                      ) : (
                        <input
                          type="text"
                          readOnly
                          value={activeOrder ? formatSeats(activeOrder.seatNo) : '—'}
                          className="w-full bg-white border border-[#D1C9E3] rounded-xl px-3 py-2 text-xs text-[#221C35] font-bold shadow-2xs"
                        />
                      )}
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
                              width={640}
                              height={349}
                              loading="lazy"
                              decoding="async"
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 object-cover rounded-lg shrink-0 border border-emerald-100 text-[0px]"
                              onError={handleImageError}
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
                      {multiSeat && <DeliverySeatList order={activeOrder} className="bg-white p-2.5 rounded-xl border border-emerald-200/80" />}
                    </div>
                  </div>
                )}

                {/* 今回追加する注文商品（デリバリータブで選択済みの商品） */}
                <div className="space-y-2.5">
                  <div className="font-extrabold text-[#221C35] flex items-center justify-between text-xs gap-2">
                    <span className="whitespace-nowrap">
                      {activeOrder && activeOrder.items && activeOrder.items.length > 0
                        ? '② 今回追加するお弁当・商品（デリバリータブ選択分）'
                        : '② ご注文商品（めぐシートの座席へお届け）'}
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
                              width={640}
                              height={349}
                              loading="lazy"
                              decoding="async"
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 object-cover rounded-lg shrink-0 border border-[#E6E2EE] text-[0px]"
                              onError={handleImageError}
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

              {/* 複数席: 商品ごとに、届ける席の札を選ぶ(先頭の席に、最初から全部入っている) */}
              {multiSeat && selectedItems.length > 0 && (
                <div className="bg-[#F9F8FD] p-2.5 rounded-2xl border border-[#E6E2EE] space-y-2 max-h-80 overflow-y-auto">
                  {selectedItems.map(({ item, quantity }) => {
                    const alloc = allocationOf(item.id, quantity);
                    return (
                      <div key={item.id} className="bg-white p-2.5 rounded-xl border border-[#D1C9E3]">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-xs font-bold text-[#221C35] min-w-0 truncate">{item.name}</span>
                          {quantity >= 2 && (
                            <span className="shrink-0 font-mono font-extrabold text-[11px] text-[#5B21B6] bg-[#EFE8FA] rounded-full px-2">
                              {seats.reduce((sum, st) => sum + (alloc[st] || 0), 0)}/{quantity}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {seats.map((seat, i) => {
                            const count = alloc[seat] || 0;
                            const on = count > 0;
                            return (
                              <div
                                key={seat}
                                className={`h-9 rounded-[10px] border flex items-stretch font-mono font-extrabold text-[13px] ${
                                  on ? 'bg-[#5B21B6] border-[#5B21B6] text-white' : 'bg-white border-[#D1C9E3] text-[#221C35]'
                                }`}
                              >
                                <button
                                  type="button"
                                  aria-pressed={on}
                                  aria-label={`${seatDisplayName(seat)} に届ける`}
                                  onClick={() => tapSeat(item.id, quantity, seat)}
                                  className="flex-1 min-w-0 flex items-center justify-between pl-2.5 pr-1.5 cursor-pointer"
                                >
                                  <span>{seatDisplayName(seat)}</span>
                                  {on && quantity >= 2 && <span className="text-xs text-[#EDE9FE]">{count}</span>}
                                </button>
                                {on && quantity >= 2 && i > 0 && (
                                  <button
                                    type="button"
                                    aria-label={`${seatDisplayName(seat)} を1個減らす`}
                                    onClick={() => untapSeat(item.id, quantity, seat)}
                                    className="w-7 my-1 mr-1 rounded-lg bg-white/20 text-[15px] font-normal cursor-pointer"
                                  >
                                    −
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

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
                        placeholder="クーポンコードを入力"
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

              {/* N-POINTで払う */}
              {canUsePoints && finalTotalPrice > 0 && (
                <NPointPayRow
                  balance={pointBalance ?? 0}
                  max={pointsMax}
                  on={usePoints}
                  amount={pointsAmount}
                  onToggle={(on) => {
                    setUsePoints(on);
                    if (on) setPointsAmount(pointsMax);
                    setSpendError(null);
                  }}
                  onAmountChange={(n) => {
                    setPointsAmount(n);
                    setSpendError(null);
                  }}
                />
              )}
              {spendError && (
                <div className="text-[11px] font-bold text-rose-600 bg-rose-50 rounded-xl px-3 py-2" role="alert">
                  {spendError}
                </div>
              )}
              {overOrderTotal && (
                <div className="text-[11px] font-bold text-rose-600 bg-rose-50 rounded-xl px-3 py-2" role="alert">
                  1回の注文は、特急券と合わせて{MAX_ORDER_TOTAL.toLocaleString()}円までです
                </div>
              )}

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
                      ¥{(finalTotalPrice - pointsToUse).toLocaleString()}
                    </span>
                    {discountAmount > 0 && (
                      <span className="text-xs text-gray-400 line-through font-mono">
                        ¥{rawTotalPrice.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {pointsToUse > 0 && (
                    <div className="text-[10px] font-bold text-emerald-600 font-mono">N-POINT利用 -¥{pointsToUse.toLocaleString()}</div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={selectedItems.length === 0 || isNotMegu || hasNoOrder || hasBlockedItems || overOrderTotal || spending}
                  className="bg-[#5B21B6] hover:bg-[#4C1D95] disabled:opacity-40 text-white font-extrabold text-xs sm:text-sm py-3 px-5 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all whitespace-nowrap shrink-0"
                >
                  <ShoppingBag className="w-4 h-4 text-white shrink-0" />
                  <span className="whitespace-nowrap">
                    {isNotMegu
                      ? 'めぐシート以外は注文できません'
                      : hasNoOrder
                      ? 'めぐシートの予約が必要'
                      : hasBlockedItems
                      ? '注文できない商品があります'
                      : overOrderTotal
                      ? '上限を超えるため注文できません'
                      : selectedItems.length === 0
                      ? '商品を選択してください'
                      : activeOrder && activeOrder.items && activeOrder.items.length > 0
                      ? '追加注文を確定する'
                      : 'デリバリーの購入を確定する'}
                  </span>
                </button>
              </div>
          </form>
        </div>
      </div>
    </div>
  );
};
