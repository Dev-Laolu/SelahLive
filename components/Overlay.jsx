"use client";
import { useLayoutEffect, useRef, useState, useEffect } from "react";
import { sanitizeLayout, formatReferenceText } from "@/lib/themes";
import BackgroundCanvas from "./BackgroundCanvas";

// 1920x1080 renderer. Shared by the real overlay page, the in-app preview, template thumbnails, and the canvas editor.
const WM_POS = {
  "top-left": { left: 48, top: 40 },
  "top-center": { left: "50%", top: 40, transform: "translateX(-50%)" },
  "top-right": { right: 48, top: 40 },
  "middle-left": { left: 48, top: "50%", transform: "translateY(-50%)" },
  center: { left: "50%", top: "50%", transform: "translate(-50%,-50%)" },
  "middle-right": { right: 48, top: "50%", transform: "translateY(-50%)" },
  "bottom-left": { left: 48, bottom: 40 },
  "bottom-center": { left: "50%", bottom: 40, transform: "translateX(-50%)" },
  "bottom-right": { right: 48, bottom: 40 },
  // Legacy 2-letter keys
  tl: { left: 48, top: 40 }, tc: { left: "50%", top: 40, transform: "translateX(-50%)" }, tr: { right: 48, top: 40 },
  ml: { left: 48, top: "50%", transform: "translateY(-50%)" }, mc: { left: "50%", top: "50%", transform: "translate(-50%,-50%)" }, mr: { right: 48, top: "50%", transform: "translateY(-50%)" },
  bl: { left: 48, bottom: 40 }, bc: { left: "50%", bottom: 40, transform: "translateX(-50%)" }, br: { right: 48, bottom: 40 },
};

