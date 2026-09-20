import React from 'react';

interface MyWayLogoProps {
  showSlogan?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

export const MyWayLogo: React.FC<MyWayLogoProps> = ({
  showSlogan = true,
  size = 'md',
  className = '',
  onClick,
}) => {
  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  const sloganSizes = {
    sm: 'text-[9px]',
    md: 'text-[10px]',
    lg: 'text-xs',
  };

  return (
    <div
      id="myway-brand-logo"
      onClick={onClick}
      className={`inline-flex items-center gap-2 cursor-pointer select-none ${className}`}
    >
      {/* Pin + Path Logo Icon with Sparkle */}
      <div className={`relative ${iconSizes[size]} flex-shrink-0`}>
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          {/* Main Pin Outer Shape */}
          <path
            d="M24 4C14.0589 4 6 12.0589 6 22C6 29.5 12.5 37 24 44C35.5 37 42 29.5 42 22C42 12.0589 33.9411 4 24 4Z"
            fill="url(#myway-grad)"
          />
          {/* Inner cutout curve forming 'W' / dynamic route */}
          <path
            d="M24 13C19.0294 13 15 17.0294 15 22C15 26.5 19 31 24 35.5C29 31 33 26.5 33 22C33 17.0294 28.9706 13 24 13Z"
            fill="white"
          />
          <path
            d="M20 22C20 19.7909 21.7909 18 24 18C26.2091 18 28 19.7909 28 22C28 24.5 25.5 27.5 24 29C22.5 27.5 20 24.5 20 22Z"
            fill="#2563EB"
          />
          {/* Glowing sparkle on top right */}
          <path
            d="M38 4L39.5 8.5L44 10L39.5 11.5L38 16L36.5 11.5L32 10L36.5 8.5L38 4Z"
            fill="#38BDF8"
          />
          <defs>
            <linearGradient id="myway-grad" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3B82F6" />
              <stop offset="1" stopColor="#1D4ED8" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Brand Text & Slogan */}
      <div className="flex flex-col justify-center leading-tight">
        <span className={`font-black tracking-tight text-slate-900 ${textSizes[size]}`}>
          MYWAY
        </span>
        {showSlogan && (
          <span className={`text-slate-500 font-medium tracking-normal ${sloganSizes[size]}`}>
            나에게 맞는, 더 좋은 길
          </span>
        )}
      </div>
    </div>
  );
};
