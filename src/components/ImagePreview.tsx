import React, { useEffect } from 'react';

// ダウンロードできない場所(LINE 内など)で、画像を表示して、長押しで保存してもらう
export const ImagePreview: React.FC<{ url: string; onClose: () => void }> = ({ url, onClose }) => {
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex flex-col items-center justify-center p-4 gap-3" role="dialog" aria-modal="true" aria-label="画像の保存">
      <img src={url} alt="保存する画像" className="max-w-full max-h-[75vh] rounded-xl bg-white" />
      <p className="text-xs font-bold text-white">長押しで保存</p>
      <button
        type="button"
        onClick={onClose}
        className="bg-white text-[#5B21B6] font-bold text-sm px-8 py-3 rounded-xl cursor-pointer"
      >
        閉じる
      </button>
    </div>
  );
};