function hexToRgba(hex, opacityPct = 100) {
  const clean = (hex || "#0B1020").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const a = Math.max(0, Math.min(1, opacityPct / 100));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function buildTextShadow(el, perfMode = false) {
  const parts = [];
  if (el?.shadow?.enabled) {
    const blur = perfMode ? Math.min(4, el.shadow.blur ?? 8) : (el.shadow.blur ?? 12);
    parts.push(`${el.shadow.x ?? 0}px ${el.shadow.y ?? 2}px ${blur}px ${el.shadow.color || "rgba(0,0,0,.55)"}`);
  }
  if (el?.glow?.enabled && !perfMode) {
    parts.push(`0 0 ${el.glow.blur ?? 18}px ${el.glow.color || "#E8B84A"}`);
  }
  return parts.join(", ") || "none";
}

function textElStyle(el, perfMode = false) {
  if (!el) return {};
  return {
    fontFamily: el.fontFamily,
    fontWeight: el.weight,
    fontStyle: el.italic ? "italic" : "normal",
    textDecoration: el.underline ? "underline" : "none",
    textTransform: el.textTransform && el.textTransform !== "none" ? el.textTransform : undefined,
    letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
    lineHeight: el.lineHeight || 1.2,
    textAlign: el.align || "left",
    color: el.color || "#FFFFFF",
    opacity: (el.opacity ?? 100) / 100,
    textShadow: buildTextShadow(el, perfMode),
    WebkitTextStroke: el.outline?.width ? `${el.outline.width}px ${el.outline.color || "#000"}` : undefined,
    padding: el.padding ? `${el.padding}px` : undefined,
    transform: el.x || el.y ? `translate(${el.x || 0}px, ${el.y || 0}px)` : undefined,
  };
}

function buildBackgroundStyles(cfg, assetsMap = {}, reduceMotion = false) {
  if (cfg.bgType === "none") return { background: "transparent" };
  if (cfg.bgType === "image") {
    const src = (cfg.bgImageAssetId && assetsMap[cfg.bgImageAssetId]) || cfg.bgImageDataUrl;
    if (src) {
      return {
        backgroundColor: hexToRgba(cfg.bgColor, cfg.bgOpacity),
        backgroundImage: `url(${src})`,
        backgroundSize: cfg.bgFit === "fill" ? "100% 100%" : cfg.bgFit || "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        animation: !reduceMotion && cfg.bgMotion?.type === "ken-burns" ? `selah-ken-burns ${Math.max(10, 45 - (cfg.bgMotion.speed || 50) * 0.3)}s ease-in-out infinite alternate` : undefined,
      };
    }
  }
  if (cfg.bgType === "gradient" || cfg.bgType === "animated-gradient") {
    const stops = (cfg.gradientStops && cfg.gradientStops.length >= 2 ? cfg.gradientStops : [cfg.bgColor, "#1B2540"]).join(", ");
    const grad =
      cfg.gradientStyle === "radial"
        ? `radial-gradient(circle at center, ${stops})`
        : `linear-gradient(${cfg.gradientAngle ?? 135}deg, ${stops})`;
    const isDrift = !reduceMotion && (cfg.bgType === "animated-gradient" || cfg.bgMotion?.type === "gradient-drift");
    return {
      background: grad,
      backgroundSize: isDrift ? "220% 220%" : "100% 100%",
      animation: isDrift ? `drift ${cfg.gradientSpeed || 20}s ease-in-out infinite alternate` : undefined,
      opacity: (cfg.bgOpacity ?? 100) / 100,
    };
  }
  return { background: hexToRgba(cfg.bgColor, cfg.bgOpacity) };
}

function AnimatedContent({ text, anim, reduceMotion = false, perfMode = false, highlight }) {
  const safeText = String(text || "");
  const type = reduceMotion ? "fade" : (anim?.type || "fade");
  const dur = anim?.duration ?? 280;
  const delay = anim?.delay ?? 0;
  const easing = anim?.easing || "ease-out";
  const stagger = anim?.stagger ?? 40;

  const wrapHighlight = (node) =>
    highlight?.color ? (
      <span
        style={{
          background: highlight.color,
          padding: `${highlight.padding ?? 6}px ${(highlight.padding ?? 6) * 1.8}px`,
          borderRadius: highlight.radius ?? 6,
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
        }}
      >
        {node}
      </span>
    ) : (
      node
    );

  if (type === "none" || dur === 0) return wrapHighlight(safeText);

  if (type === "word-by-word") {
    const words = safeText.split(/(\s+)/);
    let idx = 0;
    return wrapHighlight(
      words.map((w, i) => {
        if (/^\s+$/.test(w)) return <span key={i}>{w}</span>;
        const d = delay + Math.min(idx++, 40) * stagger;
        return (
          <span
            key={i}
            className="ov-txt-word"
            style={{
              display: "inline-block",
              animationDuration: `${dur}ms`,
              animationDelay: `${d}ms`,
              animationTimingFunction: easing,
            }}
          >
            {w}
          </span>
        );
      })
    );
  }

  if (type === "line-by-line") {
    const lines = safeText.split("\n");
    return wrapHighlight(
      lines.map((line, i) => (
        <span
          key={i}
          className="ov-txt-slide-up"
          style={{
            display: "block",
            animationDuration: `${dur}ms`,
            animationDelay: `${delay + i * Math.max(60, stagger)}ms`,
            animationTimingFunction: easing,
          }}
        >
          {line || "\u00A0"}
        </span>
      ))
    );
  }

  if (type === "letter-rise") {
    const chars = Array.from(safeText.slice(0, 120));
    const rest = safeText.slice(120);
    return wrapHighlight(
      <>
        {chars.map((ch, i) =>
          ch === "\n" ? (
            <br key={i} />
          ) : (
            <span
              key={i}
              className="ov-txt-word"
              style={{
                display: "inline-block",
                whiteSpace: "pre",
                animationDuration: `${dur}ms`,
                animationDelay: `${delay + Math.min(i, 45) * Math.min(stagger, 35)}ms`,
                animationTimingFunction: easing,
              }}
            >
              {ch}
            </span>
          )
        )}
        {rest}
      </>
    );
  }

  const clsMap = {
    fade: "ov-txt-fade",
    "slide-up": "ov-txt-slide-up",
    "slide-down": "ov-txt-slide-down",
    "slide-left": "ov-txt-slide-left",
    "slide-right": "ov-txt-slide-right",
    zoom: "ov-txt-zoom",
    "blur-in": perfMode ? "ov-txt-fade" : "ov-txt-blur",
    typewriter: "ov-txt-type",
  };
  const cls = clsMap[type] || "ov-txt-fade";

  return (
    <span
      className={cls}
      style={{
        display: "inline-block",
        animationDuration: `${dur}ms`,
        animationDelay: `${delay}ms`,
        animationTimingFunction: easing,
      }}
    >
      {wrapHighlight(safeText)}
    </span>
  );
}

function FitText({ text, el, lines, perfMode = false, reduceMotion = false }) {
  const ref = useRef(null);
  const max = el?.fontSize || 52;
  const min = el?.minFontSize || 24;
  const autoFit = el?.autoFit !== false;
  const maxLines = el?.maxLines > 0 ? el.maxLines : lines;
  const [size, setSize] = useState(max);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!autoFit) {
      setSize(max);
      node.style.fontSize = max + "px";
      return;
    }
    let s = max;
    node.style.fontSize = s + "px";
    const lh = el?.lineHeight || 1.18;
    const limit = (s2) => (maxLines ? s2 * lh * maxLines : Infinity);
    while (s > min && (node.scrollHeight > node.clientHeight + 2 || node.scrollHeight > limit(s) + 2)) {
      s -= 2;
      node.style.fontSize = s + "px";
    }
    setSize(s);
  }, [text, max, min, maxLines, el?.lineHeight, autoFit]);

  return (
    <div
      ref={ref}
      style={{
        ...textElStyle(el, perfMode),
        fontSize: size,
        flex: "1 1 auto",
        minHeight: 0,
        overflow: "hidden",
        whiteSpace: "pre-line",
        display: "flex",
        flexDirection: "column",
        justifyContent: el?.valign === "top" ? "flex-start" : el?.valign === "bottom" ? "flex-end" : "center",
      }}
    >
      <AnimatedContent
        text={text}
        anim={el?.animIn}
        reduceMotion={reduceMotion}
        perfMode={perfMode}
        highlight={el?.highlight}
      />
    </div>
  );
}

