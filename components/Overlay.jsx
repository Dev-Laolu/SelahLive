"use client";
import { useLayoutEffect, useRef, useState, useEffect } from "react";
import { createBaseLayout } from "@/lib/themes";

// 1920x1080 renderer. Shared by the real overlay page and the in-app preview / canvas editor.
const POS = {
  tl: { left: 48, top: 40 },
  tc: { left: "50%", top: 40, transform: "translateX(-50%)" },
  tr: { right: 48, top: 40 },
  ml: { left: 48, top: "50%", transform: "translateY(-50%)" },
  mc: { left: "50%", top: "50%", transform: "translate(-50%,-50%)" },
  mr: { right: 48, top: "50%", transform: "translateY(-50%)" },
  bl: { left: 48, bottom: 40 },
  bc: { left: "50%", bottom: 40, transform: "translateX(-50%)" },
  br: { right: 48, bottom: 40 },
};

function hexToRgba(hex, opacityPct = 100) {
  const clean = (hex || "#0B1020").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.slice(0, 6);
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const a = Math.max(0, Math.min(1, opacityPct / 100));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function buildBackgroundStyles(cfg, assetsMap = {}) {
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
      };
    }
  }
  if (cfg.bgType === "gradient" || cfg.bgType === "animated-gradient") {
    const stops = (cfg.gradientStops && cfg.gradientStops.length >= 2 ? cfg.gradientStops : [cfg.bgColor, "#1B2540"]).join(", ");
    const grad =
      cfg.gradientStyle === "radial"
        ? `radial-gradient(circle at center, ${stops})`
        : `linear-gradient(${cfg.gradientAngle ?? 135}deg, ${stops})`;
    return {
      background: grad,
      backgroundSize: cfg.bgType === "animated-gradient" ? "220% 220%" : "100% 100%",
      animation: cfg.bgType === "animated-gradient" ? `drift ${cfg.gradientSpeed || 20}s ease-in-out infinite alternate` : undefined,
      opacity: (cfg.bgOpacity ?? 100) / 100,
    };
  }
  return { background: hexToRgba(cfg.bgColor, cfg.bgOpacity) };
}

function FitText({ text, max, min, weight, lines, color, align, lineHeight, letterSpacing, fontFamily, uppercase, textShadow, outlineWidth, outlineColor, highlightBg, autoFit = true }) {
  const ref = useRef(null);
  const [size, setSize] = useState(max);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!autoFit) {
      setSize(max);
      el.style.fontSize = max + "px";
      return;
    }
    let s = max;
    el.style.fontSize = s + "px";
    const lh = lineHeight || 1.18;
    const limit = (s2) => (lines ? s2 * lh * lines : Infinity);
    while (s > min && (el.scrollHeight > el.clientHeight + 2 || el.scrollHeight > limit(s) + 2)) {
      s -= 2;
      el.style.fontSize = s + "px";
    }
    setSize(s);
  }, [text, max, min, lines, lineHeight, autoFit]);

  return (
    <div
      ref={ref}
      style={{
        fontSize: size,
        fontWeight: weight,
        lineHeight: lineHeight || 1.18,
        letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
        fontFamily,
        textTransform: uppercase ? "uppercase" : undefined,
        color,
        textAlign: align,
        flex: "1 1 auto",
        minHeight: 0,
        overflow: "hidden",
        textShadow,
        WebkitTextStroke: outlineWidth ? `${outlineWidth}px ${outlineColor || "#000"}` : undefined,
        whiteSpace: "pre-line",
      }}
    >
      {highlightBg ? (
        <span style={{ background: highlightBg, padding: "4px 12px", borderRadius: 8, boxDecorationBreak: "clone" }}>{text}</span>
      ) : (
        text
      )}
    </div>
  );
}

