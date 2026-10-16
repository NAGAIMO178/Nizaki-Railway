// 管理者画面のパスコード(この端末の中だけの扉)。初期値はコードに持たず、最初に開くとき、端末で決める。
// 運行情報をサーバーへ保存できるかは、別の「管理トークン」(サーバー側)が決める。
export const PIN_STORAGE_KEY = 'nizaki_admin_pin';

export const isValidPin = (pin: string): boolean => /^\d{4}$/.test(pin);

// 決めてあるパスコード。まだ決めていない(または壊れている)ときは null
export const getStoredPin = (): string | null => {
  try {
    const saved = localStorage.getItem(PIN_STORAGE_KEY);
    return saved !== null && isValidPin(saved) ? saved : null;
  } catch {
    return null;
  }
};

export const savePin = (pin: string): boolean => {
  if (!isValidPin(pin)) return false;
  try {
    localStorage.setItem(PIN_STORAGE_KEY, pin);
    return true;
  } catch {
    return false;
  }
};

// 消すと、次に開くとき、新しく決める
export const clearPin = (): void => {
  try {
    localStorage.removeItem(PIN_STORAGE_KEY);
  } catch {
    // 消せない環境でも、続ける
  }
};
