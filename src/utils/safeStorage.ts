// localStorage の代わりに使う保存先。localStorage が使えない端末(プライベートブラウズ・保存を禁止している設定など)でも、
// アプリを開いているあいだは、メモリ上に覚えて、動くようにする(閉じると、なくなる)。
//  - 読む: メモリに覚えたものがあれば、それ。なければ localStorage。読めなければ null。
//  - 書く: localStorage に書けたらそれ(メモリの分は消す)。書けなければ、メモリに覚える。
const memory = new Map<string, string>();

const ls = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export const safeStorage = {
  getItem(key: string): string | null {
    if (memory.has(key)) return memory.get(key) ?? null;
    try {
      return ls()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      const s = ls();
      if (!s) throw new Error('no storage');
      s.setItem(key, value);
      memory.delete(key);
    } catch {
      memory.set(key, String(value));
    }
  },
  removeItem(key: string): void {
    memory.delete(key);
    try {
      ls()?.removeItem(key);
    } catch {
      // 消せなくても、メモリの分は消した
    }
  },
};

// テスト用: メモリに覚えた分を、空にする
export const clearSafeStorageMemory = (): void => memory.clear();