export function OverlayStage({ item, style = {}, theme = null, assetsMap = {}, enterKey = 0, contentKey = 0, animKey }) {
  if (!item) return null;
  const fs = item.mode === "fullScreen";
  const isSong = item.kind === "song";
  const clearMode = item.clearMode || "none";

  // Blackout screen (V1.1 §3.6 Tier 1 #6)
  if (clearMode === "blackout") {
    return <div className="ov ov-content-fade" style={{ background: "#000000" }} />;
  }

  // Merge theme layout with legacy style fields
  const activeTheme = theme || item.theme || null;
  const baseCfg = createBaseLayout(fs);
  const cfg = activeTheme
    ? { ...baseCfg, ...(fs ? activeTheme.fullScreen : activeTheme.lowerThird) }
    : {
        ...baseCfg,
        width: style.width || baseCfg.width,
        height: style.height || baseCfg.height,
        bottom: style.bottom ?? baseCfg.bottom,
        hpos: style.hpos || baseCfg.hpos,
        fontSize: fs ? (isSong ? 84 : 96) : style.textSize || baseCfg.fontSize,
        weight: style.weight || baseCfg.weight,
        textColor: style.color || baseCfg.textColor,
        align: fs ? "center" : style.align || baseCfg.align,
        bgColor: style.bg || baseCfg.bgColor,
        bgType: style.gradient ? "animated-gradient" : "solid",
        entrance: style.entrance || baseCfg.entrance,
        transitionDuration: style.speed || baseCfg.transitionDuration,
      };

  const bgStyles = buildBackgroundStyles(cfg, assetsMap);
  const initials = (style.churchName || "S").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const sep = cfg.refSeparator || " · ";
  const refParts = [item.title, cfg.showVersion !== false ? item.subtitle : ""].filter(Boolean);
  const refLine = refParts.join(sep);

  const shadowParts = [];
  if (cfg.textShadow) shadowParts.push(`0 ${cfg.textShadowOffsetY ?? 2}px ${cfg.textShadowBlur ?? 12}px ${cfg.textShadowColor || "rgba(0,0,0,.55)"}`);
  if (cfg.textGlow) shadowParts.push(`0 0 22px ${cfg.textGlowColor || "#E8B84A"}`);
  const textShadow = shadowParts.join(", ") || "none";

  const entranceCls = `ov-anim-${item.animation || cfg.entrance || "slide-up"}`;
  const contentTransCls = `ov-content-${item.transition || cfg.contentTransition || "fade"}`;
  const cKey = contentKey || animKey || (item.title + item.body);
  const transVars = {
    "--tdur": `${item.transitionDuration || cfg.transitionDuration || (fs ? 400 : 250)}ms`,
    "--tease": item.transitionEasing || cfg.transitionEasing || "ease-out",
  };

  // Logo screen (church logo centered on background)
  if (clearMode === "logoScreen") {
    return (
      <div className="ov ov-content-fade" style={bgStyles}>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
          {style.logo ? (
            <img src={style.logo} alt="" style={{ maxWidth: 360, maxHeight: 360, objectFit: "contain" }} />
          ) : (
            <div className="ov-brand" style={{ border: 0, padding: 0, width: "auto" }}>
              <span className="init" style={{ width: 180, height: 180, fontSize: 72, borderRadius: 36 }}>{initials}</span>
            </div>
          )}
          {cfg.showChurchName && (
            <div style={{ fontSize: 52, fontWeight: 700, fontFamily: cfg.fontFamily, color: cfg.textColor, textShadow }}>{style.churchName}</div>
          )}
        </div>
      </div>
    );
  }

  const refBlock = refLine && clearMode !== "clearText" && (
    <div
      className="ov-ref"
      style={{
        color: cfg.refColor || "#E8B84A",
        fontFamily: cfg.fontFamily,
        borderTop: !fs && cfg.refPosition === "below" ? "1px solid rgba(255,255,255,.22)" : "none",
        borderBottom: !fs && cfg.refPosition === "above" ? "1px solid rgba(255,255,255,.22)" : "none",
        paddingBottom: !fs && cfg.refPosition === "above" ? 8 : undefined,
        marginBottom: !fs && cfg.refPosition === "above" ? 8 : undefined,
        marginTop: !fs && cfg.refPosition === "above" ? 0 : undefined,
        transform: cfg.refOffsetX || cfg.refOffsetY ? `translate(${cfg.refOffsetX}px, ${cfg.refOffsetY}px)` : undefined,
      }}
    >
      {item.title}
      {cfg.showVersion !== false && item.subtitle && (
        <span style={{ color: cfg.versionColor || cfg.refColor || "#E8B84A" }}>
          {item.title ? sep : ""}
          {item.subtitle}
        </span>
      )}
    </div>
  );

  if (fs) {
    return (
      <div key={`fs-shell-${enterKey}`} className={`ov ${entranceCls}`} style={{ ...bgStyles, animationDuration: `${cfg.transitionDuration || 400}ms` }}>
        {cfg.backdropBlur > 0 && <div style={{ position: "absolute", inset: 0, backdropFilter: `blur(${cfg.backdropBlur}px)` }} />}
        {(cfg.showLogo || cfg.showChurchName) && (
          <div className="ov-head" style={{ left: cfg.logoX ?? 48, top: cfg.logoY ?? 40 }}>
            {cfg.showLogo && (style.logo ? <img src={style.logo} alt="" style={{ width: cfg.logoSize || 56, height: cfg.logoSize || 56 }} /> : <span className="ov-brand" style={{ border: 0, padding: 0, width: "auto" }}><span className="init" style={{ width: cfg.logoSize || 56, height: cfg.logoSize || 56, fontSize: Math.round((cfg.logoSize || 56) * 0.44) }}>{initials}</span></span>)}
            {cfg.showChurchName && <span>{style.churchName}</span>}
          </div>
        )}
        {style.watermark && (
          <div className="ov-wm" style={{ ...POS[style.watermarkPos || "br"], opacity: (style.watermarkOpacity ?? 30) / 100 }}>
            <img src={style.watermark} alt="" />
          </div>
        )}
        {clearMode !== "clearText" && (
          <div
            key={`fs-content-${cKey}`}
            className={`ov-fs ${contentTransCls}`}
            style={{
              ...transVars,
              padding: `${cfg.paddingY ?? 140}px ${cfg.paddingX ?? 180}px`,
              transform: cfg.textOffsetX || cfg.textOffsetY ? `translate(${cfg.textOffsetX}px, ${cfg.textOffsetY}px)` : undefined,
            }}
          >
            {isSong && item.label && <span className="ov-pill" style={{ color: cfg.labelColor || "#E8B84A" }}>{item.label}</span>}
            {cfg.refPosition === "above" && refBlock}
            <FitText
              text={item.body}
              max={cfg.fontSize || (isSong ? 84 : 96)}
              min={cfg.minFontSize || 36}
              weight={Math.max(cfg.weight || 800, 700)}
              color={cfg.textColor || "#FFFFFF"}
              align={cfg.align || "center"}
              lineHeight={cfg.lineHeight}
              letterSpacing={cfg.letterSpacing}
              fontFamily={cfg.fontFamily}
              uppercase={cfg.uppercase}
              textShadow={textShadow}
              outlineWidth={cfg.textOutlineWidth}
              outlineColor={cfg.textOutlineColor}
              highlightBg={cfg.textHighlightBg}
              autoFit={cfg.autoFit}
            />
            {cfg.refPosition !== "above" && refBlock}
          </div>
        )}
      </div>
    );
  }

  // Lower Third
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
          borderRadius: cfg.radius ?? 16,
          padding: `${cfg.paddingY ?? 28}px ${cfg.paddingX ?? 40}px`,
          border: cfg.borderWidth ? `${cfg.borderWidth}px solid ${cfg.borderColor || "#2A3558"}` : "none",
          borderTop: cfg.accentBarHeight ? `${cfg.accentBarHeight}px solid ${cfg.accentBarColor || "#E8B84A"}` : undefined,
          boxShadow: cfg.boxShadow ? "0 20px 50px rgba(0,0,0,.45)" : "none",
          backdropFilter: cfg.backdropBlur ? `blur(${cfg.backdropBlur}px)` : undefined,
          animationDuration: `${cfg.transitionDuration || 400}ms`,
          ...bgStyles,
        }}
      >
        {(cfg.showLogo || cfg.showChurchName) && (
          <div className="ov-brand">
            {cfg.showLogo && (style.logo ? <img src={style.logo} alt="" style={{ width: cfg.logoSize || 96, height: cfg.logoSize || 96 }} /> : <span className="init" style={{ width: cfg.logoSize || 96, height: cfg.logoSize || 96 }}>{initials}</span>)}
            {cfg.showChurchName && <span style={{ fontSize: 18 }}>{style.churchName}</span>}
          </div>
        )}
        {clearMode !== "clearText" && (
          <div
            key={`lt-content-${cKey}`}
            className={`ov-text ${contentTransCls}`}
            style={{
              ...transVars,
              transform: cfg.textOffsetX || cfg.textOffsetY ? `translate(${cfg.textOffsetX}px, ${cfg.textOffsetY}px)` : undefined,
            }}
          >
            {isSong && item.label && (
              <div>
                <span className="ov-pill" style={{ fontSize: 18, color: cfg.labelColor || "#E8B84A" }}>{item.label}</span>
              </div>
            )}
            {cfg.refPosition === "above" && refBlock}
            <FitText
              text={item.body}
              max={cfg.fontSize || 52}
              min={cfg.minFontSize || 26}
              weight={cfg.weight || 800}
              lines={3}
              color={cfg.textColor || "#FFFFFF"}
              align={cfg.align || "left"}
              lineHeight={cfg.lineHeight}
              letterSpacing={cfg.letterSpacing}
              fontFamily={cfg.fontFamily}
              uppercase={cfg.uppercase}
              textShadow={textShadow}
              outlineWidth={cfg.textOutlineWidth}
              outlineColor={cfg.textOutlineColor}
              highlightBg={cfg.textHighlightBg}
              autoFit={cfg.autoFit}
            />
            {cfg.refPosition !== "above" && refBlock}
          </div>
        )}
      </div>
      {style.watermark && (
        <div className="ov-wm" style={{ ...POS[style.watermarkPos || "br"], opacity: (style.watermarkOpacity ?? 30) / 100 }}>
          <img src={style.watermark} alt="" />
        </div>
      )}
    </div>
  );
}

// Scales the 1920x1080 stage into any container width. `item` null => nothing shown (transparent).
export function PreviewFrame({ item, style, theme, assetsMap, bare, children }) {
  const wrap = useRef(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1920));
    ro.observe(el);
    setScale(el.clientWidth / 1920);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="frame" ref={wrap} style={bare ? { background: "none", border: 0 } : undefined}>
      <div className="scaler" style={{ transform: `scale(${scale})` }}>
        <OverlayStage item={item} style={style} theme={theme} assetsMap={assetsMap} contentKey={item ? item.title + item.body + (item.clearMode || "") : "none"} />
      </div>
      {children}
    </div>
  );
}
