// Version 2 Element-Based Theme Schema, Zod Validation, V1.1 Migration, Animations, and 24 Built-in Templates (V1.2).
import { z } from "zod";

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
  { value: "grow-center", label: "Grow from centre" },
  { value: "wipe-reveal", label: "Wipe reveal" },
  { value: "zoom", label: "Zoom" },
  { value: "curtain", label: "Curtain" },
  { value: "none", label: "None" },
];

export const TEXT_ANIMATIONS = [
  { value: "fade", label: "Fade" },
  { value: "slide-up", label: "Slide up" },
  { value: "slide-down", label: "Slide down" },
  { value: "slide-left", label: "Slide left" },
  { value: "slide-right", label: "Slide right" },
  { value: "zoom", label: "Zoom / scale" },
  { value: "blur-in", label: "Blur-in" },
  { value: "typewriter", label: "Typewriter" },
  { value: "word-by-word", label: "Word-by-word reveal" },
  { value: "line-by-line", label: "Line-by-line reveal" },
  { value: "letter-rise", label: "Letter rise" },
  { value: "none", label: "None" },
];

export const LOGO_ANIMATIONS = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade-in" },
  { value: "pop", label: "Pop (soft bounce)" },
  { value: "slide-in", label: "Slide-in" },
  { value: "shine-sweep", label: "Shine sweep" },
  { value: "float", label: "Gentle float" },
  { value: "pulse", label: "Slow pulse" },
  { value: "draw-on", label: "Draw-on" },
];

export const BG_MOTIONS = [
  { value: "none", label: "Static (None)" },
  { value: "gradient-drift", label: "Animated gradient drift" },
  { value: "light-rays", label: "Soft light rays" },
  { value: "particles", label: "Floating particles / bokeh" },
  { value: "waves", label: "Slow waves" },
  { value: "shimmer", label: "Shimmer" },
  { value: "ken-burns", label: "Slow zoom / pan (Ken Burns)" },
  { value: "grain", label: "Subtle film grain" },
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
  { value: "below", label: "Below the verse (default)" },
  { value: "above", label: "Above the verse" },
  { value: "inline", label: "Inline after the verse" },
];

export const REF_FORMATS = [
  { value: "full", label: "John 3:16" },
  { value: "withVersion", label: "John 3:16 (KJV)" },
  { value: "short", label: "Jn 3:16" },
  { value: "upper", label: "JOHN 3:16" },
];

export const REF_BOX_STYLES = [
  { value: "none", label: "None" },
  { value: "pill", label: "Pill badge" },
  { value: "rect", label: "Rectangle box" },
  { value: "underline", label: "Underline only" },
];

export const DIVIDER_STYLES = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "double", label: "Double" },
  { value: "gradient", label: "Gradient fade" },
];

export const WATERMARK_POSITIONS = [
  "top-left", "top-center", "top-right",
  "middle-left", "center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
];

export const ELEMENT_KEYS = [
  { key: "background", label: "Background", group: "Canvas" },
  { key: "body", label: "Verse / Lyric / Body", group: "Text" },
  { key: "reference", label: "Reference (John 3:16)", group: "Text" },
  { key: "version", label: "Version label (KJV)", group: "Text" },
  { key: "verseNumbers", label: "Verse numbers", group: "Text" },
  { key: "songTitle", label: "Song title", group: "Text" },
  { key: "author", label: "Author / CCLI", group: "Text" },
  { key: "sectionLabel", label: "Section label (Chorus)", group: "Text" },
  { key: "divider", label: "Divider line", group: "Shapes" },
  { key: "churchName", label: "Church name", group: "Branding" },
  { key: "logo", label: "Church logo", group: "Branding" },
  { key: "watermark", label: "Watermark", group: "Branding" },
  { key: "customText", label: "Custom text", group: "Text" },
];

export const TEXT_ELEMENT_KEYS = [
  "body", "reference", "version", "verseNumbers",
  "songTitle", "author", "sectionLabel", "churchName", "customText",
];

export const DEFAULT_BRAND_SWATCHES = ["#0B1020", "#12264A", "#2B1740", "#143A2E", "#3A1A1A", "#1A1A1A", "#E8B84A", "#FFFFFF"];

export function createTextElement(overrides = {}) {
  return {
    visible: true,
    fontFamily: '"Inter", system-ui, sans-serif',
    fontSize: 52,
    minFontSize: 24,
    maxFontSize: 120,
    autoFit: true,
    weight: 800,
    italic: false,
    underline: false,
    textTransform: "none", // none | uppercase | capitalize
    letterSpacing: 0,
    lineHeight: 1.2,
    align: "left",         // left | center | right
    valign: "middle",      // top | middle | bottom
    color: "#FFFFFF",
    opacity: 100,
    shadow: { enabled: true, x: 0, y: 2, blur: 12, color: "#000000" },
    outline: { width: 0, color: "#000000" },
    glow: { enabled: false, color: "#E8B84A", blur: 18 },
    highlight: { color: "", padding: 6, radius: 6 },
    x: 0,
    y: 0,
    width: 0, // 0 = auto
    height: 0,
    padding: 0,
    maxLines: 0, // 0 = unlimited
    overflow: "shrink", // shrink | clip | split
    animIn: { type: "fade", duration: 300, delay: 0, easing: "ease-out", stagger: 45 },
    animOut: { type: "fade", duration: 220, delay: 0, easing: "ease-in-out", stagger: 25 },
    text: "", // used for customText
    ...overrides,
  };
}

export function createDividerElement(overrides = {}) {
  return {
    visible: false,
    style: "solid",        // solid | dashed | dotted | double | gradient
    thickness: 2,
    color: "#E8B84A",
    opacity: 85,
    lengthMode: "percent", // full | percent | px
    lengthValue: 35,
    align: "left",         // left | center | right
    marginTop: 10,
    marginBottom: 10,
    ...overrides,
  };
}

export function createLogoElement(isFullScreen = false, overrides = {}) {
  return {
    visible: true,
    size: isFullScreen ? 56 : 96,
    position: isFullScreen ? "top-left" : "left", // left | right | top-left | top-right | bottom-left | bottom-right | top | bottom
    mask: "rounded",       // none | circle | rounded
    padding: 0,
    opacity: 100,
    x: 48,
    y: 40,
    anim: { type: "fade", duration: 400, delay: 0 },
    ...overrides,
  };
}

export function createWatermarkElement(overrides = {}) {
  return {
    visible: false,
    position: "bottom-right", // 9-point
    size: 48,
    opacity: 18,
    blend: "normal", // normal | multiply
    anim: { type: "fade", duration: 400, delay: 0 },
    ...overrides,
  };
}

