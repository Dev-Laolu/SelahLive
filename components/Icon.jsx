// Rounded line icons, Lucide-style (24px grid, 1.75 stroke). Strings are path data; arrays are [cx,cy,r] circles; objects are rects.
const P = {
  book: ["M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z", "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"],
  music: ["M9 18V5l12-2v13", [6, 18, 3], [18, 16, 3]],
  type: ["M4 7V4h16v3", "M9 20h6", "M12 4v16"],
  library: ["M16 6l4 14", "M12 6v14", "M8 8v12", "M4 4v16"],
  monitor: [{ x: 2, y: 3, w: 20, h: 14, rx: 2 }, "M8 21h8", "M12 17v4"],
  sliders: ["M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"],
  bell: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"],
  user: ["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", [12, 7, 4]],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", [9, 7, 4], "M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"],
  search: [[11, 11, 8], "M21 21l-4.3-4.3"],
  play: ["M6 3l14 9-14 9z"],
  eye: ["M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z", [12, 12, 3]],
  eyeoff: ["M9.88 9.88a3 3 0 1 0 4.24 4.24", "M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13 13 0 0 1-1.67 2.68", "M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61", "M2 2l20 20"],
  check: ["M20 6L9 17l-5-5"],
  checkc: ["M22 11.08V12a10 10 0 1 1-5.93-9.14", "M9 11l3 3L22 4"],
  x: ["M18 6L6 18M6 6l12 12"],
  left: ["M15 18l-6-6 6-6"], right: ["M9 18l6-6-6-6"], down: ["M6 9l6 6 6-6"],
  star: ["M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"],
  pin: ["M12 17v5", "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  upload: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"],
  trash: ["M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  wifioff: ["M12 20h.01", "M8.5 16.43a5 5 0 0 1 7 0", "M5 12.86a10 10 0 0 1 5.17-2.69", "M2 8.82a15 15 0 0 1 4.18-2.65", "M2 2l20 20"],
  alert: ["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v4M12 17h.01"],
  alertc: [[12, 12, 10], "M12 8v4M12 16h.01"],
  copy: [{ x: 9, y: 9, w: 13, h: 13, rx: 2 }, "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"],
  plus: ["M5 12h14M12 5v14"],
  loader: ["M21 12a9 9 0 1 1-6.219-8.56"],
  pause: ["M6 4h4v16H6zM14 4h4v16h-4z"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  link: ["M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"],
  lower: [{ x: 3, y: 4, w: 18, h: 16, rx: 2 }, "M3 14h18"],
  full: ["M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"],
  chart: ["M3 3v18h18", "M18 17V9M13 17V5M8 17v-3"],
  file: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6M16 13H8M16 17H8"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  ext: ["M15 3h6v6M10 14L21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"],
  moon: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"],
  sun: [[12, 12, 4], "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"],
  bolt: ["M13 2L3 14h9l-1 8 10-12h-9z"],
  refresh: ["M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5", "M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16", "M16 16h5v5"],
  send: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4z"],
  clock: [[12, 12, 10], "M12 6v6l4 2"],
  home: ["M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
  undo: ["M3 7v6h6", "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"],
  redo: ["M21 7v6h-6", "M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"],
  sparkle: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"],
  help: [[12, 12, 10], "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", "M12 17h.01"],
};

export default function Icon({ name, size, className = "", style, ...rest }) {
  const items = P[name] || [];
  return (
    <svg className={`icon ${className}`} style={size ? { width: size, height: size, ...style } : style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {items.map((it, i) => typeof it === "string" ? <path key={i} d={it} /> : Array.isArray(it) ? <circle key={i} cx={it[0]} cy={it[1]} r={it[2]} /> : <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} rx={it.rx} />)}
    </svg>
  );
}
