// パスワードの決まり(新規登録のときだけ。すでにある会員のログインは、文字数では断らない)。
// サーバー gas/Code.gs の MIN_PASSWORD_LENGTH・MAX_PASSWORD_LENGTH・validatePasswordServer と、同じ数字・同じ文言にする
// (tests/passwordRules.test.ts が、そろっているかを見張る)
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_EMAIL_LENGTH = 254;

export const validatePassword = (pw: string): string | null => {
  if (pw.length < MIN_PASSWORD_LENGTH) return `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください。`;
  if (pw.length > MAX_PASSWORD_LENGTH) return `パスワードは${MAX_PASSWORD_LENGTH}文字以内で入力してください。`;
  if (!/[a-z]/.test(pw)) return 'パスワードには英字の小文字を1文字以上含めてください。';
  if (!/[A-Z]/.test(pw)) return 'パスワードには英字の大文字を1文字以上含めてください。';
  if (!/[0-9]/.test(pw)) return 'パスワードには数字を1文字以上含めてください。';
  if (!/[!-/:-@[-`{-~]/.test(pw)) return 'パスワードには記号（例: ! # % & など）を1文字以上含めてください。';
  return null;
};