export function createBaseLayout(isFullScreen = false) {
  const align = isFullScreen ? "center" : "left";
  return {
    // Container geometry (1920x1080 stage)
    x: isFullScreen ? 0 : 160,
    y: isFullScreen ? 0 : 780,
    width: isFullScreen ? 1920 : 1600,
    height: isFullScreen ? 1080 : 220,
    bottom: 80,
    hpos: "center",
    radius: isFullScreen ? 0 : 16,
    paddingX: isFullScreen ? 180 : 40,
    paddingY: isFullScreen ? 140 : 28,
    layoutFlow: "auto-fill", // auto-fill (reallocate space) | keep-space | free-position

    // Background & motion
    bgType: isFullScreen ? "animated-gradient" : "solid",
    bgColor: "#0B1020",
    bgOpacity: isFullScreen ? 100 : 92,
    gradientStyle: "linear",
    gradientAngle: 135,
    gradientStops: ["#0B1020", "#17254A", "#0B1020"],
    gradientSpeed: 20,
    bgImageAssetId: "",
    bgImageDataUrl: "",
    bgFit: "cover",
    backdropBlur: 0,
    bgMotion: {
      type: isFullScreen ? "gradient-drift" : "none",
      speed: 50,      // 10-100
      intensity: 45,  // 10-100
      color: "#E8B84A",
    },
    borderWidth: isFullScreen ? 0 : 1,
    borderColor: "#2A3558",
    accentBarColor: "#E8B84A",
    accentBarHeight: isFullScreen ? 0 : 4,
    boxShadow: !isFullScreen,

    // Reference line options (V1.2 §2.3)
    showReference: true,
    showVersion: true,
    showVerseNumbers: true,
    refPosition: "below",    // below | above | inline
    refSeparator: " · ",
    refFormat: "full",       // full | withVersion | short | upper
    refBox: {
      style: "none",         // none | pill | rect | underline
      borderColor: "#E8B84A",
      borderWidth: 1.5,
      paddingX: 12,
      paddingY: 4,
      bgColor: "",
    },

    // Legacy v1.1 convenience aliases (kept in sync for backwards compatibility)
    fontFamily: '"Inter", system-ui, sans-serif',
    fontSize: isFullScreen ? 84 : 52,
    minFontSize: isFullScreen ? 36 : 26,
    weight: 800,
    lineHeight: 1.18,
    letterSpacing: 0,
    align,
    uppercase: false,
    autoFit: true,
    textColor: "#FFFFFF",
    refColor: "#E8B84A",
    versionColor: "#E8B84A",
    labelColor: "#E8B84A",
    textShadow: true,
    textShadowBlur: 12,
    textShadowOffsetY: 2,
    textShadowColor: "#000000",
    textOutlineWidth: 0,
    textOutlineColor: "#000000",
    textGlow: false,
    textGlowColor: "#E8B84A",
    textHighlightBg: "",
    showLogo: true,
    showChurchName: true,
    logoX: 48,
    logoY: 40,
    logoSize: isFullScreen ? 56 : 96,
    textOffsetX: 0,
    textOffsetY: 0,
    refOffsetX: 0,
    refOffsetY: 0,

    // Container transitions (V1.2 §4.4)
    entrance: isFullScreen ? "fade" : "slide-up",
    exit: isFullScreen ? "fade" : "slide-up",
    contentTransition: "fade",
    transitionDuration: isFullScreen ? 400 : 250,
    transitionEasing: "ease-out",

    // V2 Element Model (V1.2 §2.1)
    elements: {
      body: createTextElement({
        fontSize: isFullScreen ? 84 : 52,
        minFontSize: isFullScreen ? 36 : 26,
        maxFontSize: isFullScreen ? 120 : 80,
        weight: 800,
        lineHeight: 1.18,
        align,
        color: "#FFFFFF",
        animIn: { type: "fade", duration: 280, delay: 0, easing: "ease-out", stagger: 40 },
      }),
      reference: createTextElement({
        fontSize: isFullScreen ? 34 : 26,
        minFontSize: 16,
        maxFontSize: 64,
        weight: 800,
        letterSpacing: 0.4,
        align,
        color: "#E8B84A",
        animIn: { type: "fade", duration: 280, delay: 80, easing: "ease-out", stagger: 30 },
      }),
      version: createTextElement({
        fontSize: isFullScreen ? 26 : 21,
        minFontSize: 14,
        maxFontSize: 48,
        weight: 700,
        textTransform: "uppercase",
        letterSpacing: 1.2,
        align,
        color: "#E8B84A",
        opacity: 85,
      }),
      verseNumbers: createTextElement({
        visible: true,
        fontSize: isFullScreen ? 44 : 28,
        weight: 700,
        color: "#E8B84A",
        opacity: 85,
      }),
      songTitle: createTextElement({
        fontSize: isFullScreen ? 32 : 24,
        weight: 800,
        align,
        color: "#E8B84A",
      }),
      author: createTextElement({
        visible: true,
        fontSize: isFullScreen ? 22 : 18,
        weight: 500,
        italic: true,
        align,
        color: "#9AA6C4",
        opacity: 85,
      }),
      sectionLabel: createTextElement({
        visible: true,
        fontSize: isFullScreen ? 22 : 17,
        weight: 700,
        textTransform: "uppercase",
        letterSpacing: 1.6,
        align,
        color: "#E8B84A",
      }),
      churchName: createTextElement({
        visible: true,
        fontSize: isFullScreen ? 26 : 18,
        weight: 700,
        letterSpacing: 0.6,
        align: "left",
        color: "#D8E0F2",
        opacity: 88,
      }),
      customText: createTextElement({
        visible: false,
        text: "",
        fontSize: isFullScreen ? 28 : 20,
        weight: 600,
        align,
        color: "#E8B84A",
      }),
      divider: createDividerElement({
        visible: false,
        align,
      }),
      logo: createLogoElement(isFullScreen),
      watermark: createWatermarkElement(),
    },
  };
}

// Helper to build a themed layout cleanly
function makeLayout(isFs, patch = {}, elPatches = {}) {
  const base = createBaseLayout(isFs);
  const merged = {
    ...base,
    ...patch,
    bgMotion: { ...base.bgMotion, ...(patch.bgMotion || {}) },
    refBox: { ...base.refBox, ...(patch.refBox || {}) },
    elements: { ...base.elements },
  };
  for (const [k, v] of Object.entries(elPatches)) {
    if (merged.elements[k]) {
      merged.elements[k] = {
        ...merged.elements[k],
        ...v,
        ...(v.shadow ? { shadow: { ...merged.elements[k].shadow, ...v.shadow } } : {}),
        ...(v.outline ? { outline: { ...merged.elements[k].outline, ...v.outline } } : {}),
        ...(v.glow ? { glow: { ...merged.elements[k].glow, ...v.glow } } : {}),
        ...(v.highlight ? { highlight: { ...merged.elements[k].highlight, ...v.highlight } } : {}),
        ...(v.animIn ? { animIn: { ...merged.elements[k].animIn, ...v.animIn } } : {}),
        ...(v.animOut ? { animOut: { ...merged.elements[k].animOut, ...v.animOut } } : {}),
        ...(v.anim ? { anim: { ...merged.elements[k].anim, ...v.anim } } : {}),
      };
    }
  }
  // Keep top-level aliases in sync with body/ref elements
  merged.fontFamily = merged.elements.body.fontFamily;
  merged.fontSize = merged.elements.body.fontSize;
  merged.textColor = merged.elements.body.color;
  merged.refColor = merged.elements.reference.color;
  merged.align = merged.elements.body.align;
  merged.showLogo = merged.elements.logo.visible;
  merged.showChurchName = merged.elements.churchName.visible;
  return merged;
}

