"use client";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Select from "@/components/Select";
import { PreviewFrame } from "@/components/Overlay";
import { useApp } from "@/lib/store";
import { SAMPLE_VERSE } from "@/lib/defaults";
import {
  CURATED_FONTS,
  TRANSITION_TYPES,
  EASING_TYPES,
  BG_TYPES,
  FIT_MODES,
  REF_POSITIONS,
  DEFAULT_BRAND_SWATCHES,
  createBaseLayout,
  validateTheme,
  generateTemplatePng,
} from "@/lib/themes";
import { useToast } from "@/components/Toast";

const readDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
const MAX_BG_BYTES = 1024 * 1024; // 1 MB hard max (V1.1 §3.4)
const MAX_DIM = 4096;

function Card({ title, children, open }) {
  return (
    <details className="card coll" open={open}>
      <summary>{title}<Icon name="down" size={18} /></summary>
      <div className="col">{children}</div>
    </details>
  );
}

function Slider({ label, value, min, max, step = 1, unit = "", onChange }) {
  return (
    <div className="field">
      <div className="row between">
        <label>{label}</label>
        <span className="mono muted" style={{ fontSize: 12 }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </div>
  );
}

function ColorInput({ label, value, onChange, swatches = DEFAULT_BRAND_SWATCHES }) {
  const pickEye = async () => {
    if (typeof window !== "undefined" && "EyeDropper" in window) {
      try {
        const ed = new window.EyeDropper();
        const res = await ed.open();
        if (res?.sRGBHex) onChange(res.sRGBHex.toUpperCase());
      } catch {}
    }
  };
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <div className="swatches" style={{ marginBottom: 6 }}>
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            className="sw"
            aria-label={c}
            aria-pressed={(value || "").toLowerCase() === c.toLowerCase()}
            style={{ background: c, width: 26, height: 26 }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <input type="color" aria-label={label || "Pick colour"} value={value || "#0B1020"} onChange={(e) => onChange(e.target.value.toUpperCase())} style={{ width: 40, height: 40, border: 0, background: "none", cursor: "pointer" }} />
        <input className="input mono" style={{ minHeight: 40 }} value={value || ""} onChange={(e) => /^#[0-9a-f]{0,8}$/i.test(e.target.value) && onChange(e.target.value.toUpperCase())} aria-label="Hex colour" />
        {typeof window !== "undefined" && "EyeDropper" in window && (
          <button type="button" className="btn btn-secondary btn-sm" title="Eyedropper" onClick={pickEye}>Pick</button>
        )}
      </div>
    </div>
  );
}

function LogoCropModal({ src, onCancel, onApply }) {
  const dlgRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  useEffect(() => {
    const dlg = dlgRef.current;
    if (!dlg) return;
    if (src && !dlg.open) dlg.showModal();
    if (!src && dlg.open) dlg.close();
  }, [src]);

  useEffect(() => {
    const dlg = dlgRef.current;
    if (!dlg) return;
    const handleClose = () => { dlg.returnValue = ""; onCancel?.(); };
    dlg.addEventListener("close", handleClose);
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      const handleClick = (event) => {
        if (event.target !== dlg) return;
        const rect = dlg.getBoundingClientRect();
        const inside = rect.top <= event.clientY && event.clientY <= rect.top + rect.height && rect.left <= event.clientX && event.clientX <= rect.left + rect.width;
        if (!inside) dlg.close();
      };
      dlg.addEventListener("click", handleClick);
      return () => { dlg.removeEventListener("close", handleClose); dlg.removeEventListener("click", handleClick); };
    }
    return () => dlg.removeEventListener("close", handleClose);
  }, [onCancel]);

  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => { imgRef.current = img; setZoom(1); setOffsetX(0); setOffsetY(0); draw(img, 1, 0, 0); };
    img.src = src;
  }, [src]);

  const draw = (img, z, ox, oy) => {
    const c = canvasRef.current;
    if (!c || !img) return;
    const ctx = c.getContext("2d");
    const size = 256;
    ctx.clearRect(0, 0, size, size);
    const scale = Math.max(size / img.width, size / img.height) * z;
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2 + ox, (size - h) / 2 + oy, w, h);
  };

  useEffect(() => { if (imgRef.current) draw(imgRef.current, zoom, offsetX, offsetY); }, [zoom, offsetX, offsetY]);

  return (
    <dialog ref={dlgRef} className="native-dialog" closedby="any" aria-labelledby="crop-logo-title">
      <div className="col" style={{ gap: 14 }}>
        <div className="row between">
          <h2 id="crop-logo-title" style={{ fontSize: 20 }}>Crop church logo</h2>
          <button type="button" className="iconbtn" aria-label="Close" onClick={() => dlgRef.current?.close()}><Icon name="x" size={20} /></button>
        </div>
        <div style={{ display: "grid", placeItems: "center", background: "var(--bg)", padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
          <canvas ref={canvasRef} width={256} height={256} style={{ width: 192, height: 192, borderRadius: 16, border: "2px solid var(--gold)" }} />
        </div>
        <Slider label="Zoom" value={Math.round(zoom * 100)} min={50} max={250} step={5} unit="%" onChange={(v) => setZoom(v / 100)} />
        <div className="grid2">
          <Slider label="Horizontal offset" value={offsetX} min={-120} max={120} step={4} unit=" px" onChange={setOffsetX} />
          <Slider label="Vertical offset" value={offsetY} min={-120} max={120} step={4} unit=" px" onChange={setOffsetY} />
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={() => dlgRef.current?.close()}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => { const out = canvasRef.current?.toDataURL("image/png"); if (out) onApply(out); dlgRef.current?.close(); }}>Apply crop</button>
        </div>
      </div>
    </dialog>
  );
}

