import React from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { LINE_OA_ADD_FRIEND_URL } from '../utils/accountApi';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-1.5">
    <h3 className="text-sm font-extrabold text-[#221C35]">{title}</h3>
    <div className="text-xs leading-relaxed text-[#4A4360] space-y-1.5">{children}</div>
  </section>
);

const Bullets: React.FC<{ items: string[] }> = ({ items }) => (
  <ul className="space-y-1">
    {items.map((item) => (
      <li key={item} className="pl-3 -indent-3">
        ・{item}
      </li>
    ))}
  </ul>
);

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#E5E2EE] overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E4F0] shrink-0">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-[#221C35]">
            <ShieldCheck className="w-5 h-5 text-[#5B21B6]" />
            <span>プライバシーポリシー・会員規約</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-[#6B6380] hover:bg-[#F4F3F8] cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <p className="text-xs leading-relaxed text-[#4A4360]">
            神埼鉄道グループ（個人運営のファンプロジェクト。以下「当社」）は、神埼IDでお預かりする個人情報を、以下のとおり取り扱います。
            本アプリは架空の鉄道会社を題材にしたフィクションですが、メールアドレス等の個人情報は実際にお預かりします。
          </p>

          <Section title="1. 取得する情報">
            <Bullets
              items={[
                'メールアドレス、表示名、パスワード（そのままは保存せず、ソルト付きのハッシュ値にして保存します）',
                '会員ID、ランク、入会日',
                'LINEユーザーID（本人確認のため、当社公式LINEを友だち追加しメッセージを送信した際に取得します）',
                '特急券予約・車内デリバリー注文の内容（予約コード、列車、区間、座席、商品、金額）',
                'クーポンの発行履歴',
              ]}
            />
            <p>
              ※ログイン状態、N-POINTの残高・履歴、使用済みクーポン、マイ駅設定などは、お使いの端末（ブラウザのLocalStorage等）内に保存されます。
            </p>
            <p>
              ※最寄り駅の表示のために、お使いの端末の位置情報を利用します（許可した場合のみ）。位置情報は端末内で計算し、サーバーへは送信・保存しません。
            </p>
          </Section>

          <Section title="2. 利用目的">
            <Bullets
              items={[
                '神埼IDの本人確認およびログイン',
                '特急券予約・車内デリバリー注文・クーポンの受付と照会',
                '公式LINEでの運行情報・お知らせの配信、お問い合わせへの対応',
                '不正利用の防止',
                'サービスの維持・改善',
              ]}
            />
            <p>上記以外の目的には利用しません。</p>
          </Section>

          <Section title="3. 第三者提供・外部サービスの利用">
            <p>
              法令に基づく場合を除き、ご本人の同意なく第三者に個人情報を提供しません。
              情報の保管・送受信には外部事業者であるGoogle（Google Apps Script・スプレッドシート）およびLINE（公式アカウント・Messaging API）を利用しており、これらの事業者が運用する環境で情報が取り扱われます。
            </p>
          </Section>

          <Section title="4. 安全管理">
            <p>パスワードは元に戻せない形（ソルト付きのハッシュ値）で保存し、会員台帳には当社の運営者のみがアクセスできる環境で管理します。</p>
          </Section>

          <Section title="5. 保存期間とデータの消去">
            <p>会員情報は、神埼IDを削除するまで保存します。</p>
            <p>
              マイページより「神埼IDを削除する」を実行された場合、登録されたメールアドレスおよびアカウント情報（会員台帳）は消去されます。
              なお、予約台帳・クーポン発行の記録は、LINEユーザーIDを消去して個人と結びつかない形にしたうえで、運営上の記録として残ります。
              完全なデータ消去を希望される場合は、下記6の手続きでご請求ください。
            </p>
          </Section>

          <Section title="6. 開示・訂正・利用停止・削除の請求">
            <p>
              ご本人は、当社が保有するご自身の個人データについて、開示・訂正・追加・削除・利用停止を請求できます。
            </p>
            <Bullets
              items={[
                '神埼IDの削除：マイページの「神埼IDを削除する」から、いつでもご自身で行えます。',
                'その他の請求：',
              ]}
            />
            <div className="ml-3 p-3 rounded-xl bg-[#F8F7FC] border border-[#EDE9FE] space-y-1">
              <p>
                <a
                  href={LINE_OA_ADD_FRIEND_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-[#5B21B6] underline"
                >
                  神埼鉄道グループ公式LINE
                </a>
                のトークで、「個人情報の開示請求」「訂正請求」「利用停止請求」のいずれかと、請求内容、登録しているメールアドレス（または会員ID）を送信してください。
              </p>
              <p>ご本人確認のうえ、合理的な期間内に無料にて対応いたします。</p>
            </div>
          </Section>

          <Section title="7. 会員規約">
            <Bullets
              items={[
                '神埼IDは1人1アカウントです。パスワードはご自身の責任で管理してください。',
                'なりすまし、不正アクセス、サービスの運営を妨げる行為を禁止します。',
                '本アプリ内で提供される運行情報・列車・料金・予約・デリバリー等はすべて架空の設定（フィクション）であり、実在の鉄道会社・路線・店舗とは一切関係ありません。実際の乗車券発行や商品の発送・決済は行われません。',
                '規約違反や不正利用があった場合、事前の通知なく利用の制限やアカウントの削除を行うことがあります。',
                '本サービスは個人開発の非営利プロジェクトです。サービスの遅延、中断、データの消失等により生じた損害について、当社は責任を負いかねますのであらかじめご了承ください。',
              ]}
            />
          </Section>

          <p className="text-[11px] text-[#857D99]">
            本ポリシー・規約は必要に応じて改定し、アプリ内でお知らせします。
            <br />
            制定日：2026年10月2日
            <br />
            神埼鉄道グループ
          </p>
        </div>

        <div className="px-5 py-3 border-t border-[#E8E4F0] flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