// ============================================================================
// 24 BUILT-IN READ-ONLY TEMPLATES (3 existing v1.1 + 21 new v1.2)
// ============================================================================
export const DEFAULT_THEMES = [
  // --- EXISTING V1.1 TEMPLATES (kept visually unchanged) ---
  {
    version: 2,
    builtIn: true,
    id: "default-scripture",
    name: "Classic Sanctuary",
    slot: "scripture",
    styleTag: "Classic",
    description: "Warm sanctuary gold accent on deep navy.",
    lowerThird: makeLayout(false),
    fullScreen: makeLayout(true),
  },
  {
    version: 2,
    builtIn: true,
    id: "default-songs",
    name: "Worship Lyrics",
    slot: "songs",
    styleTag: "Worship",
    description: "Centered worship lyrics on rich midnight gradient.",
    lowerThird: makeLayout(false, {
      bgType: "gradient",
      gradientStops: ["#0E162B", "#1C2952"],
    }, {
      body: { align: "center", fontSize: 54 },
      reference: { align: "center" },
      songTitle: { align: "center" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "animated-gradient",
      gradientStops: ["#0B1020", "#1E163B", "#0E223D"],
      bgMotion: { type: "gradient-drift", speed: 45, intensity: 50, color: "#E8B84A" },
    }, {
      body: { fontSize: 88, align: "center" },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "default-text",
    name: "Announcements",
    slot: "text",
    styleTag: "Clean",
    description: "Clear broadcast blue accent for church notices.",
    lowerThird: makeLayout(false, {
      accentBarColor: "#5B8CFF",
    }, {
      reference: { color: "#5B8CFF" },
      version: { color: "#5B8CFF" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "solid",
      bgColor: "#12264A",
      bgMotion: { type: "none", speed: 40, intensity: 40, color: "#5B8CFF" },
    }, {
      reference: { color: "#8FB2FF" },
    }),
  },

  // --- 8 NEW SCRIPTURE TEMPLATES ---
  {
    version: 2,
    builtIn: true,
    id: "tpl-modern-minimal",
    name: "Modern Minimal",
    slot: "scripture",
    styleTag: "Minimal",
    description: "Crisp sans-serif with subtle hairline divider and word reveal.",
    lowerThird: makeLayout(false, {
      bgType: "solid", bgColor: "#11141C", bgOpacity: 94, radius: 12, accentBarHeight: 0, borderColor: "#252B3B",
      entrance: "slide-left", exit: "slide-left",
    }, {
      body: { fontFamily: '"Outfit", system-ui, sans-serif', fontSize: 48, weight: 600, animIn: { type: "word-by-word", duration: 260, delay: 0, easing: "ease-out", stagger: 35 } },
      reference: { fontFamily: '"Outfit", system-ui, sans-serif', color: "#A3B4D9", fontSize: 22, weight: 600, animIn: { type: "fade", duration: 260, delay: 120, easing: "ease-out", stagger: 20 } },
      divider: { visible: true, style: "solid", thickness: 1, color: "#3B4664", lengthMode: "percent", lengthValue: 25, align: "left" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "solid", bgColor: "#0D1017", bgMotion: { type: "grain", speed: 30, intensity: 25, color: "#FFFFFF" },
    }, {
      body: { fontFamily: '"Outfit", system-ui, sans-serif', fontSize: 76, weight: 600, animIn: { type: "word-by-word", duration: 300, delay: 0, easing: "ease-out", stagger: 40 } },
      reference: { fontFamily: '"Outfit", system-ui, sans-serif', color: "#A3B4D9", fontSize: 30 },
      divider: { visible: true, style: "solid", thickness: 1, color: "#3B4664", lengthMode: "percent", lengthValue: 18, align: "center" },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-royal-gold",
    name: "Royal Gold",
    slot: "scripture",
    styleTag: "Editorial",
    description: "Editorial serif typography with radiant gold rays and gradient divider.",
    lowerThird: makeLayout(false, {
      bgType: "gradient", gradientStops: ["#120E1D", "#231936"], borderColor: "#D4A43C", borderWidth: 1, accentBarColor: "#F2C96B", accentBarHeight: 5,
    }, {
      body: { fontFamily: '"Playfair Display", Georgia, serif', fontSize: 50, weight: 700, color: "#FFFDF7" },
      reference: { fontFamily: '"Montserrat", system-ui, sans-serif', color: "#F2C96B", fontSize: 23, textTransform: "uppercase", letterSpacing: 2 },
      divider: { visible: true, style: "gradient", thickness: 2, color: "#F2C96B", lengthMode: "percent", lengthValue: 40, align: "left" },
      logo: { anim: { type: "shine-sweep", duration: 900, delay: 100 } },
    }),
    fullScreen: makeLayout(true, {
      bgType: "animated-gradient", gradientStops: ["#0F0B1A", "#24193A", "#151126"],
      bgMotion: { type: "light-rays", speed: 35, intensity: 45, color: "#F2C96B" },
    }, {
      body: { fontFamily: '"Playfair Display", Georgia, serif', fontSize: 82, weight: 700, color: "#FFFDF7", animIn: { type: "slide-up", duration: 380, delay: 0, easing: "ease-out", stagger: 40 } },
      reference: { fontFamily: '"Montserrat", system-ui, sans-serif', color: "#F2C96B", fontSize: 30, textTransform: "uppercase", letterSpacing: 2.4 },
      divider: { visible: true, style: "gradient", thickness: 2, color: "#F2C96B", lengthMode: "percent", lengthValue: 28, align: "center" },
      logo: { anim: { type: "shine-sweep", duration: 1000, delay: 120 } },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-sunrise-glow",
    name: "Sunrise Glow",
    slot: "scripture",
    styleTag: "Warm",
    description: "Warm amber & rose dawn gradient with floating bokeh.",
    lowerThird: makeLayout(false, {
      bgType: "gradient", gradientAngle: 120, gradientStops: ["#2B1420", "#4A2218"], accentBarColor: "#F9A84D", borderColor: "#6B3829",
    }, {
      body: { fontFamily: '"Merriweather", Georgia, serif', fontSize: 48, weight: 700, color: "#FFF7ED" },
      reference: { color: "#FBBF6E", fontSize: 24 },
      divider: { visible: true, style: "gradient", thickness: 2, color: "#F9A84D", lengthMode: "percent", lengthValue: 35, align: "left" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "animated-gradient", gradientAngle: 135, gradientStops: ["#24101B", "#4B2219", "#69371E"],
      bgMotion: { type: "particles", speed: 40, intensity: 45, color: "#FBBF6E" },
    }, {
      body: { fontFamily: '"Merriweather", Georgia, serif', fontSize: 78, weight: 700, color: "#FFF7ED" },
      reference: { color: "#FCD396", fontSize: 32 },
      divider: { visible: true, style: "gradient", thickness: 2, color: "#F9A84D", lengthMode: "percent", lengthValue: 25, align: "center" },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-dark-cinema",
    name: "Dark Cinema",
    slot: "scripture",
    styleTag: "Cinema",
    description: "High-contrast letterbox dark look with condensed broadcast header.",
    lowerThird: makeLayout(false, {
      bgType: "solid", bgColor: "#06070B", bgOpacity: 96, radius: 4, accentBarColor: "#FFFFFF", accentBarHeight: 2, borderWidth: 0,
      entrance: "wipe-reveal", exit: "fade",
    }, {
      body: { fontFamily: '"Lato", system-ui, sans-serif', fontSize: 50, weight: 700, color: "#F5F7FA" },
      reference: { fontFamily: '"Oswald", Impact, sans-serif', color: "#E8B84A", fontSize: 26, textTransform: "uppercase", letterSpacing: 2 },
    }),
    fullScreen: makeLayout(true, {
      bgType: "solid", bgColor: "#050609", bgMotion: { type: "grain", speed: 40, intensity: 35, color: "#FFFFFF" },
      entrance: "curtain", exit: "fade",
    }, {
      body: { fontFamily: '"Lato", system-ui, sans-serif', fontSize: 80, weight: 700, animIn: { type: "blur-in", duration: 420, delay: 0, easing: "ease-out", stagger: 40 } },
      reference: { fontFamily: '"Oswald", Impact, sans-serif', color: "#E8B84A", fontSize: 34, textTransform: "uppercase", letterSpacing: 3 },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-parchment",
    name: "Parchment",
    slot: "scripture",
    styleTag: "Light",
    description: "Warm cream parchment paper with deep espresso ink.",
    lowerThird: makeLayout(false, {
      bgType: "gradient", gradientStops: ["#F5EEDC", "#EBE0C7"], bgOpacity: 97, borderColor: "#CBB893", accentBarColor: "#8B5E34",
    }, {
      body: { fontFamily: '"Merriweather", Georgia, serif', fontSize: 46, weight: 700, color: "#2A1F14", shadow: { enabled: false, x: 0, y: 0, blur: 0, color: "#000000" } },
      reference: { fontFamily: '"Playfair Display", Georgia, serif', color: "#8B5E34", fontSize: 25, weight: 700, shadow: { enabled: false, x: 0, y: 0, blur: 0, color: "#000000" } },
      version: { color: "#6E4D2D", shadow: { enabled: false, x: 0, y: 0, blur: 0, color: "#000000" } },
      churchName: { color: "#5C4733", shadow: { enabled: false, x: 0, y: 0, blur: 0, color: "#000000" } },
      divider: { visible: true, style: "double", thickness: 3, color: "#A47B4B", lengthMode: "percent", lengthValue: 30, align: "left" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "gradient", gradientStops: ["#F7F1E3", "#E9DEC4"], bgMotion: { type: "grain", speed: 20, intensity: 22, color: "#8B5E34" },
    }, {
      body: { fontFamily: '"Merriweather", Georgia, serif', fontSize: 74, weight: 700, color: "#2A1F14", shadow: { enabled: false, x: 0, y: 0, blur: 0, color: "#000000" } },
      reference: { fontFamily: '"Playfair Display", Georgia, serif', color: "#8B5E34", fontSize: 34, shadow: { enabled: false, x: 0, y: 0, blur: 0, color: "#000000" } },
      version: { color: "#6E4D2D", shadow: { enabled: false, x: 0, y: 0, blur: 0, color: "#000000" } },
      churchName: { color: "#5C4733", shadow: { enabled: false, x: 0, y: 0, blur: 0, color: "#000000" } },
      divider: { visible: true, style: "double", thickness: 3, color: "#A47B4B", lengthMode: "percent", lengthValue: 22, align: "center" },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-clean-light",
    name: "Clean Light",
    slot: "scripture",
    styleTag: "Light",
    description: "Bright daylight white card with slate ink and cobalt pill reference.",
    lowerThird: makeLayout(false, {
      bgType: "solid", bgColor: "#FFFFFF", bgOpacity: 96, borderColor: "#DCE3F0", accentBarColor: "#2563EB", radius: 18,
      refBox: { style: "pill", borderColor: "#2563EB", borderWidth: 1.5, paddingX: 14, paddingY: 4, bgColor: "#EFF6FF" },
    }, {
      body: { fontFamily: '"Inter", system-ui, sans-serif', fontSize: 48, weight: 700, color: "#0F172A", shadow: { enabled: false, x: 0, y: 0, blur: 0, color: "#000000" } },
      reference: { color: "#1D4ED8", fontSize: 22, weight: 700, shadow: { enabled: false, x: 0, y: 0, blur: 0, color: "#000000" } },
      version: { color: "#1D4ED8", shadow: { enabled: false, x: 0, y: 0, blur: 0, color: "#000000" } },
      churchName: { color: "#475569", shadow: { enabled: false, x: 0, y: 0, blur: 0, color: "#000000" } },
    }),
    fullScreen: makeLayout(true, {
      bgType: "gradient", gradientStops: ["#F8FAFC", "#E2E8F0"], bgMotion: { type: "shimmer", speed: 30, intensity: 25, color: "#2563EB" },
      refBox: { style: "pill", borderColor: "#2563EB", borderWidth: 1.5, paddingX: 18, paddingY: 6, bgColor: "#EFF6FF" },
    }, {
      body: { fontFamily: '"Inter", system-ui, sans-serif', fontSize: 78, weight: 700, color: "#0F172A", shadow: { enabled: false, x: 0, y: 0, blur: 0, color: "#000000" } },
      reference: { color: "#1D4ED8", fontSize: 28, shadow: { enabled: false, x: 0, y: 0, blur: 0, color: "#000000" } },
      churchName: { color: "#475569", shadow: { enabled: false, x: 0, y: 0, blur: 0, color: "#000000" } },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-midnight-blue",
    name: "Midnight Blue",
    slot: "scripture",
    styleTag: "Broadcast",
    description: "Deep sapphire broadcast slate with electric sky highlights.",
    lowerThird: makeLayout(false, {
      bgType: "gradient", gradientAngle: 90, gradientStops: ["#07142C", "#0F2954"], accentBarColor: "#38BDF8", borderColor: "#1E427A",
    }, {
      body: { fontFamily: '"Poppins", system-ui, sans-serif', fontSize: 50, weight: 700, color: "#F8FAFC" },
      reference: { color: "#38BDF8", fontSize: 24, weight: 700 },
      divider: { visible: true, style: "solid", thickness: 2, color: "#38BDF8", lengthMode: "percent", lengthValue: 30, align: "left" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "animated-gradient", gradientStops: ["#040C1E", "#0C244A", "#071733"],
      bgMotion: { type: "waves", speed: 40, intensity: 40, color: "#38BDF8" },
    }, {
      body: { fontFamily: '"Poppins", system-ui, sans-serif', fontSize: 80, weight: 700 },
      reference: { color: "#38BDF8", fontSize: 32 },
      divider: { visible: true, style: "gradient", thickness: 2, color: "#38BDF8", lengthMode: "percent", lengthValue: 24, align: "center" },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-stone-linen",
    name: "Stone & Linen",
    slot: "scripture",
    styleTag: "Warm",
    description: "Muted warm charcoal stone with soft sage-linen accents.",
    lowerThird: makeLayout(false, {
      bgType: "solid", bgColor: "#23211E", bgOpacity: 94, borderColor: "#47423B", accentBarColor: "#C9B99B", radius: 14,
    }, {
      body: { fontFamily: '"Lato", system-ui, sans-serif', fontSize: 49, weight: 700, color: "#F5F2EB" },
      reference: { fontFamily: '"Merriweather", Georgia, serif', color: "#D6C7AA", fontSize: 23, italic: true },
      divider: { visible: true, style: "dotted", thickness: 2, color: "#C9B99B", lengthMode: "percent", lengthValue: 35, align: "left" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "gradient", gradientStops: ["#1E1C19", "#2F2B26"], bgMotion: { type: "grain", speed: 25, intensity: 25, color: "#D6C7AA" },
    }, {
      body: { fontFamily: '"Lato", system-ui, sans-serif', fontSize: 78, weight: 700, color: "#F5F2EB" },
      reference: { fontFamily: '"Merriweather", Georgia, serif', color: "#D6C7AA", fontSize: 32, italic: true },
      divider: { visible: true, style: "dotted", thickness: 2, color: "#C9B99B", lengthMode: "percent", lengthValue: 20, align: "center" },
    }),
  },

  // --- 6 NEW SONGS TEMPLATES ---
  {
    version: 2,
    builtIn: true,
    id: "tpl-concert-glow",
    name: "Concert Glow",
    slot: "songs",
    styleTag: "Worship",
    description: "Bold stage-ready lyrics with violet-magenta glow and bokeh particles.",
    lowerThird: makeLayout(false, {
      bgType: "gradient", gradientStops: ["#140A24", "#2D1245"], accentBarColor: "#E879F9", borderColor: "#4A1D6E",
    }, {
      body: { fontFamily: '"Montserrat", system-ui, sans-serif', fontSize: 54, weight: 800, align: "center", glow: { enabled: true, color: "#C084FC", blur: 18 } },
      songTitle: { align: "center", color: "#F0ABFC" },
      sectionLabel: { align: "center", color: "#E879F9" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "animated-gradient", gradientStops: ["#0E071B", "#2A1044", "#151238"],
      bgMotion: { type: "particles", speed: 45, intensity: 55, color: "#E879F9" },
    }, {
      body: { fontFamily: '"Montserrat", system-ui, sans-serif', fontSize: 90, weight: 800, align: "center", glow: { enabled: true, color: "#C084FC", blur: 22 }, animIn: { type: "word-by-word", duration: 280, delay: 0, easing: "ease-out", stagger: 35 } },
      songTitle: { align: "center", color: "#F0ABFC" },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-soft-clouds",
    name: "Soft Clouds",
    slot: "songs",
    styleTag: "Atmospheric",
    description: "Airy twilight indigo with drifting atmospheric light.",
    lowerThird: makeLayout(false, {
      bgType: "gradient", gradientStops: ["#162238", "#273A5C"], bgOpacity: 90, accentBarColor: "#BAE6FD", radius: 22,
    }, {
      body: { fontFamily: '"Poppins", system-ui, sans-serif', fontSize: 52, weight: 600, align: "center", color: "#F0F9FF" },
      songTitle: { align: "center", color: "#BAE6FD" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "animated-gradient", gradientStops: ["#132038", "#2B446E", "#1A2E4D"],
      bgMotion: { type: "shimmer", speed: 30, intensity: 40, color: "#BAE6FD" },
    }, {
      body: { fontFamily: '"Poppins", system-ui, sans-serif', fontSize: 84, weight: 600, align: "center", animIn: { type: "line-by-line", duration: 360, delay: 0, easing: "ease-out", stagger: 80 } },
      songTitle: { align: "center", color: "#BAE6FD" },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-night-sky",
    name: "Night Sky",
    slot: "songs",
    styleTag: "Atmospheric",
    description: "Starlight bokeh over deep cosmos black-blue.",
    lowerThird: makeLayout(false, {
      bgType: "solid", bgColor: "#070B17", bgOpacity: 94, accentBarColor: "#93C5FD", borderColor: "#1D2A4A",
    }, {
      body: { fontFamily: '"Outfit", system-ui, sans-serif', fontSize: 52, weight: 700, align: "center" },
      songTitle: { align: "center", color: "#93C5FD" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "animated-gradient", gradientStops: ["#040712", "#0B1633", "#060B1A"],
      bgMotion: { type: "particles", speed: 25, intensity: 50, color: "#E0F2FE" },
    }, {
      body: { fontFamily: '"Outfit", system-ui, sans-serif', fontSize: 86, weight: 700, align: "center" },
      songTitle: { align: "center", color: "#93C5FD" },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-simple-lyrics",
    name: "Simple Lyrics",
    slot: "songs",
    styleTag: "Minimal",
    description: "Clean transparent lower-third lyrics with crisp dark outline for camera overlays.",
    lowerThird: makeLayout(false, {
      bgType: "none", bgOpacity: 0, borderWidth: 0, accentBarHeight: 0, boxShadow: false,
    }, {
      body: { fontFamily: '"Inter", system-ui, sans-serif', fontSize: 58, weight: 800, align: "center", outline: { width: 2, color: "#000000" }, shadow: { enabled: true, x: 0, y: 4, blur: 14, color: "#000000" } },
      songTitle: { visible: false, align: "center" },
      logo: { visible: false },
      churchName: { visible: false },
    }),
    fullScreen: makeLayout(true, {
      bgType: "solid", bgColor: "#0A0C12", bgMotion: { type: "none", speed: 30, intensity: 30, color: "#FFFFFF" },
    }, {
      body: { fontFamily: '"Inter", system-ui, sans-serif', fontSize: 88, weight: 800, align: "center" },
      songTitle: { align: "center", color: "#94A3B8" },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-ocean-waves",
    name: "Ocean Waves",
    slot: "songs",
    styleTag: "Atmospheric",
    description: "Deep teal & seafoam slow animated waves.",
    lowerThird: makeLayout(false, {
      bgType: "gradient", gradientStops: ["#08232E", "#0F3D4C"], accentBarColor: "#2DD4BF", borderColor: "#16596B",
    }, {
      body: { fontFamily: '"Lato", system-ui, sans-serif', fontSize: 52, weight: 700, align: "center", color: "#F0FDFA" },
      songTitle: { align: "center", color: "#5EEAD4" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "animated-gradient", gradientStops: ["#061B24", "#0D3A47", "#0A2B3B"],
      bgMotion: { type: "waves", speed: 35, intensity: 50, color: "#2DD4BF" },
    }, {
      body: { fontFamily: '"Lato", system-ui, sans-serif', fontSize: 84, weight: 700, align: "center", color: "#F0FDFA" },
      songTitle: { align: "center", color: "#5EEAD4" },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-warm-candle",
    name: "Warm Candle",
    slot: "songs",
    styleTag: "Warm",
    description: "Intimate acoustic candlelight amber glow.",
    lowerThird: makeLayout(false, {
      bgType: "gradient", gradientStops: ["#1F140B", "#382210"], accentBarColor: "#F59E0B", borderColor: "#5C3A1B",
    }, {
      body: { fontFamily: '"Merriweather", Georgia, serif', fontSize: 48, weight: 700, align: "center", color: "#FEF3C7" },
      songTitle: { align: "center", color: "#FBBF24" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "animated-gradient", gradientStops: ["#180F08", "#36200D", "#211409"],
      bgMotion: { type: "light-rays", speed: 25, intensity: 40, color: "#F59E0B" },
    }, {
      body: { fontFamily: '"Merriweather", Georgia, serif', fontSize: 80, weight: 700, align: "center", color: "#FEF3C7" },
      songTitle: { align: "center", color: "#FBBF24" },
    }),
  },

  // --- 7 NEW TEXT / ANNOUNCEMENT TEMPLATES ---
  {
    version: 2,
    builtIn: true,
    id: "tpl-offering",
    name: "Offering",
    slot: "text",
    styleTag: "Service",
    description: "Warm sanctuary gold card for tithes & offering moments.",
    placeholderTitle: "Tithes & Offering",
    placeholderBody: "Thank you for your generous giving.\nGive online or via our church app.",
    lowerThird: makeLayout(false, {
      bgType: "gradient", gradientStops: ["#171C2E", "#242B45"], accentBarColor: "#E8B84A", borderColor: "#E8B84A",
      refPosition: "above",
    }, {
      body: { fontFamily: '"Outfit", system-ui, sans-serif', fontSize: 46, weight: 600 },
      reference: { fontFamily: '"Montserrat", system-ui, sans-serif', fontSize: 26, weight: 800, color: "#E8B84A", textTransform: "uppercase", letterSpacing: 1.5 },
      divider: { visible: true, style: "gradient", thickness: 2, color: "#E8B84A", lengthMode: "percent", lengthValue: 30, align: "left" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "animated-gradient", gradientStops: ["#0E1324", "#1F2640", "#13182B"],
      bgMotion: { type: "light-rays", speed: 30, intensity: 40, color: "#E8B84A" },
      refPosition: "above",
    }, {
      body: { fontFamily: '"Outfit", system-ui, sans-serif', fontSize: 68, weight: 600, align: "center" },
      reference: { fontFamily: '"Montserrat", system-ui, sans-serif', fontSize: 42, weight: 800, color: "#E8B84A", textTransform: "uppercase", letterSpacing: 2, align: "center" },
      divider: { visible: true, style: "gradient", thickness: 2, color: "#E8B84A", lengthMode: "percent", lengthValue: 24, align: "center" },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-welcome",
    name: "Welcome",
    slot: "text",
    styleTag: "Service",
    description: "Joyful welcoming banner for guests and livestream viewers.",
    placeholderTitle: "Welcome Home",
    placeholderBody: "We are so glad you joined us today!\nSay hello in the chat and let us pray with you.",
    lowerThird: makeLayout(false, {
      bgType: "gradient", gradientAngle: 120, gradientStops: ["#122A3A", "#1C445C"], accentBarColor: "#38BDF8",
      refPosition: "above", entrance: "grow-center",
    }, {
      body: { fontFamily: '"Poppins", system-ui, sans-serif', fontSize: 46, weight: 600, align: "center" },
      reference: { fontFamily: '"Poppins", system-ui, sans-serif', fontSize: 28, weight: 800, color: "#7DD3FC", align: "center" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "animated-gradient", gradientStops: ["#0E2433", "#1C4661", "#123247"],
      bgMotion: { type: "particles", speed: 35, intensity: 45, color: "#7DD3FC" },
      refPosition: "above",
    }, {
      body: { fontFamily: '"Poppins", system-ui, sans-serif', fontSize: 70, weight: 600, align: "center" },
      reference: { fontFamily: '"Poppins", system-ui, sans-serif', fontSize: 48, weight: 800, color: "#7DD3FC", align: "center", animIn: { type: "letter-rise", duration: 360, delay: 0, easing: "ease-out", stagger: 25 } },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-sermon-title",
    name: "Sermon Title",
    slot: "text",
    styleTag: "Editorial",
    description: "Bold sermon series title and speaker subtitle.",
    placeholderTitle: "Walking in Grace",
    placeholderBody: "Part 1 · Pastor John Doe",
    lowerThird: makeLayout(false, {
      bgType: "solid", bgColor: "#0D111D", bgOpacity: 95, accentBarColor: "#E8B84A", accentBarHeight: 6,
      refPosition: "above",
    }, {
      body: { fontFamily: '"Inter", system-ui, sans-serif', fontSize: 42, weight: 500, color: "#CBD5E1" },
      reference: { fontFamily: '"Playfair Display", Georgia, serif', fontSize: 38, weight: 800, color: "#FFFFFF" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "animated-gradient", gradientStops: ["#080B14", "#17203A", "#0D1221"],
      bgMotion: { type: "shimmer", speed: 28, intensity: 35, color: "#E8B84A" },
      refPosition: "above",
    }, {
      body: { fontFamily: '"Inter", system-ui, sans-serif', fontSize: 46, weight: 500, color: "#CBD5E1", align: "center" },
      reference: { fontFamily: '"Playfair Display", Georgia, serif', fontSize: 92, weight: 800, color: "#FFFFFF", align: "center" },
      divider: { visible: true, style: "solid", thickness: 2, color: "#E8B84A", lengthMode: "percent", lengthValue: 16, align: "center" },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-prayer-moment",
    name: "Prayer Moment",
    slot: "text",
    styleTag: "Atmospheric",
    description: "Calm, reverent slate for corporate prayer and reflection.",
    placeholderTitle: "Moment of Prayer",
    placeholderBody: "Let us bow our heads and lift our hearts together.",
    lowerThird: makeLayout(false, {
      bgType: "gradient", gradientStops: ["#151326", "#231E3D"], accentBarColor: "#C4B5FD",
      refPosition: "above",
    }, {
      body: { fontFamily: '"Merriweather", Georgia, serif', fontSize: 46, weight: 400, italic: true, align: "center", color: "#F5F3FF" },
      reference: { fontFamily: '"Montserrat", system-ui, sans-serif', fontSize: 22, weight: 700, color: "#C4B5FD", textTransform: "uppercase", letterSpacing: 2, align: "center" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "animated-gradient", gradientStops: ["#100E1F", "#241E40", "#141226"],
      bgMotion: { type: "waves", speed: 22, intensity: 35, color: "#C4B5FD" },
      refPosition: "above",
    }, {
      body: { fontFamily: '"Merriweather", Georgia, serif', fontSize: 72, weight: 400, italic: true, align: "center", color: "#F5F3FF" },
      reference: { fontFamily: '"Montserrat", system-ui, sans-serif', fontSize: 30, weight: 700, color: "#C4B5FD", textTransform: "uppercase", letterSpacing: 2.5, align: "center" },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-announcements-board",
    name: "Announcements Board",
    slot: "text",
    styleTag: "Clean",
    description: "Structured notice board for weekly church events.",
    placeholderTitle: "This Week at Church",
    placeholderBody: "• Midweek Bible Study — Wednesday 7:00 PM\n• Youth Night — Friday 6:30 PM",
    lowerThird: makeLayout(false, {
      bgType: "solid", bgColor: "#0F172A", bgOpacity: 95, accentBarColor: "#38BDF8",
      refPosition: "above",
      refBox: { style: "pill", borderColor: "#38BDF8", borderWidth: 1, paddingX: 12, paddingY: 3, bgColor: "#0C2D48" },
    }, {
      body: { fontFamily: '"Inter", system-ui, sans-serif', fontSize: 44, weight: 600 },
      reference: { fontSize: 22, weight: 700, color: "#7DD3FC" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "gradient", gradientStops: ["#0B1222", "#162442"],
      refPosition: "above",
      refBox: { style: "pill", borderColor: "#38BDF8", borderWidth: 1.5, paddingX: 18, paddingY: 6, bgColor: "#0C2D48" },
    }, {
      body: { fontFamily: '"Inter", system-ui, sans-serif', fontSize: 64, weight: 600, align: "left" },
      reference: { fontSize: 32, weight: 700, color: "#7DD3FC", align: "left" },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-thank-you",
    name: "Thank You",
    slot: "text",
    styleTag: "Warm",
    description: "Graceful closing screen for the end of service.",
    placeholderTitle: "Thank You for Worshipping With Us",
    placeholderBody: "Have a blessed week! See you next Sunday.",
    lowerThird: makeLayout(false, {
      bgType: "gradient", gradientStops: ["#142420", "#1E3A34"], accentBarColor: "#34D399",
      refPosition: "above",
    }, {
      body: { fontFamily: '"Outfit", system-ui, sans-serif', fontSize: 46, weight: 600, align: "center" },
      reference: { fontSize: 26, weight: 800, color: "#6EE7B7", align: "center" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "animated-gradient", gradientStops: ["#0E1F1B", "#1C3B34", "#102621"],
      bgMotion: { type: "particles", speed: 30, intensity: 40, color: "#6EE7B7" },
      refPosition: "above",
    }, {
      body: { fontFamily: '"Outfit", system-ui, sans-serif', fontSize: 66, weight: 600, align: "center" },
      reference: { fontSize: 44, weight: 800, color: "#6EE7B7", align: "center" },
    }),
  },
  {
    version: 2,
    builtIn: true,
    id: "tpl-giving-details",
    name: "Giving Details",
    slot: "text",
    styleTag: "Service",
    description: "Title, body, and dedicated giving details line.",
    placeholderTitle: "Ways to Give",
    placeholderBody: "Bank Transfer · Selah Community Church\nAccount: 0123456789 · Sort Code: 00-00-00",
    lowerThird: makeLayout(false, {
      bgType: "gradient", gradientStops: ["#12192C", "#1D2A4A"], accentBarColor: "#E8B84A",
      refPosition: "above",
    }, {
      body: { fontFamily: '"Inter", system-ui, sans-serif', fontSize: 42, weight: 600 },
      reference: { fontSize: 26, weight: 800, color: "#E8B84A" },
      customText: { visible: true, text: "Online: yourchurch.org/give", fontSize: 22, color: "#93C5FD", weight: 600 },
      divider: { visible: true, style: "solid", thickness: 1, color: "#E8B84A", lengthMode: "percent", lengthValue: 35, align: "left" },
    }),
    fullScreen: makeLayout(true, {
      bgType: "animated-gradient", gradientStops: ["#0B1224", "#1B294A", "#0E162B"],
      bgMotion: { type: "shimmer", speed: 25, intensity: 35, color: "#E8B84A" },
      refPosition: "above",
    }, {
      body: { fontFamily: '"Inter", system-ui, sans-serif', fontSize: 62, weight: 600, align: "center" },
      reference: { fontSize: 44, weight: 800, color: "#E8B84A", align: "center" },
      customText: { visible: true, text: "Online: yourchurch.org/give", fontSize: 32, color: "#93C5FD", weight: 700, align: "center" },
      divider: { visible: true, style: "gradient", thickness: 2, color: "#E8B84A", lengthMode: "percent", lengthValue: 26, align: "center" },
    }),
  },
];

// ============================================================================
// ZOD VALIDATION & CLAMPING + AUTOMATIC V1.1 -> V2 MIGRATION (V1.2 §2.6)
// ============================================================================
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};
const safeHex = (v, fallback) => (typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim() : fallback);

const hexSchema = z.string().regex(HEX_RE).catch("#0B1020");

export const ThemeImportSchema = z.object({
  version: z.number().int().min(1).max(2).optional(),
  id: z.string().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(60),
  slot: z.enum(["scripture", "songs", "text"]).default("scripture"),
  description: z.string().max(240).optional(),
  lowerThird: z.record(z.any()).optional(),
  fullScreen: z.record(z.any()).optional(),
});

function sanitizeTextElement(raw, base) {
  if (!raw || typeof raw !== "object") return { ...base };
  const s = raw.shadow || {};
  const o = raw.outline || {};
  const g = raw.glow || {};
  const h = raw.highlight || {};
  const ai = raw.animIn || {};
  const ao = raw.animOut || {};
  return {
    visible: raw.visible !== undefined ? !!raw.visible : base.visible,
    fontFamily: typeof raw.fontFamily === "string" ? raw.fontFamily.slice(0, 120) : base.fontFamily,
    fontSize: clamp(raw.fontSize, 12, 160, base.fontSize),
    minFontSize: clamp(raw.minFontSize, 12, 96, base.minFontSize),
    maxFontSize: clamp(raw.maxFontSize, 16, 180, base.maxFontSize),
    autoFit: raw.autoFit !== undefined ? !!raw.autoFit : base.autoFit,
    weight: clamp(raw.weight, 300, 900, base.weight),
    italic: raw.italic !== undefined ? !!raw.italic : base.italic,
    underline: raw.underline !== undefined ? !!raw.underline : base.underline,
    textTransform: ["none", "uppercase", "capitalize"].includes(raw.textTransform) ? raw.textTransform : base.textTransform,
    letterSpacing: clamp(raw.letterSpacing, -4, 20, base.letterSpacing),
    lineHeight: clamp(raw.lineHeight, 0.85, 2.2, base.lineHeight),
    align: ["left", "center", "right"].includes(raw.align) ? raw.align : base.align,
    valign: ["top", "middle", "bottom"].includes(raw.valign) ? raw.valign : base.valign,
    color: safeHex(raw.color, base.color),
    opacity: clamp(raw.opacity, 0, 100, base.opacity),
    shadow: {
      enabled: s.enabled !== undefined ? !!s.enabled : base.shadow.enabled,
      x: clamp(s.x, -30, 30, base.shadow.x),
      y: clamp(s.y, -30, 30, base.shadow.y),
      blur: clamp(s.blur, 0, 50, base.shadow.blur),
      color: safeHex(s.color, base.shadow.color),
    },
    outline: {
      width: clamp(o.width, 0, 8, base.outline.width),
      color: safeHex(o.color, base.outline.color),
    },
    glow: {
      enabled: g.enabled !== undefined ? !!g.enabled : base.glow.enabled,
      color: safeHex(g.color, base.glow.color),
      blur: clamp(g.blur, 0, 60, base.glow.blur),
    },
    highlight: {
      color: h.color ? safeHex(h.color, "") : base.highlight.color,
      padding: clamp(h.padding, 0, 32, base.highlight.padding),
      radius: clamp(h.radius, 0, 32, base.highlight.radius),
    },
    x: clamp(raw.x, -960, 1920, base.x),
    y: clamp(raw.y, -540, 1080, base.y),
    width: clamp(raw.width, 0, 1920, base.width),
    height: clamp(raw.height, 0, 1080, base.height),
    padding: clamp(raw.padding, 0, 120, base.padding),
    maxLines: clamp(raw.maxLines, 0, 20, base.maxLines),
    overflow: ["shrink", "clip", "split"].includes(raw.overflow) ? raw.overflow : base.overflow,
    animIn: {
      type: TEXT_ANIMATIONS.some((a) => a.value === ai.type) ? ai.type : base.animIn.type,
      duration: clamp(ai.duration, 0, 3000, base.animIn.duration),
      delay: clamp(ai.delay, 0, 3000, base.animIn.delay),
      easing: EASING_TYPES.some((e) => e.value === ai.easing) ? ai.easing : base.animIn.easing,
      stagger: clamp(ai.stagger, 0, 300, base.animIn.stagger),
    },
    animOut: {
      type: TEXT_ANIMATIONS.some((a) => a.value === ao.type) ? ao.type : base.animOut.type,
      duration: clamp(ao.duration, 0, 2000, base.animOut.duration),
      delay: clamp(ao.delay, 0, 2000, base.animOut.delay),
      easing: EASING_TYPES.some((e) => e.value === ao.easing) ? ao.easing : base.animOut.easing,
      stagger: clamp(ao.stagger, 0, 200, base.animOut.stagger),
    },
    text: typeof raw.text === "string" ? raw.text.slice(0, 300) : base.text,
  };
}

export function sanitizeLayout(raw, isFullScreen = false) {
  const base = createBaseLayout(isFullScreen);
  if (!raw || typeof raw !== "object") return base;

  const stops = Array.isArray(raw.gradientStops)
    ? raw.gradientStops.slice(0, 5).map((c) => safeHex(c, "#0B1020"))
    : base.gradientStops;

  // Migrate v1.1 flat fields into v2 elements if `raw.elements` is absent
  const rawEl = raw.elements || {};
  const migratedBody = rawEl.body || {
    fontFamily: raw.fontFamily ?? base.elements.body.fontFamily,
    fontSize: raw.fontSize ?? base.elements.body.fontSize,
    minFontSize: raw.minFontSize ?? base.elements.body.minFontSize,
    autoFit: raw.autoFit ?? base.elements.body.autoFit,
    weight: raw.weight ?? base.elements.body.weight,
    lineHeight: raw.lineHeight ?? base.elements.body.lineHeight,
    letterSpacing: raw.letterSpacing ?? base.elements.body.letterSpacing,
    align: raw.align ?? base.elements.body.align,
    textTransform: raw.uppercase ? "uppercase" : "none",
    color: raw.textColor ?? base.elements.body.color,
    shadow: {
      enabled: raw.textShadow !== undefined ? !!raw.textShadow : base.elements.body.shadow.enabled,
      x: 0,
      y: raw.textShadowOffsetY ?? base.elements.body.shadow.y,
      blur: raw.textShadowBlur ?? base.elements.body.shadow.blur,
      color: raw.textShadowColor ?? base.elements.body.shadow.color,
    },
    outline: {
      width: raw.textOutlineWidth ?? 0,
      color: raw.textOutlineColor ?? "#000000",
    },
    glow: {
      enabled: !!raw.textGlow,
      color: raw.textGlowColor ?? "#E8B84A",
      blur: 18,
    },
    highlight: {
      color: raw.textHighlightBg ?? "",
      padding: 6,
      radius: 6,
    },
    x: raw.textOffsetX ?? 0,
    y: raw.textOffsetY ?? 0,
  };

  const migratedRef = rawEl.reference || {
    visible: raw.showReference !== undefined ? !!raw.showReference : true,
    fontFamily: raw.fontFamily ?? base.elements.reference.fontFamily,
    color: raw.refColor ?? base.elements.reference.color,
    align: raw.align ?? base.elements.reference.align,
    x: raw.refOffsetX ?? 0,
    y: raw.refOffsetY ?? 0,
  };

  const migratedVer = rawEl.version || {
    visible: raw.showVersion !== undefined ? !!raw.showVersion : true,
    fontFamily: raw.fontFamily ?? base.elements.version.fontFamily,
    color: raw.versionColor ?? raw.refColor ?? base.elements.version.color,
    align: raw.align ?? base.elements.version.align,
  };

  const migratedLogo = rawEl.logo || {
    visible: raw.showLogo !== undefined ? !!raw.showLogo : base.elements.logo.visible,
    size: raw.logoSize ?? base.elements.logo.size,
    x: raw.logoX ?? base.elements.logo.x,
    y: raw.logoY ?? base.elements.logo.y,
  };

  const migratedChurch = rawEl.churchName || {
    visible: raw.showChurchName !== undefined ? !!raw.showChurchName : base.elements.churchName.visible,
  };

  const elements = {
    body: sanitizeTextElement(migratedBody, base.elements.body),
    reference: sanitizeTextElement(migratedRef, base.elements.reference),
    version: sanitizeTextElement(migratedVer, base.elements.version),
    verseNumbers: sanitizeTextElement(rawEl.verseNumbers || { visible: raw.showVerseNumbers }, base.elements.verseNumbers),
    songTitle: sanitizeTextElement(rawEl.songTitle || { color: raw.labelColor || base.elements.songTitle.color, align: raw.align }, base.elements.songTitle),
    author: sanitizeTextElement(rawEl.author, base.elements.author),
    sectionLabel: sanitizeTextElement(rawEl.sectionLabel || { color: raw.labelColor || base.elements.sectionLabel.color, align: raw.align }, base.elements.sectionLabel),
    churchName: sanitizeTextElement(migratedChurch, base.elements.churchName),
    customText: sanitizeTextElement(rawEl.customText, base.elements.customText),
    divider: {
      ...base.elements.divider,
      ...(rawEl.divider || {}),
      visible: rawEl.divider?.visible !== undefined ? !!rawEl.divider.visible : base.elements.divider.visible,
      style: DIVIDER_STYLES.some((d) => d.value === rawEl.divider?.style) ? rawEl.divider.style : base.elements.divider.style,
      thickness: clamp(rawEl.divider?.thickness, 1, 16, base.elements.divider.thickness),
      color: safeHex(rawEl.divider?.color, base.elements.divider.color),
      opacity: clamp(rawEl.divider?.opacity, 0, 100, base.elements.divider.opacity),
      lengthMode: ["full", "percent", "px"].includes(rawEl.divider?.lengthMode) ? rawEl.divider.lengthMode : base.elements.divider.lengthMode,
      lengthValue: clamp(rawEl.divider?.lengthValue, 5, 1920, base.elements.divider.lengthValue),
      align: ["left", "center", "right"].includes(rawEl.divider?.align) ? rawEl.divider.align : base.elements.divider.align,
      marginTop: clamp(rawEl.divider?.marginTop, 0, 80, base.elements.divider.marginTop),
      marginBottom: clamp(rawEl.divider?.marginBottom, 0, 80, base.elements.divider.marginBottom),
    },
    logo: {
      ...base.elements.logo,
      ...migratedLogo,
      visible: migratedLogo.visible !== undefined ? !!migratedLogo.visible : base.elements.logo.visible,
      size: clamp(migratedLogo.size, 20, 260, base.elements.logo.size),
      position: ["left", "right", "top-left", "top-right", "bottom-left", "bottom-right", "top", "bottom"].includes(migratedLogo.position) ? migratedLogo.position : base.elements.logo.position,
      mask: ["none", "circle", "rounded"].includes(migratedLogo.mask) ? migratedLogo.mask : base.elements.logo.mask,
      padding: clamp(migratedLogo.padding, 0, 48, base.elements.logo.padding),
      opacity: clamp(migratedLogo.opacity, 0, 100, base.elements.logo.opacity),
      x: clamp(migratedLogo.x, 0, 1800, base.elements.logo.x),
      y: clamp(migratedLogo.y, 0, 1000, base.elements.logo.y),
      anim: {
        type: LOGO_ANIMATIONS.some((a) => a.value === migratedLogo.anim?.type) ? migratedLogo.anim.type : base.elements.logo.anim.type,
        duration: clamp(migratedLogo.anim?.duration, 0, 3000, base.elements.logo.anim.duration),
        delay: clamp(migratedLogo.anim?.delay, 0, 2000, base.elements.logo.anim.delay),
      },
    },
    watermark: {
      ...base.elements.watermark,
      ...(rawEl.watermark || {}),
      visible: rawEl.watermark?.visible !== undefined ? !!rawEl.watermark.visible : base.elements.watermark.visible,
      position: WATERMARK_POSITIONS.includes(rawEl.watermark?.position) ? rawEl.watermark.position : base.elements.watermark.position,
      size: clamp(rawEl.watermark?.size, 20, 240, base.elements.watermark.size),
      opacity: clamp(rawEl.watermark?.opacity, 0, 100, base.elements.watermark.opacity),
      blend: ["normal", "multiply"].includes(rawEl.watermark?.blend) ? rawEl.watermark.blend : "normal",
      anim: {
        type: ["none", "fade"].includes(rawEl.watermark?.anim?.type) ? rawEl.watermark.anim.type : "fade",
        duration: clamp(rawEl.watermark?.anim?.duration, 0, 2000, 400),
        delay: 0,
      },
    },
  };

  const rb = raw.refBox || {};
  const bm = raw.bgMotion || {};

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
    layoutFlow: ["auto-fill", "keep-space", "free-position"].includes(raw.layoutFlow) ? raw.layoutFlow : base.layoutFlow,

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
    bgMotion: {
      type: BG_MOTIONS.some((m) => m.value === bm.type) ? bm.type : (raw.bgType === "animated-gradient" ? "gradient-drift" : base.bgMotion.type),
      speed: clamp(bm.speed, 10, 100, base.bgMotion.speed),
      intensity: clamp(bm.intensity, 10, 100, base.bgMotion.intensity),
      color: safeHex(bm.color, base.bgMotion.color),
    },
    borderWidth: clamp(raw.borderWidth, 0, 12, base.borderWidth),
    borderColor: safeHex(raw.borderColor, base.borderColor),
    accentBarColor: safeHex(raw.accentBarColor, base.accentBarColor),
    accentBarHeight: clamp(raw.accentBarHeight, 0, 16, base.accentBarHeight),
    boxShadow: raw.boxShadow !== undefined ? !!raw.boxShadow : base.boxShadow,

    showReference: elements.reference.visible,
    showVersion: elements.version.visible,
    showVerseNumbers: elements.verseNumbers.visible,
    refPosition: REF_POSITIONS.some((p) => p.value === raw.refPosition) ? raw.refPosition : base.refPosition,
    refSeparator: typeof raw.refSeparator === "string" ? raw.refSeparator.slice(0, 12) : base.refSeparator,
    refFormat: REF_FORMATS.some((f) => f.value === raw.refFormat) ? raw.refFormat : base.refFormat,
    refBox: {
      style: REF_BOX_STYLES.some((s) => s.value === rb.style) ? rb.style : base.refBox.style,
      borderColor: safeHex(rb.borderColor, base.refBox.borderColor),
      borderWidth: clamp(rb.borderWidth, 0, 8, base.refBox.borderWidth),
      paddingX: clamp(rb.paddingX, 0, 40, base.refBox.paddingX),
      paddingY: clamp(rb.paddingY, 0, 24, base.refBox.paddingY),
      bgColor: rb.bgColor ? safeHex(rb.bgColor, "") : "",
    },

    // Synced legacy fields
    fontFamily: elements.body.fontFamily,
    fontSize: elements.body.fontSize,
    minFontSize: elements.body.minFontSize,
    weight: elements.body.weight,
    lineHeight: elements.body.lineHeight,
    letterSpacing: elements.body.letterSpacing,
    align: elements.body.align,
    uppercase: elements.body.textTransform === "uppercase",
    autoFit: elements.body.autoFit,
    textColor: elements.body.color,
    refColor: elements.reference.color,
    versionColor: elements.version.color,
    labelColor: elements.sectionLabel.color,
    textShadow: elements.body.shadow.enabled,
    textShadowBlur: elements.body.shadow.blur,
    textShadowOffsetY: elements.body.shadow.y,
    textShadowColor: elements.body.shadow.color,
    textOutlineWidth: elements.body.outline.width,
    textOutlineColor: elements.body.outline.color,
    textGlow: elements.body.glow.enabled,
    textGlowColor: elements.body.glow.color,
    textHighlightBg: elements.body.highlight.color,
    showLogo: elements.logo.visible,
    showChurchName: elements.churchName.visible,
    logoX: elements.logo.x,
    logoY: elements.logo.y,
    logoSize: elements.logo.size,
    textOffsetX: elements.body.x,
    textOffsetY: elements.body.y,
    refOffsetX: elements.reference.x,
    refOffsetY: elements.reference.y,

    entrance: TRANSITION_TYPES.some((t) => t.value === raw.entrance) ? raw.entrance : base.entrance,
    exit: TRANSITION_TYPES.some((t) => t.value === raw.exit) ? raw.exit : base.exit,
    contentTransition: ["fade", "none"].includes(raw.contentTransition) ? raw.contentTransition : "fade",
    transitionDuration: clamp(raw.transitionDuration, 0, 1500, base.transitionDuration),
    transitionEasing: EASING_TYPES.some((e) => e.value === raw.transitionEasing) ? raw.transitionEasing : base.transitionEasing,

    elements,
  };
}

export function migrateThemeToV2(raw) {
  return sanitizeTheme(raw);
}

export function sanitizeTheme(raw) {
  const id = typeof raw?.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : `theme-${Date.now()}`;
  const isBuiltIn = !!raw?.builtIn || DEFAULT_THEMES.some((t) => t.id === id);
  return {
    version: 2,
    builtIn: isBuiltIn,
    id,
    name: typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 60) : "Custom Theme",
    slot: ["scripture", "songs", "text"].includes(raw?.slot) ? raw.slot : "scripture",
    styleTag: typeof raw?.styleTag === "string" ? raw.styleTag.slice(0, 30) : "Custom",
    description: typeof raw?.description === "string" ? raw.description.slice(0, 240) : "",
    placeholderTitle: typeof raw?.placeholderTitle === "string" ? raw.placeholderTitle.slice(0, 120) : "",
    placeholderBody: typeof raw?.placeholderBody === "string" ? raw.placeholderBody.slice(0, 500) : "",
    useCount: clamp(raw?.useCount, 0, 1000000, 0),
    createdAt: raw?.createdAt || new Date().toISOString(),
    updatedAt: raw?.updatedAt || new Date().toISOString(),
    deleted: !!raw?.deleted,
    lowerThird: sanitizeLayout(raw?.lowerThird, false),
    fullScreen: sanitizeLayout(raw?.fullScreen, true),
  };
}

export function validateImportedThemeJson(rawText) {
  if (typeof rawText !== "string" || rawText.length > 512 * 1024) {
    return { ok: false, error: "Theme file is too large (max 512 KB)." };
  }
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: "Invalid JSON file." };
  }
  const res = ThemeImportSchema.safeParse(parsed);
  if (!res.success) {
    return { ok: false, error: "Invalid theme schema: " + (res.error.issues[0]?.message || "check fields") };
  }
  const clean = sanitizeTheme({ ...parsed, builtIn: false, id: `custom-${Date.now()}` });
  return { ok: true, theme: clean };
}

// Unique template name check (V1.2 §5.2 — case-insensitive across all templates including built-ins)
export function isTemplateNameTaken(name, allThemes, excludeId = null) {
  const norm = String(name || "").trim().toLowerCase();
  if (!norm) return true;
  return allThemes.some((t) => !t.deleted && t.id !== excludeId && String(t.name || "").trim().toLowerCase() === norm);
}

export function suggestUniqueTemplateName(baseName, allThemes) {
  const clean = String(baseName || "Custom Template").trim().replace(/\s*\(copy\)$|\s+\d+$/i, "").slice(0, 50);
  const copyCandidate = `${clean} (copy)`;
  if (!isTemplateNameTaken(copyCandidate, allThemes)) return copyCandidate;
  for (let i = 2; i < 100; i++) {
    const c = `${clean} ${i}`;
    if (!isTemplateNameTaken(c, allThemes)) return c;
  }
  return `${clean} ${Date.now().toString().slice(-4)}`;
}

// Format a scripture reference according to refFormat (V1.2 §2.3)
export function formatReferenceText(title, subtitle, layout) {
  const t = String(title || "").trim();
  if (!t) return "";
  const fmt = layout?.refFormat || "full";
  let ref = t;
  if (fmt === "short") {
    // Abbreviate first word if > 3 chars (e.g. John 3:16 -> Jn 3:16, Genesis 1:1 -> Gen 1:1)
    const shorts = {
      Genesis: "Gen", Exodus: "Ex", Leviticus: "Lev", Numbers: "Num", Deuteronomy: "Deut",
      Joshua: "Josh", Judges: "Judg", Samuel: "Sam", Kings: "Kgs", Chronicles: "Chr",
      Nehemiah: "Neh", Esther: "Est", Psalms: "Ps", Psalm: "Ps", Proverbs: "Prov",
      Ecclesiastes: "Eccl", Isaiah: "Isa", Jeremiah: "Jer", Lamentations: "Lam", Ezekiel: "Ezek",
      Daniel: "Dan", Matthew: "Matt", Mark: "Mk", Luke: "Lk", John: "Jn", Romans: "Rom",
      Corinthians: "Cor", Galatians: "Gal", Ephesians: "Eph", Philippians: "Phil", Colossians: "Col",
      Thessalonians: "Thess", Timothy: "Tim", Hebrews: "Heb", James: "Jas", Peter: "Pet", Revelation: "Rev",
    };
    ref = ref.replace(/\b([A-Z][a-z]+)\b/, (m) => shorts[m] || m.slice(0, 3));
  } else if (fmt === "upper") {
    ref = ref.toUpperCase();
  }
  if (fmt === "withVersion" && subtitle && layout?.showVersion !== false) {
    return `${ref} (${subtitle})`;
  }
  return ref;
}

// Generate downloadable 1920x1080 PNG design template with safe-area guides (V1.1 §3.4)
export function generateTemplatePngDataUrl(kind = "fullScreen") {
  if (typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = 1920;
  c.height = 1080;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#0B1020";
  ctx.fillRect(0, 0, 1920, 1080);

  if (kind === "fullScreen") {
    ctx.strokeStyle = "rgba(232, 184, 74, 0.7)";
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 12]);
    ctx.strokeRect(180, 140, 1560, 800);
    ctx.fillStyle = "rgba(232, 184, 74, 0.08)";
    ctx.fillRect(180, 140, 1560, 800);
  } else {
    ctx.strokeStyle = "rgba(232, 184, 74, 0.85)";
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 12]);
    ctx.strokeRect(160, 780, 1600, 220);
    ctx.fillStyle = "rgba(232, 184, 74, 0.12)";
    ctx.fillRect(160, 780, 1600, 220);
  }

  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  ctx.strokeRect(96, 54, 1728, 972);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    kind === "fullScreen" ? "Selah Live — Full Screen Template (1920 × 1080)" : "Selah Live — Lower Third Template (1920 × 1080)",
    960,
    kind === "fullScreen" ? 510 : 880
  );
  ctx.fillStyle = "#E8B84A";
  ctx.font = "28px system-ui, sans-serif";
  ctx.fillText(
    kind === "fullScreen"
      ? "Keep important background artwork outside the dashed 1560×800 text safe zone"
      : "Dashed box marks the default 1600×220 Lower Third bar area (bottom margin 80px)",
    960,
    kind === "fullScreen" ? 565 : 935
  );
  return c.toDataURL("image/png");
}

// Compute SHA-256 hex digest of an ArrayBuffer / Uint8Array in the browser
export async function sha256BufferHex(buffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Process uploaded image: verify MIME/size, strip EXIF by re-encoding via canvas, return dataUrl + metadata
export async function processUploadedImage(file, maxBytes = 1024 * 1024) {
  const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
  if (!file || !ALLOWED.includes(file.type)) {
    throw new Error("Only PNG, JPEG, or WebP images are allowed (SVG is blocked for security).");
  }
  if (file.size > maxBytes) {
    throw new Error(`Image is too large (${(file.size / 1024).toFixed(0)} KB). Maximum allowed is ${(maxBytes / 1024).toFixed(0)} KB.`);
  }
  const origUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not decode image file."));
      el.src = origUrl;
    });
    const maxW = 1920, maxH = 1080;
    let w = img.naturalWidth, h = img.naturalHeight;
    if (w > maxW || h > maxH) {
      const r = Math.min(maxW / w, maxH / h);
      w = Math.round(w * r);
      h = Math.round(h * r);
    }
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const outMime = file.type === "image/png" ? "image/png" : "image/webp";
    const dataUrl = c.toDataURL(outMime, 0.88);
    const bytes = new TextEncoder().encode(dataUrl);
    const assetId = (await sha256BufferHex(bytes)).slice(0, 24);
    return { assetId, mime: outMime, dataUrl, width: w, height: h, sizeBytes: Math.round((dataUrl.length * 3) / 4) };
  } finally {
    URL.revokeObjectURL(origUrl);
  }
}
