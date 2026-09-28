// Deterministic seed-based random seat generator
export function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function isTodayWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6; // 0=Sun, 6=Sat
}

function stringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number) {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function generateOccupiedSeats(
  dateStr: string,
  trainKey: string,
  carNo: number,
  isSpecialCar: boolean
): string[] {
  const isWeekend = isTodayWeekend();
  const seedString = `${dateStr}_${trainKey}_car_${carNo}`;
  let seed = stringToSeed(seedString);

  const rows = isSpecialCar ? 8 : 10;
  const cols = isSpecialCar ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
  const occupied: string[] = [];

  // Weekend: less vacant seats (60% ~ 85% occupied)
  // Weekday: moderate occupied seats (25% ~ 55% occupied)
  const minOccupancy = isWeekend ? 0.62 : 0.28;
  const maxOccupancy = isWeekend ? 0.85 : 0.58;

  let rand = seededRandom(seed++);
  const targetOccupancyRatio = minOccupancy + rand * (maxOccupancy - minOccupancy);

  for (let r = 1; r <= rows; r++) {
    for (const c of cols) {
      const seatId = `${r}${c}`;
      rand = seededRandom(seed++);
      if (rand < targetOccupancyRatio) {
        occupied.push(seatId);
      }
    }
  }

  return occupied;
}
