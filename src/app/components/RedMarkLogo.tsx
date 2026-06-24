interface RedMarkLogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "full" | "icon";
  className?: string;
}

export default function RedMarkLogo({
  size = "md",
  variant = "full",
  className = "",
}: RedMarkLogoProps) {
  const sizes = {
    sm: { container: "h-8", text: "text-lg", icon: 16 },
    md: { container: "h-12", text: "text-2xl", icon: 24 },
    lg: { container: "h-16", text: "text-3xl", icon: 32 },
  };

  const currentSize = sizes[size];

  if (variant === "icon") {
    return (
      <div className={`${className}`}>
        <svg
          width={currentSize.icon}
          height={currentSize.icon}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="redGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E10600" />
              <stop offset="100%" stopColor="#A00400" />
            </linearGradient>
          </defs>
          {/* Red gradient square background */}
          <rect width="100" height="100" fill="url(#redGradient)" rx="12" />
          
          {/* White checkmark */}
          <path
            d="M25 50 L42 67 L75 30"
            stroke="white"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative">
        <svg
          width={currentSize.icon}
          height={currentSize.icon}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="redGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E10600" />
              <stop offset="100%" stopColor="#A00400" />
            </linearGradient>
          </defs>
          {/* Red gradient square background */}
          <rect width="100" height="100" fill="url(#redGradient)" rx="12" />
          
          {/* White checkmark */}
          <path
            d="M25 50 L42 67 L75 30"
            stroke="white"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      <div className={`font-bold ${currentSize.text} leading-none`}>
        <span style={{ color: '#E10600' }}>Red</span><span style={{ color: 'currentColor' }}>Mark</span>
      </div>
    </div>
  );
}