function DividerLine({ divider }) {
  if (!divider?.visible) return null;
  const widthVal =
    divider.lengthMode === "full"
      ? "100%"
      : divider.lengthMode === "px"
        ? `${divider.lengthValue}px`
        : `${Math.min(100, divider.lengthValue || 35)}%`;
  const alignSelf = divider.align === "center" ? "center" : divider.align === "right" ? "flex-end" : "flex-start";
  const isGrad = divider.style === "gradient";

  return (
    <div
      aria-hidden="true"
      style={{
        width: widthVal,
        alignSelf,
        marginTop: divider.marginTop ?? 10,
        marginBottom: divider.marginBottom ?? 10,
        opacity: (divider.opacity ?? 85) / 100,
        height: isGrad ? divider.thickness || 2 : 0,
        background: isGrad
          ? `linear-gradient(90deg, transparent, ${divider.color || "#E8B84A"}, transparent)`
          : "transparent",
        borderTop: isGrad ? "none" : `${divider.thickness || 2}px ${divider.style || "solid"} ${divider.color || "#E8B84A"}`,
        transform: divider.x || divider.y ? `translate(${divider.x || 0}px, ${divider.y || 0}px)` : undefined,
        flexShrink: 0,
      }}
    />
  );
}

export function OverlayStage({
  item,
  style = {},
  theme = null,
  assetsMap = {},
  enterKey = 0,
  contentKey = 0,
  animKey,
  paused = false,
  performanceMode = false,
  reduceMotion = false,
}) {
  if (!item) return null;
  const fs = item.mode === "fullScreen";
  const isSong = item.kind === "song";
  const clearMode = item.clearMode || "none";
  const perf = !!(performanceMode || style.performanceMode);
  const redMotion = !!(reduceMotion || style.reduceMotion);

  // Blackout screen
  if (clearMode === "blackout") {
    return <div className="ov ov-content-fade" style={{ background: "#000000" }} />;
  }

  // Resolve V2 layout
  const activeTheme = theme || item.theme || null;
  const rawLayout = activeTheme ? (fs ? activeTheme.fullScreen : activeTheme.lowerThird) : {
    width: style.width,
    height: style.height,
    bottom: style.bottom,
    hpos: style.hpos,
    fontSize: fs ? (isSong ? 84 : 96) : style.textSize,
    weight: style.weight,
    textColor: style.color,
    align: fs ? "center" : style.align,
    bgColor: style.bg,
    bgType: style.gradient ? "animated-gradient" : "solid",
    entrance: style.entrance,
    transitionDuration: style.speed,
  };
  const cfg = sanitizeLayout(rawLayout, fs);
  const els = cfg.elements;

  const bgStyles = buildBackgroundStyles(cfg, assetsMap, redMotion);
  const initials = (style.churchName || "S").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  // Reference formatting (V1.2 §2.3)
  const sep = cfg.refSeparator ?? " · ";
  const formattedRef = formatReferenceText(item.title, item.subtitle, cfg);
  const showRefEl = els.reference.visible && !!formattedRef;
  const showVerEl = els.version.visible && !!item.subtitle && cfg.refFormat !== "withVersion";
  const hasRefLine = showRefEl || showVerEl;

  const entranceCls = redMotion ? "ov-anim-fade" : `ov-anim-${item.animation || cfg.entrance || "slide-up"}`;
  const contentTransCls = `ov-content-${item.transition || cfg.contentTransition || "fade"}`;
  const cKey = contentKey || animKey || (item.title + item.body);
  const transVars = {
    "--tdur": `${item.transitionDuration || cfg.transitionDuration || (fs ? 400 : 250)}ms`,
    "--tease": item.transitionEasing || cfg.transitionEasing || "ease-out",
  };

  // Logo mask & animation classes (V1.2 §2.5 & §4.2)
  const logoMaskRadius = els.logo.mask === "circle" ? "50%" : els.logo.mask === "rounded" ? 16 : 0;
  const logoAnimCls = !redMotion && els.logo.anim?.type && els.logo.anim.type !== "none" ? `ov-logo-${els.logo.anim.type}` : "";

  // Watermark visibility (V1.2 §2.5 — independent toggle)
  const wmSrc = style.watermark || style.logo;
  const showWm = els.watermark.visible && !!wmSrc;

  // Logo screen
  if (clearMode === "logoScreen") {
    return (
      <div className="ov ov-content-fade" style={bgStyles}>
        <BackgroundCanvas
          type={cfg.bgMotion?.type}
          speed={cfg.bgMotion?.speed}
          intensity={cfg.bgMotion?.intensity}
          color={cfg.bgMotion?.color}
          paused={paused}
          performanceMode={perf}
          reduceMotion={redMotion}
        />
        <div style={{ position: "relative", zIndex: 2, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
          {style.logo ? (
            <img src={style.logo} alt="" className={logoAnimCls} style={{ maxWidth: 360, maxHeight: 360, objectFit: "contain", borderRadius: logoMaskRadius }} />
          ) : (
            <div className="ov-brand" style={{ border: 0, padding: 0, width: "auto" }}>
              <span className={`init ${logoAnimCls}`} style={{ width: 180, height: 180, fontSize: 72, borderRadius: logoMaskRadius || 36 }}>{initials}</span>
            </div>
          )}
          {els.churchName.visible && style.churchName && (
            <div style={{ ...textElStyle(els.churchName, perf), fontSize: 52 }}>{style.churchName}</div>
          )}
        </div>
      </div>
    );
  }

  // Reference box styling (V1.2 §2.3)
  const rb = cfg.refBox || {};
  const refBoxCss =
    rb.style === "pill"
      ? {
        display: "inline-flex",
        alignItems: "center",
        border: `${rb.borderWidth ?? 1.5}px solid ${rb.borderColor || "#E8B84A"}`,
        borderRadius: 999,
        padding: `${rb.paddingY ?? 4}px ${rb.paddingX ?? 14}px`,
        background: rb.bgColor || "transparent",
      }
      : rb.style === "rect"
        ? {
          display: "inline-flex",
          alignItems: "center",
          border: `${rb.borderWidth ?? 1.5}px solid ${rb.borderColor || "#E8B84A"}`,
          borderRadius: 6,
          padding: `${rb.paddingY ?? 4}px ${rb.paddingX ?? 12}px`,
          background: rb.bgColor || "transparent",
        }
        : rb.style === "underline"
          ? {
            display: "inline-flex",
            alignItems: "center",
            borderBottom: `${rb.borderWidth ?? 2}px solid ${rb.borderColor || "#E8B84A"}`,
            paddingBottom: rb.paddingY ?? 4,
          }
          : { display: "inline-flex", alignItems: "center" };

  const refAlignJustify =
    els.reference.align === "center" ? "center" : els.reference.align === "right" ? "flex-end" : "flex-start";

  const activeRefEl = isSong ? els.songTitle : els.reference;

  const refBlock = hasRefLine && clearMode !== "clearText" && (
    <div
      style={{
        display: "flex",
        justifyContent: refAlignJustify,
        width: "100%",
        flexShrink: 0,
        transform: activeRefEl.x || activeRefEl.y ? `translate(${activeRefEl.x || 0}px, ${activeRefEl.y || 0}px)` : undefined,
      }}
    >
      <div style={{ ...refBoxCss, gap: 4 }}>
        {showRefEl && (
          <span style={{ ...textElStyle(activeRefEl, perf), transform: undefined, fontSize: activeRefEl.fontSize }}>
            <AnimatedContent text={formattedRef} anim={activeRefEl.animIn} reduceMotion={redMotion} perfMode={perf} highlight={activeRefEl.highlight} />
          </span>
        )}
        {showVerEl && (
          <span style={{ ...textElStyle(els.version, perf), fontSize: els.version.fontSize }}>
            {showRefEl ? sep : ""}
            <AnimatedContent text={item.subtitle} anim={els.version.animIn} reduceMotion={redMotion} perfMode={perf} />
          </span>
        )}
      </div>
    </div>
  );

  // Strip verse numbers if verseNumbers.visible is false
  const bodyText = els.verseNumbers.visible
    ? item.body
    : String(item.body || "").replace(/(^|\n)\s*\d+\s+/g, "$1");

  const customTextBlock = els.customText.visible && els.customText.text && clearMode !== "clearText" && (
    <div style={{ ...textElStyle(els.customText, perf), fontSize: els.customText.fontSize, flexShrink: 0 }}>
      <AnimatedContent text={els.customText.text} anim={els.customText.animIn} reduceMotion={redMotion} perfMode={perf} />
    </div>
  );

  const authorBlock = isSong && els.author.visible && item.author && clearMode !== "clearText" && (
    <div style={{ ...textElStyle(els.author, perf), fontSize: els.author.fontSize, flexShrink: 0 }}>
      {item.author}
    </div>
  );

  const sectionLabelBlock = isSong && els.sectionLabel.visible && item.label && clearMode !== "clearText" && (
    <div style={{ display: "flex", justifyContent: els.sectionLabel.align === "center" ? "center" : els.sectionLabel.align === "right" ? "flex-end" : "flex-start", width: "100%", flexShrink: 0 }}>
      <span
        className="ov-pill"
        style={{
          ...textElStyle(els.sectionLabel, perf),
          fontSize: els.sectionLabel.fontSize,
        }}
      >
        {item.label}
      </span>
    </div>
  );

  // ============================================================================
  // FULL SCREEN LAYOUT
  // ============================================================================
  if (fs) {
    const showBrandHead = els.logo.visible || (els.churchName.visible && !!style.churchName);
    const keepSpace = cfg.layoutFlow === "keep-space";
    const headPos =
      els.logo.position === "top-right"
        ? { right: 48, top: 40 }
        : els.logo.position === "bottom-left"
          ? { left: 48, bottom: 40 }
          : els.logo.position === "bottom-right"
            ? { right: 48, bottom: 40 }
            : { left: els.logo.x ?? 48, top: els.logo.y ?? 40 };

    return (
      <div
        key={`fs-shell-${enterKey}`}
        className={`ov ${entranceCls}`}
        style={{ ...bgStyles, animationDuration: `${cfg.transitionDuration || 400}ms`, overflow: "hidden" }}
      >
        <BackgroundCanvas
          type={cfg.bgMotion?.type}
          speed={cfg.bgMotion?.speed}
          intensity={cfg.bgMotion?.intensity}
          color={cfg.bgMotion?.color}
          paused={paused}
          performanceMode={perf}
          reduceMotion={redMotion}
        />
        {cfg.backdropBlur > 0 && !perf && (
          <div style={{ position: "absolute", inset: 0, backdropFilter: `blur(${cfg.backdropBlur}px)`, zIndex: 1 }} />
        )}
        {(showBrandHead || keepSpace) && (
          <div
            className="ov-head"
            style={{
              ...headPos,
              zIndex: 3,
              visibility: showBrandHead ? "visible" : "hidden",
            }}
          >
            {els.logo.visible && (
              style.logo ? (
                <img
                  src={style.logo}
                  alt=""
                  className={logoAnimCls}
                  style={{
                    width: els.logo.size || 56,
                    height: els.logo.size || 56,
                    borderRadius: logoMaskRadius,
                    padding: els.logo.padding || 0,
                    opacity: (els.logo.opacity ?? 100) / 100,
                    objectFit: "contain",
                  }}
                />
              ) : (
                <span className="ov-brand" style={{ border: 0, padding: 0, width: "auto" }}>
                  <span
                    className={`init ${logoAnimCls}`}
                    style={{
                      width: els.logo.size || 56,
                      height: els.logo.size || 56,
                      fontSize: Math.round((els.logo.size || 56) * 0.44),
                      borderRadius: logoMaskRadius || 12,
                      opacity: (els.logo.opacity ?? 100) / 100,
                    }}
                  >
                    {initials}
                  </span>
                </span>
              )
            )}
            {els.churchName.visible && style.churchName && (
              <span style={{ ...textElStyle(els.churchName, perf), fontSize: els.churchName.fontSize }}>
                {style.churchName}
              </span>
            )}
          </div>
        )}

        {showWm && (
          <div
            className="ov-wm"
            style={{
              ...(WM_POS[els.watermark.position] || WM_POS["bottom-right"]),
              opacity: (els.watermark.opacity ?? 18) / 100,
              mixBlendMode: els.watermark.blend || "normal",
              zIndex: 2,
            }}
          >
            <img src={wmSrc} alt="" style={{ width: els.watermark.size || 48, height: els.watermark.size || 48, objectFit: "contain" }} />
          </div>
        )}

        {clearMode !== "clearText" && (
          <div
            key={`fs-content-${cKey}`}
            className={`ov-fs ${contentTransCls}`}
            style={{
              ...transVars,
              position: "absolute",
              inset: 0,
              zIndex: 3,
              padding: `${cfg.paddingY ?? 140}px ${cfg.paddingX ?? 180}px`,
            }}
          >
            {sectionLabelBlock}
            {cfg.refPosition === "above" && (
              <>
                {refBlock}
                <DividerLine divider={els.divider} />
              </>
            )}
            {els.body.visible && (
              <FitText
                text={cfg.refPosition === "inline" && hasRefLine ? `${bodyText}  ${formattedRef}${showVerEl ? `${sep}${item.subtitle}` : ""}` : bodyText}
                el={els.body}
                perfMode={perf}
                reduceMotion={redMotion}
              />
            )}
            {cfg.refPosition === "below" && (
              <>
                <DividerLine divider={els.divider} />
                {refBlock}
              </>
            )}
            {authorBlock}
            {customTextBlock}
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // LOWER THIRD LAYOUT (with Space Reallocation auto-layout flex stack!)
  // ============================================================================
  const w = cfg.width || 1600;
  const h = cfg.height || 220;
  const hp =
    cfg.hpos === "custom"
      ? { left: cfg.x ?? 160 }
      : cfg.hpos === "left"
        ? { left: 60 }
        : cfg.hpos === "right"
          ? { right: 60 }
          : { left: (1920 - w) / 2 };

  const showBrandCol = els.logo.visible || (els.churchName.visible && !!style.churchName);
  const keepSpace = cfg.layoutFlow === "keep-space";
  const logoOnRight = els.logo.position === "right";

  return (
    <div className="ov">
      <div
        key={`lt-bar-${enterKey}`}
        className={`ov-lt ov-lt-smooth ${entranceCls}`}
        style={{
          width: w,
          height: h,
          bottom: cfg.bottom ?? 80,
          ...hp,
          flexDirection: logoOnRight ? "row-reverse" : "row",
          borderRadius: cfg.radius ?? 16,
          padding: `${cfg.paddingY ?? 28}px ${cfg.paddingX ?? 40}px`,
          border: cfg.borderWidth ? `${cfg.borderWidth}px solid ${cfg.borderColor || "#2A3558"}` : "none",
          borderTop: cfg.accentBarHeight ? `${cfg.accentBarHeight}px solid ${cfg.accentBarColor || "#E8B84A"}` : undefined,
          boxShadow: cfg.boxShadow ? "0 20px 50px rgba(0,0,0,.45)" : "none",
          backdropFilter: cfg.backdropBlur && !perf ? `blur(${cfg.backdropBlur}px)` : undefined,
          animationDuration: `${cfg.transitionDuration || 300}ms`,
          overflow: "hidden",
          ...bgStyles,
        }}
      >
        <BackgroundCanvas
          type={cfg.bgMotion?.type}
          speed={cfg.bgMotion?.speed}
          intensity={cfg.bgMotion?.intensity}
          color={cfg.bgMotion?.color}
          paused={paused}
          performanceMode={perf}
          reduceMotion={redMotion}
        />

        {(showBrandCol || keepSpace) && (
          <div
            className="ov-brand"
            style={{
              position: "relative",
              zIndex: 2,
              visibility: showBrandCol ? "visible" : "hidden",
              borderRight: !logoOnRight ? "1px solid rgba(255,255,255,.16)" : "none",
              borderLeft: logoOnRight ? "1px solid rgba(255,255,255,.16)" : "none",
              paddingRight: !logoOnRight ? 24 : 0,
              paddingLeft: logoOnRight ? 24 : 0,
            }}
          >
            {els.logo.visible && (
              style.logo ? (
                <img
                  src={style.logo}
                  alt=""
                  className={logoAnimCls}
                  style={{
                    width: els.logo.size || 96,
                    height: els.logo.size || 96,
                    borderRadius: logoMaskRadius,
                    padding: els.logo.padding || 0,
                    opacity: (els.logo.opacity ?? 100) / 100,
                    objectFit: "contain",
                  }}
                />
              ) : (
                <span
                  className={`init ${logoAnimCls}`}
                  style={{
                    width: els.logo.size || 96,
                    height: els.logo.size || 96,
                    borderRadius: logoMaskRadius || 16,
                    opacity: (els.logo.opacity ?? 100) / 100,
                  }}
                >
                  {initials}
                </span>
              )
            )}
            {els.churchName.visible && style.churchName && (
              <span style={{ ...textElStyle(els.churchName, perf), fontSize: els.churchName.fontSize, textAlign: "center" }}>
                {style.churchName}
              </span>
            )}
          </div>
        )}

        {showWm && (
          <div
            className="ov-wm"
            style={{
              ...(WM_POS[els.watermark.position] || WM_POS["bottom-right"]),
              opacity: (els.watermark.opacity ?? 18) / 100,
              mixBlendMode: els.watermark.blend || "normal",
              zIndex: 1,
            }}
          >
            <img src={wmSrc} alt="" style={{ width: els.watermark.size || 48, height: els.watermark.size || 48, objectFit: "contain" }} />
          </div>
        )}

        {clearMode !== "clearText" && (
          <div
            key={`lt-content-${cKey}`}
            className={`ov-text ${contentTransCls}`}
            style={{ ...transVars, position: "relative", zIndex: 2, flex: "1 1 auto", minWidth: 0 }}
          >
            {sectionLabelBlock}
            {cfg.refPosition === "above" && (
              <>
                {refBlock}
                <DividerLine divider={els.divider} />
              </>
            )}
            {els.body.visible && (
              <FitText
                text={cfg.refPosition === "inline" && hasRefLine ? `${bodyText}  ${formattedRef}${showVerEl ? `${sep}${item.subtitle}` : ""}` : bodyText}
                el={els.body}
                lines={3}
                perfMode={perf}
                reduceMotion={redMotion}
              />
            )}
            {cfg.refPosition === "below" && (
              <>
                <DividerLine divider={els.divider} />
                {refBlock}
              </>
            )}
            {authorBlock}
            {customTextBlock}
          </div>
        )}
      </div>
    </div>
  );
}

export function PreviewFrame({ item, style, theme = null, assetsMap = {}, paused = false, performanceMode = false, reduceMotion = false }) {
  const wrap = useRef(null);
  const [scale, setScale] = useState(0.18);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const update = () => {
      if (el.clientWidth > 0) setScale(el.clientWidth / 1920);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="preview-box" ref={wrap}>
      <div className="preview-stage" style={{ transform: `scale(${scale})` }}>
        <OverlayStage
          item={item}
          style={style}
          theme={theme}
          assetsMap={assetsMap}
          paused={paused}
          performanceMode={performanceMode}
          reduceMotion={reduceMotion}
        />
      </div>
    </div>
  );
}
