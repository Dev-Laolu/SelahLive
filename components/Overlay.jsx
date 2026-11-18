"use client";
import { useLayoutEffect, useRef, useState, useEffect } from "react";

// 1920x1080 renderer. Shared by the real overlay page and the in-app preview.
const POS = { tl: { left: 48, top: 40 }, tc: { left: "50%", top: 40, transform: "translateX(-50%)" }, tr: { right: 48, top: 40 }, ml: { left: 48, top: "50%" }, mc: { left: "50%", top: "50%", transform: "translate(-50%,-50%)" }, mr: { right: 48, top: "50%" }, bl: { left: 48, bottom: 40 }, bc: { left: "50%", bottom: 40, transform: "translateX(-50%)" }, br: { right: 48, bottom: 40 } };

function FitText({ text, max, min, weight, lines, color, align, shadow }) {
  const ref = useRef(null);
  const [size, setSize] = useState(max);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    let s = max; el.style.fontSize = s + "px";
    const limit = (s2) => lines ? s2 * 1.18 * lines : Infinity;
    while (s > min && (el.scrollHeight > el.clientHeight + 1 || el.scrollHeight > limit(s) + 1)) { s -= 2; el.style.fontSize = s + "px"; }
    setSize(s);
  }, [text, max, min, lines]);
  return <div ref={ref} style={{ fontSize: size, fontWeight: weight, lineHeight: 1.18, color, textAlign: align, flex: "1 1 auto", minHeight: 0, overflow: "hidden", textShadow: shadow, whiteSpace: "pre-line" }}>{text}</div>;
}

export function OverlayStage({ item, style, animKey }) {
  const s = style;
  if (!item) return null;
  const fs = item.mode === "fullScreen";
  const isSong = item.kind === "song";
  const shadow = "0 2px 12px rgba(0,0,0,.5)";
  const initials = (s.churchName || "S").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const refLine = [item.title, item.subtitle].filter(Boolean).join(" · ");
  const anim = item.animation || s.entrance || "slide-up";
  const cls = `ov-anim-${anim}`;
  const dur = (s.speed || 400) + "ms";
  const bgCol = s.bg || "#0B1020";
  if (fs) {
    return (
      <div key={animKey} className={`ov ${cls}`} style={{ background: s.gradient ? `linear-gradient(135deg, ${bgCol}, ${bgCol}cc 50%, ${bgCol})` : bgCol, backgroundSize: "200% 200%", animationDuration: "500ms" }}>
        <div className={s.gradient ? "grad-drift" : ""} style={{ position: "absolute", inset: 0, background: s.gradient ? `linear-gradient(135deg, ${bgCol}, #ffffff12 50%, ${bgCol})` : "none", backgroundSize: "200% 200%" }} />
        <div className="ov-head">{s.logo ? <img src={s.logo} alt="" /> : <span className="ov-brand" style={{ border: 0, padding: 0, width: "auto" }}><span className="init" style={{ width: 56, height: 56, fontSize: 24 }}>{initials}</span></span>}<span>{s.churchName}</span></div>
        {s.watermark && <div className="ov-wm" style={{ ...POS[s.watermarkPos || "br"], opacity: (s.watermarkOpacity ?? 30) / 100 }}><img src={s.watermark} alt="" /></div>}
        <div className="ov-fs">
          {isSong && item.label && <span className="ov-pill">{item.label}</span>}
          <FitText text={item.body} max={isSong ? 84 : 96} min={36} weight={Math.max(s.weight, 800)} color={s.color} align="center" shadow={shadow} />
          <div className="ov-ref">{refLine}</div>
        </div>
      </div>
    );
  }
  const w = s.width || 1600, h = s.height || 220;
  const hp = s.hpos === "left" ? { left: 60 } : s.hpos === "right" ? { right: 60 } : { left: (1920 - w) / 2 };
  return (
    <div key={animKey} className="ov">
      <div className={`ov-lt ${cls}`} style={{ width: w, height: h, bottom: s.bottom ?? 80, ...hp, background: bgCol + "EB", animationDuration: dur }}>
        <div className="ov-brand">{s.logo ? <img src={s.logo} alt="" /> : <span className="init">{initials}</span>}<span style={{ fontSize: 18 }}>{s.churchName}</span></div>
        <div className="ov-text">
          {isSong && item.label && <div><span className="ov-pill" style={{ fontSize: 18 }}>{item.label}</span></div>}
          <FitText text={item.body} max={s.textSize || 52} min={26} weight={s.weight} lines={3} color={s.color} align={s.align} shadow={shadow} />
          <div className="ov-ref">{refLine}</div>
        </div>
      </div>
      {s.watermark && <div className="ov-wm" style={{ ...POS[s.watermarkPos || "br"], opacity: (s.watermarkOpacity ?? 30) / 100 }}><img src={s.watermark} alt="" /></div>}
    </div>
  );
}

// Scales the 1920x1080 stage into any container width. `item` null => nothing shown (transparent).
export function PreviewFrame({ item, style, bare }) {
  const wrap = useRef(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1920)); ro.observe(el); setScale(el.clientWidth / 1920);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="frame" ref={wrap} style={bare ? { background: "none", border: 0 } : undefined}>
      <div className="scaler" style={{ transform: `scale(${scale})` }}>
        <OverlayStage item={item} style={style} animKey={item ? item.title + item.body : "none"} />
      </div>
    </div>
  );
}
