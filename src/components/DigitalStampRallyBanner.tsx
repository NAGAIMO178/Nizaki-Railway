import React from 'react';

interface DigitalStampRallyBannerProps {
  customImageUrl?: string;
  className?: string;
}

export const DigitalStampRallyBanner: React.FC<DigitalStampRallyBannerProps> = ({
  customImageUrl,
  className = '',
}) => {
  return (
    <div className={`relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-[#E5E2EE] bg-[#0C0A10] shadow-xs ${className}`}>
      <img
        src={customImageUrl || './HAPYOU.png'}
        alt="神埼公式企画 デジタルスタンプラリー 東の都の雅石 〜坂東平野 判じ物絵図〜"
        className="w-full h-full object-cover object-center block select-none"
        referrerPolicy="no-referrer"
      />
    </div>
  );
};
