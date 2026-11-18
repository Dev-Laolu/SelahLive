import { useId } from "react";

export function SelahMark({ size = 36, variant = "two-tone" }) {
  const uid = useId().replace(/:/g, "");
  const isGoldOnly = variant === "gold";
  const bookStroke = isGoldOnly ? `url(#goldGrad-${uid})` : "#FFFFFF";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 112"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flex: "none", display: "block" }}
    >
      <defs>
        <radialGradient id={`glow-${uid}`} cx="50%" cy="35%" r="36%">
          <stop offset="0%" stopColor="#FFE49E" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#E8B84A" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#E8B84A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`goldGrad-${uid}`} x1="20" y1="10" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE08A" />
          <stop offset="50%" stopColor="#E8B84A" />
          <stop offset="100%" stopColor="#C99224" />
        </linearGradient>
      </defs>

      {/* Soft radial sunburst glow */}
      <circle cx="60" cy="36" r="32" fill={`url(#glow-${uid})`} />

      {/* 5-ray sunburst rising from the book crease */}
      <g fill={`url(#goldGrad-${uid})`}>
        {/* Outer left ray */}
        <path d="M55 42 L28 19 L58 39.5 Z" />
        {/* Inner left ray */}
        <path d="M57 41 L43 9 L60 39 Z" />
        {/* Center tallest ray */}
        <path d="M57.8 41 L60 3 L62.2 41 Z" />
        {/* Inner right ray */}
        <path d="M60 39 L77 9 L63 41 Z" />
        {/* Outer right ray */}
        <path d="M62 39.5 L92 19 L65 42 Z" />
      </g>

      {/* Glowing light core at the book's top crease */}
      <circle cx="60" cy="38.5" r="4.2" fill="#FFFDF5" />

      {/* Open book outline */}
      <path
        d="M60 51 C47 39 31 37 18 39 C15.2 39.4 13.5 41.6 13.5 44.5 L12.5 82 C12.5 85 14.8 87.2 17.8 87.3 C33 87.5 47 90.5 60 99 C73 90.5 87 87.5 102.2 87.3 C105.2 87.2 107.5 85 107.5 82 L106.5 44.5 C106.5 41.6 104.8 39.4 102 39 C89 37 73 39 60 51 Z"
        stroke={bookStroke}
        strokeWidth="8.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Golden sweeping lower page accent (on two-tone mark) */}
      {!isGoldOnly && (
        <path
          d="M40 85.5 C48 88 54.5 92 60 99 C72 89.5 86 86.5 104 86.5"
          stroke={`url(#goldGrad-${uid})`}
          strokeWidth="8.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Two rounded vertical pause bars ("Selah" = pause & reflect) */}
      <rect x="46.5" y="55" width="10" height="25" rx="5" fill={`url(#goldGrad-${uid})`} />
      <rect x="63.5" y="55" width="10" height="25" rx="5" fill={`url(#goldGrad-${uid})`} />
    </svg>
  );
}

export default function Logo({ size = 36, word = true, stacked = false, variant = "two-tone" }) {
  return (
    <span
      className="brand"
      style={
        stacked
          ? { flexDirection: "column", gap: 6, textAlign: "center" }
          : { gap: Math.max(8, Math.round(size * 0.25)) }
      }
    >
      <SelahMark size={stacked ? Math.round(size * 1.35) : size} variant={variant} />
      {word && (
        <span style={{ fontSize: stacked ? Math.round(size * 0.62) : undefined, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
          <span style={{ fontWeight: 700, color: "var(--text)" }}>Selah</span>{" "}
          <span style={{ fontWeight: 500, color: "var(--gold)" }}>Live</span>
        </span>
      )}
    </span>
  );
}