export default function DisplayPage() {
  const {
    style, saveStyle,
    themes, activeThemeIds, saveTheme, deleteTheme, selectThemeForSlot,
    assetsMap, saveAsset,
  } = useApp();
  const toast = useToast();

  const [selectedThemeId, setSelectedThemeId] = useState(activeThemeIds.scripture || "default-scripture");
  const activeThemeObj = themes.find((t) => t.id === selectedThemeId) || themes[0];
  const [themeDraft, setThemeDraft] = useState(activeThemeObj);
  const [styleDraft, setStyleDraft] = useState(style);
  const [editMode, setEditMode] = useState("lowerThird"); // lowerThird | fullScreen
  const [dirty, setDirty] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [snapGrid, setSnapGrid] = useState(true);
  const [cropSrc, setCropSrc] = useState(null);
  const [bgCheck, setBgCheck] = useState(null); // { width, height, sizeBytes, format, aspectWarn }
  const [bgErr, setBgErr] = useState("");
  const [customFonts, setCustomFonts] = useState([]);

  // Undo / Redo history for theme edits
  const historyRef = useRef([]);
  const futureRef = useRef([]);
  const importRef = useRef(null);

  useEffect(() => {
    if (!dirty) {
      const found = themes.find((t) => t.id === selectedThemeId) || themes[0];
      if (found) setThemeDraft(found);
      setStyleDraft(style);
    }
  }, [selectedThemeId, themes, style]); // eslint-disable-line

  const cfg = editMode === "fullScreen" ? themeDraft.fullScreen : themeDraft.lowerThird;

  const updateTheme = (updater) => {
    historyRef.current = [...historyRef.current.slice(-25), themeDraft];
    futureRef.current = [];
    setThemeDraft((prev) => (typeof updater === "function" ? updater(prev) : { ...prev, ...updater }));
    setDirty(true);
  };

  const setCfg = (patch) => {
    updateTheme((prev) => ({
      ...prev,
      [editMode]: { ...prev[editMode], ...patch },
    }));
  };

  const setBrand = (patch) => {
    setStyleDraft((s) => ({ ...s, ...patch }));
    setDirty(true);
  };

  const undo = () => {
    if (!historyRef.current.length) return;
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    futureRef.current = [themeDraft, ...futureRef.current];
    setThemeDraft(prev);
    setDirty(true);
  };

  const redo = () => {
    if (!futureRef.current.length) return;
    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    historyRef.current = [...historyRef.current, themeDraft];
    setThemeDraft(next);
    setDirty(true);
  };

  const handleSave = async () => {
    const saved = await saveTheme(themeDraft);
    selectThemeForSlot(saved.slot, saved.id);
    saveStyle(styleDraft);
    setDirty(false);
    toast(`Saved theme "${saved.name}".`);
  };

  const handleCreateTheme = async () => {
    const id = "theme-" + Date.now();
    const fresh = {
      version: 1,
      id,
      name: `Custom Theme ${themes.length + 1}`,
      slot: themeDraft.slot || "scripture",
      lowerThird: createBaseLayout(false),
      fullScreen: createBaseLayout(true),
    };
    await saveTheme(fresh);
    setSelectedThemeId(id);
    setThemeDraft(fresh);
    setDirty(false);
    toast("Created new theme.");
  };

  const handleDuplicateTheme = async () => {
    const id = "theme-" + Date.now();
    const copy = { ...JSON.parse(JSON.stringify(themeDraft)), id, name: `${themeDraft.name} (Copy)` };
    await saveTheme(copy);
    setSelectedThemeId(id);
    setThemeDraft(copy);
    setDirty(false);
    toast("Theme duplicated.");
  };

  const handleDeleteTheme = async () => {
    if (themeDraft.id.startsWith("default-")) return;
    await deleteTheme(themeDraft.id);
    setSelectedThemeId("default-scripture");
    setDirty(false);
    toast("Theme deleted.");
  };

  const handleExportTheme = () => {
    const blob = new Blob([JSON.stringify(themeDraft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${themeDraft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.selah-theme.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportTheme = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const parsed = validateTheme(JSON.parse(await f.text()));
      parsed.id = "theme-" + Date.now();
      await saveTheme(parsed);
      setSelectedThemeId(parsed.id);
      setThemeDraft(parsed);
      setDirty(false);
      toast(`Imported theme "${parsed.name}".`);
    } catch (er) {
      toast(er.message || "Invalid theme JSON file.");
    }
    e.target.value = "";
  };

  // Background image upload with strict validation, EXIF stripping, size guide & checklist (V1.1 §3.4)
  const recWidth = editMode === "fullScreen" ? 1920 : cfg.width || 1600;
  const recHeight = editMode === "fullScreen" ? 1080 : cfg.height || 220;

  const handleBgImageUpload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    setBgErr("");
    setBgCheck(null);
    if (!f) return;

    // 1. Format allowlist: PNG, JPEG, WebP only — NO SVG!
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      setBgErr("Only PNG, JPEG, or WebP images are allowed for backgrounds (SVG is disallowed for security).");
      return;
    }

    // 2. Hard 1 MB max
    if (f.size > MAX_BG_BYTES) {
      setBgErr(`This image is ${(f.size / 1048576).toFixed(2)} MB. Max is 1 MB. Try exporting as JPEG or WebP.`);
      return;
    }

    try {
      const rawUrl = await readDataUrl(f);
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error("Could not decode image."));
        im.src = rawUrl;
      });
      if (img.width > MAX_DIM || img.height > MAX_DIM) {
        setBgErr(`Image dimensions (${img.width}×${img.height}) exceed the 4096 px maximum.`);
        return;
      }

      // Re-encode via canvas to strip EXIF metadata
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const cleanMime = f.type === "image/png" ? "image/png" : f.type === "image/webp" ? "image/webp" : "image/jpeg";
      const cleanDataUrl = canvas.toDataURL(cleanMime, cleanMime === "image/png" ? undefined : 0.9);
      const approxBytes = Math.round((cleanDataUrl.length * 3) / 4);

      const rec = await saveAsset({
        dataUrl: cleanDataUrl,
        mime: cleanMime,
        width: img.width,
        height: img.height,
        sizeBytes: approxBytes,
      });

      const targetRatio = recWidth / recHeight;
      const imgRatio = img.width / img.height;
      const aspectWarn = Math.abs(targetRatio - imgRatio) / targetRatio > 0.18;

      setBgCheck({
        width: img.width,
        height: img.height,
        sizeBytes: f.size,
        format: cleanMime.replace("image/", "").toUpperCase(),
        aspectWarn,
      });

      setCfg({
        bgType: "image",
        bgImageAssetId: rec.assetId,
        bgImageDataUrl: cleanDataUrl,
      });
      toast("Background image uploaded and synced to overlay.");
    } catch (er) {
      setBgErr(er.message || "Failed to process image.");
    }
  };

  // Upload custom WOFF2 font (max 500 KB, V1.1 §3.5b)
  const handleFontUpload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".woff2")) {
      toast("Please upload a .woff2 font file.");
      return;
    }
    if (f.size > 500 * 1024) {
      toast("Font file must be 500 KB or smaller.");
      return;
    }
    try {
      const buf = await f.arrayBuffer();
      const fontName = f.name.replace(/\.woff2$/i, "").replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 40) || "CustomFont";
      const face = new FontFace(fontName, buf);
      await face.load();
      document.fonts.add(face);
      const fam = `"${fontName}", sans-serif`;
      setCustomFonts((list) => [...list.filter((x) => x.value !== fam), { value: fam, label: `${fontName} (Uploaded)` }]);
      setCfg({ fontFamily: fam });
      toast(`Loaded custom font "${fontName}".`);
    } catch {
      toast("Could not load that WOFF2 font.");
    }
  };

  const handleLogoUpload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast("Image is larger than 2 MB."); return; }
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      toast("Please upload PNG, JPEG, or WebP for your church logo.");
      return;
    }
    setCropSrc(await readDataUrl(f));
  };

  const handleWatermarkUpload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast("Image is larger than 2 MB."); return; }
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      toast("Please upload PNG, JPEG, or WebP for your watermark.");
      return;
    }
    setBrand({ watermark: await readDataUrl(f) });
  };

  // Interactive WYSIWYG drag & resize for Lower Third bar on the 16:9 canvas (V1.1 §3.2)
  const canvasWrapRef = useRef(null);
  const startDrag = (kind) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = cfg.width || 1600;
    const origH = cfg.height || 220;
    const origBottom = cfg.bottom ?? 80;
    const origLeft = cfg.hpos === "custom" ? cfg.x : cfg.hpos === "left" ? 60 : cfg.hpos === "right" ? 1920 - origW - 60 : (1920 - origW) / 2;

    const snap = (v) => (snapGrid ? Math.round(v / 10) * 10 : Math.round(v));

    const onMove = (mv) => {
      const dx = (mv.clientX - startX) * scaleX;
      const dy = (mv.clientY - startY) * scaleY;
      if (kind === "move") {
        const nextX = Math.max(0, Math.min(1920 - origW, snap(origLeft + dx)));
        const nextBottom = Math.max(0, Math.min(1080 - origH, snap(origBottom - dy)));
        setCfg({ hpos: "custom", x: nextX, bottom: nextBottom });
      } else if (kind === "resize") {
        const nextW = Math.max(600, Math.min(1920 - origLeft, snap(origW + dx)));
        const nextH = Math.max(120, Math.min(540, snap(origH + dy)));
        setCfg({ width: nextW, height: nextH });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const previewItem = { ...SAMPLE_VERSE, mode: editMode, theme: themeDraft };
  const barLeftPct = ((cfg.hpos === "custom" ? cfg.x : cfg.hpos === "left" ? 60 : cfg.hpos === "right" ? 1920 - cfg.width - 60 : (1920 - cfg.width) / 2) / 1920) * 100;
  const barWidthPct = ((cfg.width || 1600) / 1920) * 100;
  const barHeightPct = ((cfg.height || 220) / 1080) * 100;
  const barBottomPct = ((cfg.bottom ?? 80) / 1080) * 100;

  return (
    <AppShell preview={false}>
      {/* Theme Manager Toolbar */}
      <div className="row between wrap">
        <div>
          <h1 className="page-title">Display & Overlay Designer</h1>
          <span className="muted" style={{ fontSize: 13 }}>Design Lower Third & Full Screen themes with custom backgrounds, typography, and transitions.</span>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Select
            ariaLabel="Active theme"
            style={{ width: 240 }}
            value={selectedThemeId}
            onChange={(id) => { setSelectedThemeId(id); setDirty(false); }}
            options={themes.map((t) => ({ value: t.id, label: t.name, sub: t.slot }))}
          />
          <button className="btn btn-secondary btn-sm" onClick={handleCreateTheme}><Icon name="plus" size={14} />New</button>
          <button className="btn btn-secondary btn-sm" onClick={handleDuplicateTheme}><Icon name="copy" size={14} />Duplicate</button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportTheme}><Icon name="download" size={14} />Export</button>
          <button className="btn btn-secondary btn-sm" onClick={() => importRef.current?.click()}><Icon name="upload" size={14} />Import</button>
          <input ref={importRef} type="file" accept=".json" hidden onChange={handleImportTheme} />
          {!themeDraft.id.startsWith("default-") && (
            <button className="btn btn-danger btn-sm" onClick={handleDeleteTheme}><Icon name="trash" size={14} /></button>
          )}
        </div>
      </div>

      <div className="two" style={{ gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)" }}>
        {/* Left Controls */}
        <div className="col">
          <Card title="Theme & Layout" open>
            <div className="grid2">
              <div className="field">
                <label htmlFor="th-name">Theme name</label>
                <input id="th-name" className="input" value={themeDraft.name} onChange={(e) => updateTheme({ name: e.target.value })} />
              </div>
              <div className="field">
                <label>Content slot</label>
                <Select
                  ariaLabel="Theme slot"
                  value={themeDraft.slot}
                  onChange={(v) => updateTheme({ slot: v })}
                  options={[
                    { value: "scripture", label: "Scripture" },
                    { value: "songs", label: "Songs" },
                    { value: "text", label: "Free Text" },
                  ]}
                />
              </div>
            </div>
            <div className="seg" role="group" aria-label="Edit layout">
              <button aria-pressed={editMode === "lowerThird"} onClick={() => setEditMode("lowerThird")}>Lower third</button>
              <button aria-pressed={editMode === "fullScreen"} onClick={() => setEditMode("fullScreen")}>Full screen</button>
            </div>
            {editMode === "lowerThird" && (
              <>
                <div className="grid2">
                  <Slider label="Width" value={cfg.width} min={600} max={1920} step={10} unit=" px" onChange={(v) => setCfg({ width: v })} />
                  <Slider label="Height" value={cfg.height} min={120} max={540} step={10} unit=" px" onChange={(v) => setCfg({ height: v })} />
                </div>
                <div className="grid2">
                  <Slider label="Bottom margin" value={cfg.bottom} min={0} max={400} step={10} unit=" px" onChange={(v) => setCfg({ bottom: v })} />
                  <Slider label="Corner radius" value={cfg.radius} min={0} max={60} step={2} unit=" px" onChange={(v) => setCfg({ radius: v })} />
                </div>
                <div className="field">
                  <label>Horizontal align</label>
                  <div className="seg">
                    {["left", "center", "right"].map((p) => (
                      <button key={p} aria-pressed={cfg.hpos === p} onClick={() => setCfg({ hpos: p })} style={{ textTransform: "capitalize" }}>{p}</button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="grid2">
              <Slider label="Padding X" value={cfg.paddingX} min={0} max={240} step={4} unit=" px" onChange={(v) => setCfg({ paddingX: v })} />
              <Slider label="Padding Y" value={cfg.paddingY} min={0} max={200} step={4} unit=" px" onChange={(v) => setCfg({ paddingY: v })} />
            </div>
          </Card>

          <Card title="Background & Image" open>
            <div className="field">
              <label>Background type</label>
              <Select ariaLabel="Background type" value={cfg.bgType} onChange={(v) => setCfg({ bgType: v })} options={BG_TYPES} />
            </div>

            {cfg.bgType !== "none" && (
              <Slider label="Background opacity" value={cfg.bgOpacity} min={0} max={100} unit="%" onChange={(v) => setCfg({ bgOpacity: v })} />
            )}

            {(cfg.bgType === "solid" || cfg.bgType === "image") && (
              <ColorInput label="Background colour" value={cfg.bgColor} onChange={(c) => setCfg({ bgColor: c })} />
            )}

            {(cfg.bgType === "gradient" || cfg.bgType === "animated-gradient") && (
              <div className="col" style={{ gap: 10 }}>
                <div className="seg">
                  <button aria-pressed={cfg.gradientStyle === "linear"} onClick={() => setCfg({ gradientStyle: "linear" })}>Linear</button>
                  <button aria-pressed={cfg.gradientStyle === "radial"} onClick={() => setCfg({ gradientStyle: "radial" })}>Radial</button>
                </div>
                {cfg.gradientStyle === "linear" && (
                  <Slider label="Angle" value={cfg.gradientAngle} min={0} max={360} step={5} unit="°" onChange={(v) => setCfg({ gradientAngle: v })} />
                )}
                {cfg.bgType === "animated-gradient" && (
                  <Slider label="Animation cycle" value={cfg.gradientSpeed} min={6} max={45} step={1} unit=" s" onChange={(v) => setCfg({ gradientSpeed: v })} />
                )}
                <div className="col" style={{ gap: 6 }}>
                  <div className="row between">
                    <span className="label">Gradient stops ({cfg.gradientStops.length})</span>
                    {cfg.gradientStops.length < 5 && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCfg({ gradientStops: [...cfg.gradientStops, "#1B2540"] })}>+ Add stop</button>
                    )}
                  </div>
                  <div className="row wrap" style={{ gap: 8 }}>
                    {cfg.gradientStops.map((st, idx) => (
                      <div key={idx} className="row" style={{ gap: 4 }}>
                        <input
                          type="color"
                          value={st}
                          aria-label={`Gradient stop ${idx + 1}`}
                          onChange={(e) => {
                            const next = [...cfg.gradientStops];
                            next[idx] = e.target.value.toUpperCase();
                            setCfg({ gradientStops: next });
                          }}
                          style={{ width: 36, height: 36, border: 0, background: "none", cursor: "pointer" }}
                        />
                        {cfg.gradientStops.length > 2 && (
                          <button type="button" className="iconbtn" style={{ width: 24, height: 24 }} aria-label="Remove stop" onClick={() => setCfg({ gradientStops: cfg.gradientStops.filter((_, i) => i !== idx) })}>
                            <Icon name="x" size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {cfg.bgType === "image" && (
              <div className="col" style={{ gap: 10 }}>
                {/* Size guide & Download Template button (V1.1 §3.4) */}
                <div className="card raised col" style={{ padding: 12, gap: 6 }}>
                  <div className="row between">
                    <b style={{ fontSize: 13 }}>Image size guide</b>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        const url = generateTemplatePng(recWidth, recHeight, editMode === "fullScreen" ? "Full Screen" : "Lower Third");
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `selah-${editMode}-${recWidth}x${recHeight}-template.png`;
                        a.click();
                      }}
                    >
                      <Icon name="download" size={14} />Download template
                    </button>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Recommended: <b className="gold">{recWidth} × {recHeight} px</b> · PNG, JPEG, or WebP only (no SVG) · Max <b className="gold">1 MB</b> ({editMode === "lowerThird" ? "≤500 KB recommended" : "up to 1 MB"}).
                  </div>
                </div>

                <label className="drop" style={{ minHeight: 84 }}>
                  <div>
                    <Icon name="upload" size={22} className="gold" />
                    <div style={{ fontSize: 13 }}>{cfg.bgImageAssetId ? "Replace background image" : "Upload PNG, JPEG, or WebP background"}</div>
                  </div>
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleBgImageUpload} />
                </label>

                {bgErr && <div className="banner bad" style={{ fontSize: 12 }}><Icon name="alertc" size={16} />{bgErr}</div>}

                {bgCheck && (
                  <div className="card raised col" style={{ padding: 10, gap: 4, fontSize: 12 }}>
                    <div>{bgCheck.aspectWarn ? "⚠️" : "✅"} Dimensions: {bgCheck.width} × {bgCheck.height} px {bgCheck.aspectWarn ? "(aspect ratio differs — adjust Fit mode)" : ""}</div>
                    <div>✅ Size: {(bgCheck.sizeBytes / 1024).toFixed(0)} KB (within 1 MB limit)</div>
                    <div>✅ Format: {bgCheck.format} (metadata stripped)</div>
                  </div>
                )}

                {cfg.bgImageAssetId && (
                  <div className="row between">
                    <Select ariaLabel="Image fit mode" className="grow" value={cfg.bgFit} onChange={(v) => setCfg({ bgFit: v })} options={FIT_MODES} />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setCfg({ bgImageAssetId: "", bgImageDataUrl: "", bgType: "solid" }); setBgCheck(null); }}>Remove</button>
                  </div>
                )}
              </div>
            )}

            <div className="grid2">
              <Slider label="Backdrop blur" value={cfg.backdropBlur} min={0} max={24} unit=" px" onChange={(v) => setCfg({ backdropBlur: v })} />
              <Slider label="Accent top bar" value={cfg.accentBarHeight} min={0} max={12} unit=" px" onChange={(v) => setCfg({ accentBarHeight: v })} />
            </div>
            <ColorInput label="Accent bar colour" value={cfg.accentBarColor} onChange={(c) => setCfg({ accentBarColor: c })} />
          </Card>

          <Card title="Typography & Effects">
            <div className="field">
              <div className="row between">
                <label>Font family</label>
                <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
                  <Icon name="upload" size={13} />Upload .woff2
                  <input type="file" accept=".woff2" hidden onChange={handleFontUpload} />
                </label>
              </div>
              <Select
                searchable
                searchPlaceholder="Filter fonts…"
                ariaLabel="Font family"
                value={cfg.fontFamily}
                onChange={(v) => setCfg({ fontFamily: v })}
                options={[...customFonts, ...CURATED_FONTS]}
              />
            </div>
            <div className="grid2">
              <Slider label="Font size" value={cfg.fontSize} min={24} max={120} unit=" px" onChange={(v) => setCfg({ fontSize: v })} />
              <Slider label="Line height" value={cfg.lineHeight} min={0.95} max={1.8} step={0.05} onChange={(v) => setCfg({ lineHeight: v })} />
            </div>
            <div className="grid2">
              <Slider label="Letter spacing" value={cfg.letterSpacing} min={-2} max={10} step={0.5} unit=" px" onChange={(v) => setCfg({ letterSpacing: v })} />
              <div className="field">
                <label>Weight</label>
                <div className="seg">
                  <button aria-pressed={cfg.weight === 600} onClick={() => setCfg({ weight: 600 })}>Semi</button>
                  <button aria-pressed={cfg.weight === 700} onClick={() => setCfg({ weight: 700 })}>Bold</button>
                  <button aria-pressed={cfg.weight === 800} onClick={() => setCfg({ weight: 800 })}>Extra</button>
                </div>
              </div>
            </div>
            <div className="field">
              <label>Alignment</label>
              <div className="seg">
                {["left", "center", "right"].map((p) => (
                  <button key={p} aria-pressed={cfg.align === p} onClick={() => setCfg({ align: p })} style={{ textTransform: "capitalize" }}>{p}</button>
                ))}
              </div>
            </div>
            <div className="row between">
              <label>UPPERCASE text</label>
              <button type="button" className="toggle" role="switch" aria-checked={cfg.uppercase} onClick={() => setCfg({ uppercase: !cfg.uppercase })} />
            </div>
            <div className="row between">
              <label>Auto-fit text</label>
              <button type="button" className="toggle" role="switch" aria-checked={cfg.autoFit} onClick={() => setCfg({ autoFit: !cfg.autoFit })} />
            </div>
            <ColorInput label="Body text colour" value={cfg.textColor} onChange={(c) => setCfg({ textColor: c })} />
            <ColorInput label="Reference & label colour" value={cfg.refColor} onChange={(c) => setCfg({ refColor: c, versionColor: c, labelColor: c })} />

            <div className="row between">
              <label>Text shadow</label>
              <button type="button" className="toggle" role="switch" aria-checked={cfg.textShadow} onClick={() => setCfg({ textShadow: !cfg.textShadow })} />
            </div>
            <div className="row between">
              <label>Text glow</label>
              <button type="button" className="toggle" role="switch" aria-checked={cfg.textGlow} onClick={() => setCfg({ textGlow: !cfg.textGlow })} />
            </div>
            <Slider label="Text outline / stroke" value={cfg.textOutlineWidth} min={0} max={5} step={0.5} unit=" px" onChange={(v) => setCfg({ textOutlineWidth: v })} />

            <div className="grid2">
              <div className="field">
                <label>Reference position</label>
                <Select ariaLabel="Reference position" value={cfg.refPosition} onChange={(v) => setCfg({ refPosition: v })} options={REF_POSITIONS} />
              </div>
              <div className="field">
                <label>Separator</label>
                <Select
                  ariaLabel="Reference separator"
                  value={cfg.refSeparator}
                  onChange={(v) => setCfg({ refSeparator: v })}
                  options={[
                    { value: " · ", label: "Dot ( · )" },
                    { value: " — ", label: "Dash ( — )" },
                    { value: " | ", label: "Pipe ( | )" },
                  ]}
                />
              </div>
            </div>
            <div className="row between">
              <label>Show version code</label>
              <button type="button" className="toggle" role="switch" aria-checked={cfg.showVersion} onClick={() => setCfg({ showVersion: !cfg.showVersion })} />
            </div>
          </Card>

          <Card title="Transitions">
            <div className="grid2">
              <div className="field">
                <label>Entrance</label>
                <Select ariaLabel="Entrance transition" value={cfg.entrance} onChange={(v) => setCfg({ entrance: v })} options={TRANSITION_TYPES} />
              </div>
              <div className="field">
                <label>Content switch</label>
                <Select ariaLabel="Content switch transition" value={cfg.contentTransition} onChange={(v) => setCfg({ contentTransition: v })} options={TRANSITION_TYPES} />
              </div>
            </div>
            <Slider label="Duration" value={cfg.transitionDuration} min={50} max={1000} step={25} unit=" ms" onChange={(v) => setCfg({ transitionDuration: v })} />
            <div className="field">
              <label>Easing</label>
              <Select ariaLabel="Transition easing" value={cfg.transitionEasing} onChange={(v) => setCfg({ transitionEasing: v })} options={EASING_TYPES} />
            </div>
          </Card>

          <Card title="Church Branding & Watermark">
            <div className="field">
              <label htmlFor="cn">Church name</label>
              <input id="cn" className="input" value={styleDraft.churchName} onChange={(e) => setBrand({ churchName: e.target.value })} />
            </div>
            <div className="row between">
              <label>Show logo</label>
              <button type="button" className="toggle" role="switch" aria-checked={cfg.showLogo} onClick={() => setCfg({ showLogo: !cfg.showLogo })} />
            </div>
            <div className="row between">
              <label>Show church name</label>
              <button type="button" className="toggle" role="switch" aria-checked={cfg.showChurchName} onClick={() => setCfg({ showChurchName: !cfg.showChurchName })} />
            </div>
            <div className="field">
              <label>Church logo (PNG/JPEG/WebP, with crop)</label>
              <label className="drop" style={{ minHeight: 84 }}>
                {styleDraft.logo ? <img src={styleDraft.logo} alt="Logo" style={{ maxHeight: 64, maxWidth: "100%" }} /> : <div><Icon name="upload" size={20} /><div>Choose logo</div></div>}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleLogoUpload} />
              </label>
              {styleDraft.logo && (
                <div className="row">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCropSrc(styleDraft.logo)}>Adjust crop</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBrand({ logo: "" })}>Remove</button>
                </div>
              )}
            </div>
            <div className="field">
              <label>Watermark</label>
              <label className="drop" style={{ minHeight: 64 }}>
                {styleDraft.watermark ? <img src={styleDraft.watermark} alt="Watermark" style={{ maxHeight: 44 }} /> : <div>Choose watermark</div>}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleWatermarkUpload} />
              </label>
              {styleDraft.watermark && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBrand({ watermark: "" })}>Remove watermark</button>}
            </div>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div className="field">
                <label>Position</label>
                <div className="grid9">
                  {["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"].map((p) => (
                    <button key={p} type="button" aria-label={`Watermark ${p}`} aria-pressed={styleDraft.watermarkPos === p} onClick={() => setBrand({ watermarkPos: p })} />
                  ))}
                </div>
              </div>
              <div className="grow">
                <Slider label="Opacity" value={styleDraft.watermarkOpacity} min={5} max={100} unit="%" onChange={(v) => setBrand({ watermarkOpacity: v })} />
              </div>
            </div>
          </Card>
        </div>

        {/* Right WYSIWYG 16:9 Canvas */}
        <div style={{ position: "sticky", top: 0 }} className="col">
          <div className="row between wrap">
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-secondary btn-sm" disabled={!historyRef.current.length} onClick={undo}>Undo</button>
              <button className="btn btn-secondary btn-sm" disabled={!futureRef.current.length} onClick={redo}>Redo</button>
              <label className="check" style={{ fontSize: 12, alignItems: "center" }}>
                <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />
                <span>Safe guides</span>
              </label>
              <label className="check" style={{ fontSize: 12, alignItems: "center" }}>
                <input type="checkbox" checked={snapGrid} onChange={(e) => setSnapGrid(e.target.checked)} />
                <span>Snap 10px</span>
              </label>
            </div>
            <span className="muted mono" style={{ fontSize: 12 }}>
              1920 × 1080 · {editMode === "lowerThird" ? `Bar ${cfg.width}×${cfg.height}` : "Full Screen"}
            </span>
          </div>

          <div ref={canvasWrapRef} style={{ position: "relative" }}>
            <PreviewFrame item={previewItem} style={styleDraft} theme={themeDraft} assetsMap={assetsMap}>
              {showGuides && (
                <>
                  <div className="canvas-guide-safe" title="Title-safe area (5%)" />
                  <div className="canvas-guide-cx" />
                  <div className="canvas-guide-cy" />
                </>
              )}
              {editMode === "lowerThird" && (
                <div
                  className="canvas-drag-box"
                  title="Drag to move Lower Third bar · Drag corner to resize"
                  onPointerDown={startDrag("move")}
                  style={{
                    left: `${barLeftPct}%`,
                    width: `${barWidthPct}%`,
                    height: `${barHeightPct}%`,
                    bottom: `${barBottomPct}%`,
                  }}
                >
                  <div className="canvas-resize-handle" onPointerDown={startDrag("resize")} title="Resize bar" />
                </div>
              )}
            </PreviewFrame>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Drag the blue box to move the lower third bar, or pull its gold corner handle to resize. Changes apply live to OBS when saved.
          </p>
        </div>
      </div>

      {dirty && (
        <div className="sticky-save">
          <span className="muted">You have unsaved changes.</span>
          <button className="btn btn-ghost" onClick={() => { setThemeDraft(activeThemeObj); setStyleDraft(style); setDirty(false); }}>Discard</button>
          <button className="btn btn-primary" onClick={handleSave}>Save & apply live</button>
        </div>
      )}

      <LogoCropModal src={cropSrc} onCancel={() => setCropSrc(null)} onApply={(cropped) => { setBrand({ logo: cropped }); setCropSrc(null); }} />
    </AppShell>
  );
}
