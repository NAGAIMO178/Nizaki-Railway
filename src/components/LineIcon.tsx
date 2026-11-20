import React from 'react';

// LINE の緑の、小さなアイコン(吹き出し)
export const LineIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <rect width="24" height="24" rx="6" fill="#06C755" />
    <path
      fill="#fff"
      d="M12 5.2c-3.9 0-7 2.5-7 5.6 0 2.8 2.5 5.1 5.9 5.5.2 0 .5.2.5.4l-.1.7c0 .2-.2.8.7.4.9-.4 4.8-2.8 6.5-4.8 1.2-1.3 1.7-2.6 1.7-4.1 0-3.1-3.1-5.7-7.2-5.7Z"
    />
  </svg>
);
