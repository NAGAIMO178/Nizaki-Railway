import React, { useLayoutEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

// パスワードの入力欄: 左に鍵、右に「表示/隠す」(目)のボタン。押すと、type="password" ⇄ "text" を切り替える(画面の表示だけ。文字は、どこにも保存・送信しない)。
//  - 欄ごとに、別々に切り替わる。はじめは、隠す。画面が閉じたり、別の画面(ログイン/登録/再設定・次の手順)に変わって、欄が消えると、隠す状態に戻る。
//  - ボタンを押しても、入力欄から、フォーカスが外れない(入力中の文字・カーソル・キーボードを、そのまま)。
//  - ボタンの押せる範囲は 44px 角。入力欄の右に余白を取り、長い文字がボタンの下に潜らない。
//  - autoComplete・name・id などは、そのまま通す(パスワードマネージャーの自動入力を、壊さない)。

export const passwordInputType = (shown: boolean): 'text' | 'password' => (shown ? 'text' : 'password');
export const toggleShown = (shown: boolean): boolean => !shown;
export const passwordToggleLabel = (shown: boolean): string => (shown ? 'パスワードを隠す' : 'パスワードを表示');

type Tone = 'default' | 'rose';
const TONE: Record<Tone, { input: string; icon: string }> = {
  default: {
    input: 'border border-[#E5E2EE] focus:border-[#5B21B6] focus:ring-1 focus:ring-[#5B21B6] text-xs text-[#221C35] outline-none',
    icon: 'text-[#857D99]',
  },
  rose: {
    input: 'border border-rose-300 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-xs text-[#221C35] outline-none bg-white',
    icon: 'text-rose-400',
  },
};

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>;

interface ViewProps extends InputProps {
  shown: boolean;
  onToggle: () => void;
  tone?: Tone;
  inputRef?: React.Ref<HTMLInputElement>;
}

// 見た目だけ(状態は、持たない)。shown で、type・ボタンの表示が決まる
export const PasswordInputView: React.FC<ViewProps> = ({ shown, onToggle, tone = 'default', inputRef, ...inputProps }) => {
  const t = TONE[tone];
  // ボタンを押しても、入力欄から、フォーカスが外れないようにする(マウスも、指も)
  const keepFocus = (e: React.SyntheticEvent) => e.preventDefault();
  return (
    <div className="relative">
      <Lock className={`w-4 h-4 ${t.icon} absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none`} />
      <input {...inputProps} ref={inputRef} type={passwordInputType(shown)} className={`w-full h-10 pl-9 pr-11 rounded-xl ${t.input}`} />
      <button
        type="button"
        onPointerDown={keepFocus}
        onMouseDown={keepFocus}
        onClick={onToggle}
        aria-label={passwordToggleLabel(shown)}
        aria-pressed={shown}
        className={`absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-xl ${t.icon} hover:opacity-80 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#5B21B6]`}
      >
        {shown ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
      </button>
    </div>
  );
};

export const PasswordInput: React.FC<InputProps & { tone?: Tone }> = ({ tone, ...inputProps }) => {
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<{ start: number | null; end: number | null; focused: boolean } | null>(null);

  // 切り替えのあとも、入力中のカーソルの位置・フォーカスを、そのまま保つ
  useLayoutEffect(() => {
    const el = ref.current;
    const c = caret.current;
    caret.current = null;
    if (!el || !c || !c.focused) return;
    if (document.activeElement !== el) el.focus();
    try {
      if (c.start !== null && c.end !== null) el.setSelectionRange(c.start, c.end);
    } catch {
      // 選べない環境では、そのまま
    }
  }, [shown]);

  return (
    <PasswordInputView
      {...inputProps}
      tone={tone}
      shown={shown}
      inputRef={ref}
      onToggle={() => {
        const el = ref.current;
        caret.current = el ? { start: el.selectionStart, end: el.selectionEnd, focused: document.activeElement === el } : null;
        setShown(toggleShown);
      }}
    />
  );
};
