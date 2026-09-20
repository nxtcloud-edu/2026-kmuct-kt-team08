import React from 'react';

interface WayCharacterProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'waving' | 'thinking' | 'avatar' | 'guide';
  showSpeech?: boolean;
  speechText?: string;
  className?: string;
}

export const WayCharacter: React.FC<WayCharacterProps> = ({
  size = 'md',
  variant = 'waving',
  showSpeech = false,
  speechText = '생각 중',
  className = '',
}) => {
  const dimensions = {
    xs: 'w-8 h-8',
    sm: 'w-12 h-12',
    md: 'w-20 h-20',
    lg: 'w-28 h-28',
    xl: 'w-36 h-36',
  };

  return (
    <div className={`relative inline-flex flex-col items-center justify-center ${className}`}>
      {/* Optional Thought / Speech Bubble */}
      {showSpeech && (
        <div className="absolute -top-7 bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-full shadow-md border border-blue-100 flex items-center gap-1.5 animate-bounce text-[11px] font-semibold text-blue-600 z-10 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
          <span>{speechText}</span>
        </div>
      )}

      {/* Sparkles for Waving / Active variant */}
      {variant !== 'avatar' && (
        <>
          <div className="absolute -top-1 -right-2 text-blue-400 text-xs animate-pulse select-none">
            ✦
          </div>
          <div className="absolute bottom-2 -left-2 text-sky-300 text-xs select-none">
            ✦
          </div>
        </>
      )}

      {/* Vector Illustration of Way */}
      <div className={`${dimensions[size]} relative transition-transform duration-300`}>
        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
          {/* Subtle soft shadow beneath Way */}
          <ellipse cx="60" cy="112" rx="28" ry="5" fill="#CBD5E1" fillOpacity="0.6" />

          {/* Blue Backpack / Wings */}
          <path
            d="M32 64C28 64 24 72 26 84C27.5 93 35 98 42 96L40 70C38 65 35 64 32 64Z"
            fill="#2563EB"
          />

          {/* Feet */}
          <ellipse cx="46" cy="104" rx="9" ry="6" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2" />
          <ellipse cx="74" cy="104" rx="9" ry="6" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2" />

          {/* Body */}
          <ellipse cx="60" cy="82" rx="24" ry="20" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="2" />
          <ellipse cx="60" cy="85" rx="16" ry="12" fill="#F1F5F9" fillOpacity="0.7" />

          {/* Blue Bowtie / Badge at Neck */}
          <path d="M54 68L60 71L66 68L60 74L54 68Z" fill="#3B82F6" />
          <circle cx="60" cy="70" r="2.5" fill="#60A5FA" />

          {/* Head Outer (Rounded Helmet) */}
          <rect
            x="24"
            y="18"
            width="72"
            height="50"
            rx="25"
            fill="#FFFFFF"
            stroke="#E2E8F0"
            strokeWidth="2.5"
          />

          {/* Blue Helmet Crown Arc */}
          <path
            d="M40 19C45 15 75 15 80 19"
            stroke="#3B82F6"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* Visor Screen (Dark Curved Panel) */}
          <rect
            x="32"
            y="26"
            width="56"
            height="34"
            rx="17"
            fill="#0F172A"
          />

          {/* Eyes / Face based on variant */}
          {variant === 'thinking' ? (
            <>
              {/* Question mark or curious eyes */}
              <circle cx="48" cy="42" r="3.5" fill="#38BDF8" />
              <circle cx="72" cy="42" r="3.5" fill="#38BDF8" />
              <path
                d="M56 36C56 33 64 33 64 36C64 38 60 39 60 41"
                stroke="#60A5FA"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="60" cy="45" r="1.2" fill="#60A5FA" />
            </>
          ) : (
            <>
              {/* Happy smiling curved eyes ^ ^ */}
              <path
                d="M42 42C44 38 48 38 50 42"
                stroke="#38BDF8"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <path
                d="M70 42C72 38 76 38 78 42"
                stroke="#38BDF8"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              {/* Subtle Cyan Cheeks */}
              <circle cx="40" cy="47" r="3" fill="#38BDF8" fillOpacity="0.35" />
              <circle cx="80" cy="47" r="3" fill="#38BDF8" fillOpacity="0.35" />
            </>
          )}

          {/* Left Arm */}
          <ellipse cx="28" cy="80" rx="6" ry="7" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.5" />

          {/* Right Arm (Waving up or resting) */}
          {variant === 'waving' ? (
            <g className="origin-[82px_74px] animate-pulse">
              <path
                d="M82 74C86 68 96 58 100 52C102 49 106 53 103 57C98 65 90 78 85 82"
                fill="#FFFFFF"
                stroke="#E2E8F0"
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* Round Hand Palm */}
              <circle cx="102" cy="53" r="6" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.5" />
            </g>
          ) : (
            <ellipse cx="92" cy="80" rx="6" ry="7" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.5" />
          )}
        </svg>
      </div>
    </div>
  );
};
