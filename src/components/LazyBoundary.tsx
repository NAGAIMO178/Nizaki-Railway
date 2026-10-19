import React, { Suspense } from 'react';

// 画面のファイルを読み込めなかったときの表示(通信が弱いときや、更新の直後)
export const LoadFailed: React.FC<{ overlay?: boolean }> = ({ overlay = false }) => {
  const card = (
    <div className="text-center py-10 px-4">
      <p className="text-xs text-[#6B6380] mb-3">読み込めませんでした</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="bg-[#5B21B6] hover:bg-[#4C1D95] text-white text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer"
      >
        再読み込み
      </button>
    </div>
  );
  return overlay ? (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl">{card}</div>
    </div>
  ) : (
    card
  );
};

interface Props {
  fallback?: React.ReactNode;
  overlay?: boolean;
  children: React.ReactNode;
}

// 遅延読み込みの部品を包む: 読み込み中は fallback、失敗したら「再読み込み」を出す(アプリ全体を白くしない)
export class LazyBoundary extends React.Component<Props, { failed: boolean }> {
  declare props: Props;
  state = { failed: false };

  constructor(props: Props) {
    super(props);
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <LoadFailed overlay={this.props.overlay} />;
    return <Suspense fallback={this.props.fallback ?? null}>{this.props.children}</Suspense>;
  }
}
