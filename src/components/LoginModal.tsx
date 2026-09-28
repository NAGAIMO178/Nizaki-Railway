import React, { useState, useEffect } from 'react';
import { X, Lock, Mail, ShieldCheck, ArrowRight, Sparkles, Train, KeyRound } from 'lucide-react';
import { UserProfile } from '../types';
import {
  loginWithPassword,
  startLineVerification,
  verifyLineAndRegister,
  LINE_OA_ADD_FRIEND_URL,
} from '../utils/accountApi';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: UserProfile) => void;
  reason?: string;
  onSuccessCallback?: () => void;
}

type RegisterStep = 'form' | 'line-wait';

const validatePassword = (pw: string): string | null => {
  if (pw.length < 6) return 'パスワードは6文字以上で入力してください。';
  if (!/[a-z]/.test(pw)) return 'パスワードには英字の小文字を1文字以上含めてください。';
  if (!/[A-Z]/.test(pw)) return 'パスワードには英字の大文字を1文字以上含めてください。';
  if (!/[0-9]/.test(pw)) return 'パスワードには数字を1文字以上含めてください。';
  if (!/[!-/:-@[-`{-~]/.test(pw)) return 'パスワードには記号（例: ! # % & など）を1文字以上含めてください。';
  return null;
};

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  reason,
  onSuccessCallback,
}) => {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [registerStep, setRegisterStep] = useState<RegisterStep>('form');

  const [idOrEmail, setIdOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [lineToken, setLineToken] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const resetAll = () => {
    setIsRegisterMode(false);
    setRegisterStep('form');
    setIdOrEmail('');
    setPassword('');
    setConfirmPassword('');
    setOtpCode('');
    setLineToken('');
    setError(null);
    setIsSubmitting(false);
    setResendCooldown(0);
  };

  if (!isOpen) return null;

  // 簡単デモログイン（実演用・パスワード不要）
  const handleQuickLogin = (rank: 'レギュラー' | 'ゴールド' | 'プレミアム' = 'ゴールド') => {
    const demoUser: UserProfile = {
      memberId: 'KZ-88219',
      name: 'nizaki.demo',
      email: 'nizaki.demo@example.com',
      rank,
      joinDate: '2024-04-01',
    };
    onLogin(demoUser);
    resetAll();
    onClose();
    if (onSuccessCallback) {
      onSuccessCallback();
    }
  };

  // ログイン処理（実アカウント: 神埼ID/GASバックエンドに照会）
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const email = idOrEmail.trim().toLowerCase();
    if (!email) {
      setError('メールアドレスを入力してください。');
      return;
    }
    if (!password) {
      setError('パスワードを入力してください。');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await loginWithPassword(email, password);
      if (result.status === 'success' && result.user) {
        const user: UserProfile = {
          memberId: result.user.memberId,
          name: result.user.name,
          email: result.user.email,
          rank: result.user.rank as UserProfile['rank'],
          joinDate: result.user.joinDate,
        };
        onLogin(user);
        resetAll();
        onClose();
        if (onSuccessCallback) {
          onSuccessCallback();
        }
      } else {
        setError(result.message || 'メールアドレスまたはパスワードが正しくありません。');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログイン中にエラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 新規登録フォーム(メール・パスワード)の入力チェック
  const validateRegisterForm = (): string | null => {
    const email = idOrEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return '有効なメールアドレスを入力してください。';
    }
    const pwError = validatePassword(password);
    if (pwError) return pwError;
    if (password !== confirmPassword) return '確認用パスワードが一致しません。';
    return null;
  };

  // 新規登録 ステップ1: 入力内容を検証して合言葉トークンを発行
  const handleStartLineCore = async () => {
    setError(null);

    const validationError = validateRegisterForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await startLineVerification();
      if (result.status === 'success' && result.token) {
        setLineToken(result.token);
        setOtpCode('');
        setRegisterStep('line-wait');
        setResendCooldown(30);
      } else {
        setError(result.message || '合言葉の発行に失敗しました。');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'LINE認証の開始に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartLineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleStartLineCore();
  };

  // 新規登録 ステップ2(LINE版): LINEで届いた認証コードを検証して本登録
  const handleLineVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const code = otpCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setError('6桁の認証コードを入力してください。');
      return;
    }

    setIsSubmitting(true);
    try {
      const email = idOrEmail.trim().toLowerCase();
      const result = await verifyLineAndRegister(email, password, lineToken, code);
      if (result.status === 'success' && result.user) {
        const user: UserProfile = {
          memberId: result.user.memberId,
          name: result.user.name,
          email: result.user.email,
          rank: result.user.rank as UserProfile['rank'],
          joinDate: result.user.joinDate,
        };
        onLogin(user);
        resetAll();
        onClose();
        if (onSuccessCallback) {
          onSuccessCallback();
        }
      } else {
        setError(result.message || '認証コードが正しくありません。');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '認証中にエラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const showingLineStep = isRegisterMode && registerStep === 'line-wait';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-[#E5E2EE] overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* ヘッダー */}
        <div className="relative bg-gradient-to-r from-[#221C35] via-[#3B1F68] to-[#5B21B6] text-white p-5">
          <button
            onClick={() => {
              resetAll();
              onClose();
            }}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
            title="閉じる"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-1.5">
            <span className="bg-amber-400 text-[#221C35] text-[10px] font-black px-2 py-0.5 rounded shadow-xs tracking-wider">
              NIZAKI ID
            </span>
            <span className="text-white/80 text-xs font-medium">神埼鉄道 公式会員サービス</span>
          </div>

          <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
            <Train className="w-5 h-5 text-amber-300" />
            <span>
              {showingLineStep
                ? 'LINE認証コードの入力'
                : isRegisterMode
                ? '神埼ID 新規会員登録（無料）'
                : '神埼ID ログイン'}
            </span>
          </h3>

          {/* 理由の提示（なぜログインが必要か） */}
          {reason && !showingLineStep && (
            <div className="mt-3 p-2.5 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs flex items-start gap-2 leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <span>{reason}</span>
            </div>
          )}
        </div>

        {/* ボディ */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {!isRegisterMode && (
            <>
              {/* ワンタップ簡単ログイン（推奨・体験用） */}
              <div className="bg-[#F8F7FC] rounded-xl p-3.5 border border-[#EDE9FE] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#5B21B6] flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    ワンタップ簡単ログイン（お試し・実演用）
                  </span>
                  <span className="text-[10px] bg-[#EDE9FE] text-[#5B21B6] px-2 py-0.5 rounded-full font-bold">
                    パスワード不要
                  </span>
                </div>
                <p className="text-[11px] text-[#6B6380] leading-relaxed">
                  神埼 太郎（ゴールド会員 / KZ-88219）として即座に認証し、予約・注文・イベントの全機能を開放します。
                </p>
                <button
                  type="button"
                  onClick={() => handleQuickLogin('ゴールド')}
                  className="w-full h-10 rounded-xl bg-[#5B21B6] hover:bg-[#4C1D95] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  <span>神埼IDでワンタップ認証する</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs text-[#857D99]">
                <div className="h-px bg-[#E5E2EE] flex-1" />
                <span>またはメールでログイン</span>
                <div className="h-px bg-[#E5E2EE] flex-1" />
              </div>
            </>
          )}

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 text-xs font-medium">
              {error}
            </div>
          )}

          {/* ログインフォーム */}
          {!isRegisterMode && (
            <form onSubmit={handleLoginSubmit} action="#" method="post" autoComplete="on" className="space-y-3" key="login-form">
              <div className="space-y-1">
                <label htmlFor="login-username" className="text-xs font-bold text-[#221C35]">
                  メールアドレス
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#857D99] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-username"
                    name="username"
                    type="email"
                    inputMode="email"
                    autoComplete="username webauthn"
                    value={idOrEmail}
                    onChange={(e) => setIdOrEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    required
                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#E5E2EE] focus:border-[#5B21B6] focus:ring-1 focus:ring-[#5B21B6] text-xs text-[#221C35] outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="login-password" className="text-xs font-bold text-[#221C35]">
                  パスワード
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#857D99] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password webauthn"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#E5E2EE] focus:border-[#5B21B6] focus:ring-1 focus:ring-[#5B21B6] text-xs text-[#221C35] outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 rounded-xl bg-[#221C35] hover:bg-[#3B1F68] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer pt-1 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span>{isSubmitting ? 'ログイン中...' : 'ログインする'}</span>
                {!isSubmitting && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          )}

          {/* 新規登録 ステップ1: メールアドレス・パスワード入力 */}
          {isRegisterMode && registerStep === 'form' && (
            <form
              onSubmit={handleStartLineSubmit}
              action="#"
              method="post"
              autoComplete="on"
              className="space-y-3"
              key="register-form"
            >
              <div className="space-y-1">
                <label htmlFor="register-email" className="text-xs font-bold text-[#221C35]">
                  メールアドレス
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#857D99] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="register-email"
                    name="username"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    value={idOrEmail}
                    onChange={(e) => setIdOrEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    required
                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#E5E2EE] focus:border-[#5B21B6] focus:ring-1 focus:ring-[#5B21B6] text-xs text-[#221C35] outline-none"
                  />
                </div>
                <p className="text-[10px] text-[#857D99] pt-0.5">ログイン時に使うアカウントIDになります（認証コードはLINEに届きます）。</p>
              </div>

              <div className="space-y-1">
                <label htmlFor="register-password" className="text-xs font-bold text-[#221C35]">
                  パスワード
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#857D99] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="register-password"
                    name="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#E5E2EE] focus:border-[#5B21B6] focus:ring-1 focus:ring-[#5B21B6] text-xs text-[#221C35] outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="register-password-confirm" className="text-xs font-bold text-[#221C35]">
                  パスワード（確認用）
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#857D99] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="register-password-confirm"
                    name="new-password-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#E5E2EE] focus:border-[#5B21B6] focus:ring-1 focus:ring-[#5B21B6] text-xs text-[#221C35] outline-none"
                  />
                </div>
                <p className="text-[10px] text-[#857D99] pt-0.5">
                  6文字以上、英大文字・小文字・数字・記号をすべて含めてください。
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span>{isSubmitting ? '準備中...' : 'LINEで認証コードを受け取る'}</span>
                {!isSubmitting && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          )}

          {/* 新規登録 ステップ2(LINE版): 合言葉送信案内と認証コード入力 */}
          {showingLineStep && (
            <form onSubmit={handleLineVerifySubmit} className="space-y-3" key="line-form">
              <div className="p-3 rounded-xl bg-[#F0FDF4] border border-emerald-200 text-emerald-700 text-xs space-y-2 leading-relaxed">
                <p className="font-bold">① 神埼鉄道グループ公式LINEを友だち追加</p>
                <a
                  href={LINE_OA_ADD_FRIEND_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center px-3 rounded-lg bg-[#06C755] text-white font-bold text-[11px] no-underline"
                >
                  友だち追加はこちら
                </a>
                <p className="font-bold pt-1">② 次の合言葉をそのままLINEで送信</p>
                <div className="text-center py-2 bg-white rounded-lg border border-emerald-300 text-lg font-black tracking-[0.3em] text-[#221C35]">
                  {lineToken}
                </div>
                <p className="font-bold pt-1">③ LINEに返信で届く6桁コードを下に入力</p>
              </div>

              <div className="space-y-1">
                <label htmlFor="line-otp" className="text-xs font-bold text-[#221C35]">
                  認証コード（6桁）
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#857D99] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="line-otp"
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="123456"
                    required
                    className="w-full h-11 pl-9 pr-3 rounded-xl border border-[#E5E2EE] focus:border-[#5B21B6] focus:ring-1 focus:ring-[#5B21B6] text-sm tracking-[0.3em] font-bold text-[#221C35] outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 rounded-xl bg-[#221C35] hover:bg-[#3B1F68] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span>{isSubmitting ? '認証中...' : '認証して登録完了'}</span>
                {!isSubmitting && <ArrowRight className="w-4 h-4" />}
              </button>

              <div className="flex items-center justify-between text-[11px] pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setRegisterStep('form');
                    setOtpCode('');
                    setError(null);
                  }}
                  className="text-[#857D99] hover:underline cursor-pointer"
                >
                  ← 入力内容を修正する
                </button>
                <button
                  type="button"
                  onClick={handleStartLineCore}
                  disabled={resendCooldown > 0 || isSubmitting}
                  className="text-[#5B21B6] hover:underline font-bold cursor-pointer disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0 ? `合言葉を再発行 (${resendCooldown}秒後)` : '合言葉を再発行する'}
                </button>
              </div>
            </form>
          )}

          {/* モード切替 */}
          {!showingLineStep && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(!isRegisterMode);
                  setRegisterStep('form');
                  setError(null);
                }}
                className="text-xs text-[#5B21B6] hover:underline font-bold cursor-pointer"
              >
                {isRegisterMode ? 'すでにアカウントをお持ちの方（ログイン）' : 'まだ神埼IDをお持ちでない方（新規無料登録）'}
              </button>
            </div>
          )}
        </div>

        {/* フッター規約 */}
        <div className="p-3 bg-[#F8F7FC] border-t border-[#E5E2EE] text-center text-[10px] text-[#857D99]">
          神埼鉄道 NIZAKI ID 会員規約およびプライバシーポリシーに同意して利用します。
        </div>
      </div>
    </div>
  );
};
