import React, { useState, useEffect, useMemo } from 'react';
import { X, Armchair, Check } from 'lucide-react';
import { getTodayDateString, generateOccupiedSeats, isTodayWeekend } from '../utils/seatUtils';

interface SeatSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  expressType?: 'ayami' | 'nliner' | 'meguri';
  trainName: string;
  departureTime: string;
  boardingStation: string;
  destinationStation: string;
  initialSeatType?: 'standard' | 'reserved' | 'green' | 'premium' | 'megu';
  basePrice: number;
  onConfirmSeat: (selection: {
    carNo: number;
    seatNo: string;
    isSpecialCar: boolean;
    specialCarFee: number;
  }) => void;
}

export const SeatSelectionModal: React.FC<SeatSelectionModalProps> = ({
  isOpen,
  onClose,
  expressType = 'ayami',
  trainName,
  departureTime,
  boardingStation,
  destinationStation,
  initialSeatType = 'reserved',
  basePrice,
  onConfirmSeat,
}) => {
  const isSpecialSeatType =
    initialSeatType === 'green' ||
    initialSeatType === 'megu' ||
    initialSeatType === 'premium';

  // 号車リストの決定:
  // 特別車: 1号車のみ
  // あやみ普通指定席: 2, 3, 4, 5号車のみ (6号車は自由席)
  // Nライナー: 2〜10号車
  // めぐり: 2〜5号車
  const availableCars = useMemo(() => {
    if (isSpecialSeatType) {
      return [1];
    }
    if (expressType === 'nliner') {
      return [2, 3, 4, 5, 6, 7, 8, 9, 10];
    }
    return [2, 3, 4, 5];
  }, [isSpecialSeatType, expressType]);

  const [selectedCarNo, setSelectedCarNo] = useState<number>(availableCars[0]);
  const [selectedSeatId, setSelectedSeatId] = useState<string>('');

  const todayStr = useMemo(() => getTodayDateString(), []);
  const isWeekend = useMemo(() => isTodayWeekend(), []);

  // 当日・当該列車・号車の固定された予約済み座席リストを取得
  const currentOccupied = useMemo(() => {
    return generateOccupiedSeats(
      todayStr,
      `${expressType}_${trainName}`,
      selectedCarNo,
      selectedCarNo === 1
    );
  }, [todayStr, expressType, trainName, selectedCarNo]);

  useEffect(() => {
    if (isOpen) {
      const defaultCar = availableCars[0];
      setSelectedCarNo(defaultCar);
      setSelectedSeatId(defaultCar === 1 ? '3A' : '4B');
    }
  }, [isOpen, availableCars]);

  const isSpecialCar = selectedCarNo === 1;

  if (!isOpen) return null;

  const handleCarChange = (carNo: number) => {
    setSelectedCarNo(carNo);
    const isCarSpecial = carNo === 1;
    setSelectedSeatId(isCarSpecial ? '3A' : '4B');
  };

  const handleSeatClick = (seatId: string) => {
    if (currentOccupied.includes(seatId)) return;
    setSelectedSeatId(seatId);
  };

  const handleConfirm = () => {
    onConfirmSeat({
      carNo: selectedCarNo,
      seatNo: selectedSeatId,
      isSpecialCar,
      specialCarFee: 0,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-white rounded-xl max-w-sm w-full p-3.5 space-y-3 shadow-xl border border-gray-200 relative max-h-[90vh] flex flex-col text-gray-800 text-xs">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <Armchair className="w-4 h-4 text-gray-700 shrink-0" />
            <div>
              <h3 className="font-bold text-gray-900 text-sm leading-tight flex items-center gap-1.5">
                座席選択
                {isSpecialCar && (
                  <span className="text-[10px] font-semibold bg-gray-800 text-white px-1.5 py-0.2 rounded">
                    特別車
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-gray-500">
                {trainName} ({departureTime}) | {boardingStation.replace('駅','')} → {destinationStation.replace('駅','')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
          {/* Car Selector */}
          <div>
            <div className="text-[10px] text-gray-500 mb-1 font-medium flex justify-between items-center">
              <span>号車選択</span>
              <span className="text-[10px] text-gray-600 font-semibold">
                {isSpecialSeatType
                  ? '1号車 (特別車)'
                  : expressType === 'nliner'
                  ? '2〜10号車 (普通車)'
                  : '2〜6号車 (普通車)'}
              </span>
            </div>

            <div className={`grid gap-1 p-0.5 bg-gray-100 rounded-lg ${
              isSpecialSeatType ? 'grid-cols-1' : expressType === 'nliner' ? 'grid-cols-5' : 'grid-cols-5'
            }`}>
              {availableCars.map((car) => {
                const isSelected = selectedCarNo === car;
                return (
                  <button
                    key={car}
                    onClick={() => handleCarChange(car)}
                    className={`py-1.5 px-1 rounded font-bold text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-gray-900 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                    }`}
                  >
                    {car}号車
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seat Status Legend & Direction */}
          <div className="flex items-center justify-between text-[10px] text-gray-500 bg-gray-50 py-1.5 px-2.5 rounded border border-gray-100">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm border border-gray-300 bg-white" />
                空席
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-gray-900" />
                選択中
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-gray-300" />
                予約済
              </span>
            </div>
            <span className="text-[9px] text-gray-400 font-medium">
              {isWeekend ? '土日(混雑)' : '平日(標準)'} ▲進行方向
            </span>
          </div>

          {/* DYNAMIC SEATING GRID */}
          <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200 space-y-1.5">
            {isSpecialCar ? (
              /* 1. 特別車 (1+2) */
              <div className="space-y-1.5">
                <div className="grid grid-cols-3 gap-1.5 text-center text-[9px] text-gray-400 font-medium pb-1 border-b border-gray-200">
                  <div>A (独立窓側)</div>
                  <div className="col-span-2 flex justify-around">
                    <span>B (通路)</span>
                    <span>C (窓側)</span>
                  </div>
                </div>

                {Array.from({ length: 8 }, (_, rIdx) => {
                  const row = rIdx + 1;
                  const seatA = `${row}A`;
                  const seatB = `${row}B`;
                  const seatC = `${row}C`;

                  return (
                    <div key={row} className="flex items-center justify-between gap-1.5">
                      <div className="flex-1">
                        <SeatButton
                          seatId={seatA}
                          isSelected={selectedSeatId === seatA}
                          isOccupied={currentOccupied.includes(seatA)}
                          onClick={() => handleSeatClick(seatA)}
                        />
                      </div>

                      <div className="w-5 shrink-0 text-center text-[9px] text-gray-400 font-mono">
                        {row}
                      </div>

                      <div className="flex-2 grid grid-cols-2 gap-1">
                        <SeatButton
                          seatId={seatB}
                          isSelected={selectedSeatId === seatB}
                          isOccupied={currentOccupied.includes(seatB)}
                          onClick={() => handleSeatClick(seatB)}
                        />
                        <SeatButton
                          seatId={seatC}
                          isSelected={selectedSeatId === seatC}
                          isOccupied={currentOccupied.includes(seatC)}
                          onClick={() => handleSeatClick(seatC)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* 2. 普通車 (2+2) */
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-3 text-center text-[9px] text-gray-400 font-medium pb-1 border-b border-gray-200">
                  <div className="flex justify-around">
                    <span>A</span>
                    <span>B</span>
                  </div>
                  <div className="flex justify-around">
                    <span>C</span>
                    <span>D</span>
                  </div>
                </div>

                {Array.from({ length: 10 }, (_, rIdx) => {
                  const row = rIdx + 1;
                  const seatA = `${row}A`;
                  const seatB = `${row}B`;
                  const seatC = `${row}C`;
                  const seatD = `${row}D`;

                  return (
                    <div key={row} className="flex items-center justify-between gap-1">
                      <div className="flex-1 grid grid-cols-2 gap-1">
                        <SeatButton
                          seatId={seatA}
                          isSelected={selectedSeatId === seatA}
                          isOccupied={currentOccupied.includes(seatA)}
                          onClick={() => handleSeatClick(seatA)}
                        />
                        <SeatButton
                          seatId={seatB}
                          isSelected={selectedSeatId === seatB}
                          isOccupied={currentOccupied.includes(seatB)}
                          onClick={() => handleSeatClick(seatB)}
                        />
                      </div>

                      <div className="w-5 shrink-0 text-center text-[9px] text-gray-400 font-mono">
                        {row}
                      </div>

                      <div className="flex-1 grid grid-cols-2 gap-1">
                        <SeatButton
                          seatId={seatC}
                          isSelected={selectedSeatId === seatC}
                          isOccupied={currentOccupied.includes(seatC)}
                          onClick={() => handleSeatClick(seatC)}
                        />
                        <SeatButton
                          seatId={seatD}
                          isSelected={selectedSeatId === seatD}
                          isOccupied={currentOccupied.includes(seatD)}
                          onClick={() => handleSeatClick(seatD)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Confirm */}
        <div className="border-t border-gray-100 pt-2 space-y-2 shrink-0">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">
              指定席: <strong className="text-gray-900">{selectedCarNo}号車 {selectedSeatId}</strong>
            </span>
            <span className="font-bold text-gray-900 text-sm">
              ¥{basePrice.toLocaleString()}
            </span>
          </div>

          <button
            onClick={handleConfirm}
            className="w-full bg-gray-900 hover:bg-black text-white font-bold text-xs py-2.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Check className="w-4 h-4 text-white" />
            <span>{selectedCarNo}号車 {selectedSeatId} で座席確定</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// Reusable Seat Button
interface SeatButtonProps {
  seatId: string;
  isSelected: boolean;
  isOccupied: boolean;
  onClick: () => void;
}

const SeatButton: React.FC<SeatButtonProps> = ({
  seatId,
  isSelected,
  isOccupied,
  onClick,
}) => {
  if (isOccupied) {
    return (
      <div className="bg-gray-200 border border-gray-200 text-gray-400 text-[10px] font-mono py-1 rounded text-center select-none cursor-not-allowed">
        {seatId}
      </div>
    );
  }

  if (isSelected) {
    return (
      <button
        onClick={onClick}
        className="bg-gray-900 text-white font-mono font-bold text-[10px] py-1 rounded text-center shadow-xs cursor-pointer transition-all border border-gray-900"
      >
        {seatId}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="bg-white hover:bg-gray-100 text-gray-800 font-mono text-[10px] py-1 rounded text-center border border-gray-300 transition-all cursor-pointer"
    >
      {seatId}
    </button>
  );
};
