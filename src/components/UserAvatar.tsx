import React from 'react';

interface UserAvatarProps {
  className?: string;
  size?: number | string;
}

/**
 * UserAvatar: kkrn_icon_user_1.png に準拠した
 * ペールブルー〜ペリウィンクルグラデーションとホワイトシルエットの丸型ユーザーアイコン
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({
  className = 'w-8 h-8',
  size,
}) => {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={size ? { width: size, height: size } : undefined}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Soft periwinkle gradient matching kkrn_icon_user_1.png */}
        <linearGradient
          id="kkrn_user_gradient"
          x1="18"
          y1="18"
          x2="82"
          y2="82"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#5F76BF" />
          <stop offset="50%" stopColor="#6C85CF" />
          <stop offset="100%" stopColor="#7B94DE" />
        </linearGradient>

        {/* Circular clip for the bottom shoulders */}
        <clipPath id="kkrn_circle_mask">
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>

      {/* Circle Background */}
      <circle cx="50" cy="50" r="48" fill="url(#kkrn_user_gradient)" />

      {/* White Silhouette with clip */}
      <g clipPath="url(#kkrn_circle_mask)">
        {/* Head */}
        <circle cx="50" cy="38" r="16.5" fill="#FFFFFF" />

        {/* Shoulders & Torso */}
        <path
          d="M 16 88 C 17 68 33 60 50 60 C 67 60 83 68 84 88 C 84 96 16 96 16 88 Z"
          fill="#FFFFFF"
        />
      </g>
    </svg>
  );
};
