// Versioned Theme Schema, Defaults, Validation, Fonts, and Template Generator (V1.1 Section 3).

export const CURATED_FONTS = [
  { value: '"Inter", system-ui, sans-serif', label: "Inter (Clean Sans)" },
  { value: '"Outfit", system-ui, sans-serif', label: "Outfit (Modern Geometric)" },
  { value: '"Poppins", system-ui, sans-serif', label: "Poppins (Friendly Rounded)" },
  { value: '"Montserrat", system-ui, sans-serif', label: "Montserrat (Bold Broadcast)" },
  { value: '"Roboto", system-ui, sans-serif', label: "Roboto (Neutral UI)" },
  { value: '"Lato", system-ui, sans-serif', label: "Lato (Warm Sans)" },
  { value: '"Merriweather", Georgia, serif', label: "Merriweather (Classic Serif)" },
  { value: '"Playfair Display", Georgia, serif', label: "Playfair Display (Editorial Serif)" },
  { value: '"Oswald", Impact, sans-serif', label: "Oswald (Tall Condensed)" },
];

export const TRANSITION_TYPES = [
  { value: "fade", label: "Fade" },
  { value: "slide-up", label: "Slide up" },
  { value: "slide-left", label: "Slide left" },
  { value: "zoom", label: "Zoom" },
  { value: "none", label: "None" },
];

export const EASING_TYPES = [
  { value: "ease-out", label: "Ease out (smooth)" },
  { value: "ease-in-out", label: "Ease in-out (gentle)" },
  { value: "cubic-bezier(0.22, 1, 0.36, 1)", label: "Broadcast snappy" },
  { value: "linear", label: "Linear" },
];

export const BG_TYPES = [
  { value: "solid", label: "Solid colour" },
  { value: "gradient", label: "Gradient" },
  { value: "animated-gradient", label: "Animated gradient" },
  { value: "image", label: "Background image" },
  { value: "none", label: "Transparent (None)" },
];

export const FIT_MODES = [
  { value: "cover", label: "Cover (crop to fill)" },
  { value: "contain", label: "Contain (fit inside)" },
  { value: "fill", label: "Stretch to fill" },
];

export const REF_POSITIONS = [
  { value: "below", label: "Underneath text (default)" },
  { value: "above", label: "Above text" },
  { value: "inline", label: "Inline beside text" },
];

export const DEFAULT_BRAND_SWATCHES = ["#0B1020", "#12264A", "#2B1740", "#143A2E", "#3A1A1A", "#1A1A1A", "#E8B84A", "#FFFFFF"];

export function createBaseLayout(isFullScreen = false) {
  return {
    // Bar / Container geometry (for lowerThird; fullScreen is 1920x1080)
    x: isFullScreen ? 0 : 160,
    y: isFullScreen ? 0 : 780, // top-left Y in 1920x1080 stage (780 + 220 = 1000 => 80px bottom margin)
    width: isFullScreen ? 1920 : 1600,
    height: isFullScreen ? 1080 : 220,
    bottom: 80,
    hpos: "center",
    radius: isFullScreen ? 0 : 16,
    paddingX: isFullScreen ? 180 : 40,
    paddingY: isFullScreen ? 140 : 28,

    // Background
    bgType: isFullScreen ? "animated-gradient" : "solid",
    bgColor: "#0B1020",
    bgOpacity: isFullScreen ? 100 : 92,
    gradientStyle: "linear", // linear | radial
    gradientAngle: 135,
    gradientStops: ["#0B1020", "#17254A", "#0B1020"],
    gradientSpeed: 20, // seconds
    bgImageAssetId: "",
    bgImageDataUrl: "",
    bgFit: "cover",
    backdropBlur: 0,
    borderWidth: isFullScreen ? 0 : 1,
    borderColor: "#2A3558",
    accentBarColor: "#E8B84A",
    accentBarHeight: isFullScreen ? 0 : 4,
    boxShadow: !isFullScreen,

    // Text styling
    fontFamily: '"Inter", system-ui, sans-serif',
    fontSize: isFullScreen ? 84 : 52,
    minFontSize: isFullScreen ? 36 : 26,
    weight: 800,
    lineHeight: 1.18,
    letterSpacing: 0,
    align: isFullScreen ? "center" : "left",
    uppercase: false,
    autoFit: true,
    textColor: "#FFFFFF",
    refColor: "#E8B84A",
    versionColor: "#E8B84A",
    labelColor: "#E8B84A",

    // Text effects
    textShadow: true,
    textShadowBlur: 12,
    textShadowOffsetY: 2,
    textShadowColor: "#000000",
    textOutlineWidth: 0,
    textOutlineColor: "#000000",
    textGlow: false,
    textGlowColor: "#E8B84A",
    textHighlightBg: "",

    // Reference line
    refPosition: "below", // below | above | inline
    refSeparator: " · ",
    showVersion: true,
    showVerseNumbers: true,

    // Elements visibility & free positioning offsets (in 1920x1080 px)
    showLogo: true,
    showChurchName: true,
    logoX: 48,
    logoY: 40,
    logoSize: isFullScreen ? 56 : 96,
    textOffsetX: 0,
    textOffsetY: 0,
    refOffsetX: 0,
    refOffsetY: 0,

    // Transitions
    entrance: isFullScreen ? "fade" : "slide-up",
    contentTransition: "fade",
    transitionDuration: isFullScreen ? 400 : 250,
    transitionEasing: "ease-out",
  };
}

export const DEFAULT_THEMES = [
  {
    version: 1,
    id: "default-scripture",
    name: "Classic Sanctuary (Scripture)",
    slot: "scripture",
    lowerThird: createBaseLayout(false),
    fullScreen: createBaseLayout(true),
  },
  {
    version: 1,
    id: "default-songs",
    name: "Worship Lyrics (Songs)",
    slot: "songs",
    lowerThird: {
      ...createBaseLayout(false),
      align: "center",
      fontSize: 54,
      bgType: "gradient",
      gradientStops: ["#0E162B", "#1C2952"],
    },
    fullScreen: {
      ...createBaseLayout(true),
      fontSize: 88,
      bgType: "animated-gradient",
      gradientStops: ["#0B1020", "#1E163B", "#0E223D"],
    },
  },
  {
    version: 1,
    id: "default-text",
    name: "Announcements (Text)",
    slot: "text",
    lowerThird: {
      ...createBaseLayout(false),
      accentBarColor: "#5B8CFF",
      refColor: "#5B8CFF",
    },
    fullScreen: {
      ...createBaseLayout(true),
      bgType: "solid",
      bgColor: "#12264A",
    },
  },
];

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};
const safeHex = (v, fallback) => (typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim() : fallback);

export function sanitizeLayout(raw, isFullScreen = false) {
  const base = createBaseLayout(isFullScreen);
  if (!raw || typeof raw !== "object") return base;
  const stops = Array.isArray(raw.gradientStops)
    ? raw.gradientStops.slice(0, 5).map((c) => safeHex(c, "#0B1020"))
    : base.gradientStops;
  return {
    ...base,
    x: clamp(raw.x, 0, 1920, base.x),
    y: clamp(raw.y, 0, 1080, base.y),
    width: clamp(raw.width, 400, 1920, base.width),
    height: clamp(raw.height, 100, 1080, base.height),
    bottom: clamp(raw.bottom, 0, 600, base.bottom),
    hpos: ["left", "center", "right", "custom"].includes(raw.hpos) ? raw.hpos : base.hpos,
    radius: clamp(raw.radius, 0, 80, base.radius),
    paddingX: clamp(raw.paddingX, 0, 300, base.paddingX),
    paddingY: clamp(raw.paddingY, 0, 300, base.paddingY),

    bgType: BG_TYPES.some((t) => t.value === raw.bgType) ? raw.bgType : base.bgType,
    bgColor: safeHex(raw.bgColor, base.bgColor),
    bgOpacity: clamp(raw.bgOpacity, 0, 100, base.bgOpacity),
    gradientStyle: raw.gradientStyle === "radial" ? "radial" : "linear",
    gradientAngle: clamp(raw.gradientAngle, 0, 360, base.gradientAngle),
    gradientStops: stops.length >= 2 ? stops : base.gradientStops,
    gradientSpeed: clamp(raw.gradientSpeed, 4, 60, base.gradientSpeed),
    bgImageAssetId: typeof raw.bgImageAssetId === "string" ? raw.bgImageAssetId.slice(0, 80) : "",
    bgImageDataUrl: typeof raw.bgImageDataUrl === "string" && raw.bgImageDataUrl.startsWith("data:image/") ? raw.bgImageDataUrl : "",
    bgFit: FIT_MODES.some((f) => f.value === raw.bgFit) ? raw.bgFit : base.bgFit,
    backdropBlur: clamp(raw.backdropBlur, 0, 40, base.backdropBlur),
    borderWidth: clamp(raw.borderWidth, 0, 12, base.borderWidth),
    borderColor: safeHex(raw.borderColor, base.borderColor),
    accentBarColor: safeHex(raw.accentBarColor, base.accentBarColor),
    accentBarHeight: clamp(raw.accentBarHeight, 0, 16, base.accentBarHeight),
    boxShadow: raw.boxShadow !== undefined ? !!raw.boxShadow : base.boxShadow,

    fontFamily: typeof raw.fontFamily === "string" ? raw.fontFamily.slice(0, 120) : base.fontFamily,
    fontSize: clamp(raw.fontSize, 20, 140, base.fontSize),
    minFontSize: clamp(raw.minFontSize, 16, 80, base.minFontSize),
    weight: clamp(raw.weight, 400, 900, base.weight),
    lineHeight: clamp(raw.lineHeight, 0.9, 2.0, base.lineHeight),
    letterSpacing: clamp(raw.letterSpacing, -4, 16, base.letterSpacing),
    align: ["left", "center", "right"].includes(raw.align) ? raw.align : base.align,
    uppercase: !!raw.uppercase,
    autoFit: raw.autoFit !== undefined ? !!raw.autoFit : base.autoFit,
    textColor: safeHex(raw.textColor, base.textColor),
    refColor: safeHex(raw.refColor, base.refColor),
    versionColor: safeHex(raw.versionColor, base.versionColor),
    labelColor: safeHex(raw.labelColor, base.labelColor),

    textShadow: raw.textShadow !== undefined ? !!raw.textShadow : base.textShadow,
    textShadowBlur: clamp(raw.textShadowBlur, 0, 40, base.textShadowBlur),
    textShadowOffsetY: clamp(raw.textShadowOffsetY, -20, 20, base.textShadowOffsetY),
    textShadowColor: safeHex(raw.textShadowColor, base.textShadowColor),
    textOutlineWidth: clamp(raw.textOutlineWidth, 0, 6, base.textOutlineWidth),
    textOutlineColor: safeHex(raw.textOutlineColor, base.textOutlineColor),
    textGlow: !!raw.textGlow,
    textGlowColor: safeHex(raw.textGlowColor, base.textGlowColor),
    textHighlightBg: raw.textHighlightBg ? safeHex(raw.textHighlightBg, "") : "",

    refPosition: REF_POSITIONS.some((p) => p.value === raw.refPosition) ? raw.refPosition : base.refPosition,
    refSeparator: [" · ", " — ", " | ", " "].includes(raw.refSeparator) ? raw.refSeparator : base.refSeparator,
    showVersion: raw.showVersion !== undefined ? !!raw.showVersion : base.showVersion,
    showVerseNumbers: raw.showVerseNumbers !== undefined ? !!raw.showVerseNumbers : base.showVerseNumbers,

    showLogo: raw.showLogo !== undefined ? !!raw.showLogo : base.showLogo,
    showChurchName: raw.showChurchName !== undefined ? !!raw.showChurchName : base.showChurchName,
    logoX: clamp(raw.logoX, 0, 1800, base.logoX),
    logoY: clamp(raw.logoY, 0, 980, base.logoY),
    logoSize: clamp(raw.logoSize, 24, 240, base.logoSize),
    textOffsetX: clamp(raw.textOffsetX, -400, 400, base.textOffsetX),
    textOffsetY: clamp(raw.textOffsetY, -300, 300, base.textOffsetY),
    refOffsetX: clamp(raw.refOffsetX, -400, 400, base.refOffsetX),
    refOffsetY: clamp(raw.refOffsetY, -200, 200, base.refOffsetY),

    entrance: TRANSITION_TYPES.some((t) => t.value === raw.entrance) ? raw.entrance : base.entrance,
    contentTransition: TRANSITION_TYPES.some((t) => t.value === raw.contentTransition) ? raw.contentTransition : base.contentTransition,
    transitionDuration: clamp(raw.transitionDuration, 50, 1200, base.transitionDuration),
    transitionEasing: EASING_TYPES.some((e) => e.value === raw.transitionEasing) ? raw.transitionEasing : base.transitionEasing,
  };
}

export function validateTheme(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Theme must be a JSON object.");
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 64) : "theme-" + Date.now();
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 80) : "Untitled Theme";
  const slot = ["scripture", "songs", "text"].includes(raw.slot) ? raw.slot : "scripture";
  return {
    version: 1,
    id,
    name,
    slot,
    lowerThird: sanitizeLayout(raw.lowerThird, false),
    fullScreen: sanitizeLayout(raw.fullScreen, true),
  };
}

export function generateTemplatePng(width, height, label = "Selah Live Template") {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // Dark slate base
  ctx.fillStyle = "#0B1020";
  ctx.fillRect(0, 0, width, height);

  // Subtle 40px grid
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }

  // Title-safe margin box (5% inset)
  const padX = Math.round(width * 0.05);
  const padY = Math.round(height * 0.1);
  ctx.strokeStyle = "#E8B84A";
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(padX, padY, width - padX * 2, height - padY * 2);

  // Center crosshair
  ctx.strokeStyle = "rgba(91,140,255,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height);
  ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2);
  ctx.stroke();

  // Dimensions label
  ctx.setLineDash([]);
  ctx.fillStyle = "#F4F6FB";
  ctx.font = `bold ${Math.max(18, Math.round(Math.min(width, height) * 0.12))}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${label} — ${width} × ${height} px`, width / 2, height / 2 - 14);
  ctx.fillStyle = "#E8B84A";
  ctx.font = `600 ${Math.max(14, Math.round(Math.min(width, height) * 0.07))}px Inter, sans-serif`;
  ctx.fillText("Keep text & logos inside the dashed title-safe area · Export as PNG/JPEG/WebP under 1 MB", width / 2, height / 2 + 24);

  return canvas.toDataURL("image/png");
}
