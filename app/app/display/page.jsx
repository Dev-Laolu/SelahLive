"use client";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { PreviewFrame } from "@/components/Overlay";
import { useApp } from "@/lib/store";
import { BG_PRESETS, SAMPLE_VERSE } from "@/lib/defaults";
import { useToast } from "@/components/Toast";

const readImg = (file) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
const COLORS = ["#FFFFFF", "#FFF3CF", "#E8B84A", "#B2C5FF", "#F4F6FB"];

function Card({ title, children, open }) { return <details className="card coll" open={open}><summary>{title}<Icon name="down" size={18} /></summary><div className="col">{children}</div></details>; }
function Slider({ label, value, min, max, step = 1, unit = "", onChange }) { return <div className="field"><div className="row between"><label>{label}</label><span className="mono muted" style={{ fontSize: 12 }}>{value}{unit}</span></div><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} /></div>; }

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
    img.onload = () => {
      imgRef.current = img;
      setZoom(1); setOffsetX(0); setOffsetY(0);
      draw(img, 1, 0, 0);
    };
    img.src = src;
  }, [src]);

  const draw = (img, z, ox, oy) => {
    const c = canvasRef.current;
    if (!c || !img) return;
    const ctx = c.getContext("2d");
    const size = 256;
    ctx.clearRect(0, 0, size, size);
    const scale = Math.max(size / img.width, size / img.height) * z;
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (size - w) / 2 + ox;
    const y = (size - h) / 2 + oy;
    ctx.drawImage(img, x, y, w, h);
  };

  useEffect(() => {
    if (imgRef.current) draw(imgRef.current, zoom, offsetX, offsetY);
  }, [zoom, offsetX, offsetY]);

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
  const { style, saveStyle, setMode } = useApp();
  const toast = useToast();
  const [draft, setDraft] = useState(style);
  const [dirty, setDirty] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const loaded = useRef(false);
  useEffect(() => { if (!loaded.current || !dirty) { setDraft(style); loaded.current = true; } }, [style]); // eslint-disable-line
  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };

  const handleLogoUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast("Image is larger than 2 MB.");
      e.target.value = "";
      return;
    }
    if (f.type === "image/svg+xml") {
      const svgText = await f.text();
      if (/<\s*(?:script|foreignObject)\b|on[a-z]+\s*=|javascript:/i.test(svgText)) {
        toast("That SVG contains disallowed scripts or active elements.");
        e.target.value = "";
        return;
      }
      set({ logo: await readImg(f) });
    } else {
      setCropSrc(await readImg(f));
    }
    e.target.value = "";
  };

  const up = (key) => async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast("Image is larger than 2 MB."); return; }
    if (f.type === "image/svg+xml") {
      const svgText = await f.text();
      if (/<\s*(?:script|foreignObject)\b|on[a-z]+\s*=|javascript:/i.test(svgText)) {
        toast("That SVG contains disallowed scripts or active elements.");
        return;
      }
    }
    set({ [key]: await readImg(f) });
  };
  const save = () => { saveStyle(draft); setMode(draft.layout); setDirty(false); toast("Display settings saved."); };
  const item = { ...SAMPLE_VERSE, mode: draft.layout };

  return (
    <AppShell preview={false}>
      <h1 className="page-title">Display</h1>
      <div className="two" style={{ gridTemplateColumns: "minmax(0,400px) minmax(0,1fr)" }}>
        <div className="col">
          <Card title="Church" open>
            <div className="field"><label htmlFor="cn">Church name</label><input id="cn" className="input" value={draft.churchName} onChange={(e) => set({ churchName: e.target.value })} /></div>
            <div className="field"><label>Logo (PNG or SVG, with square crop)</label>
              <label className="drop" style={{ minHeight: 96 }}>
                {draft.logo ? <img src={draft.logo} alt="Logo" style={{ maxHeight: 72, maxWidth: "100%" }} /> : <div><Icon name="upload" size={22} /><div>Drop a logo or click to choose</div></div>}
                <input type="file" accept="image/png,image/svg+xml,image/jpeg" hidden onChange={handleLogoUpload} />
              </label>
              {draft.logo && (
                <div className="row">
                  <button className="btn btn-ghost btn-sm" onClick={() => setCropSrc(draft.logo)}>Adjust crop</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => set({ logo: "" })}>Remove logo</button>
                </div>
              )}
            </div>
            <div className="field"><label>Watermark</label>
              <label className="drop" style={{ minHeight: 72 }}>
                {draft.watermark ? <img src={draft.watermark} alt="Watermark" style={{ maxHeight: 48 }} /> : <div>Choose watermark image</div>}
                <input type="file" accept="image/png,image/svg+xml" hidden onChange={up("watermark")} />
              </label>
              {draft.watermark && <button className="btn btn-ghost btn-sm" onClick={() => set({ watermark: "" })}>Remove watermark</button>}
            </div>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div className="field"><label>Position</label><div className="grid9">{["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"].map((p) => <button key={p} aria-label={`Watermark ${p}`} aria-pressed={draft.watermarkPos === p} onClick={() => set({ watermarkPos: p })} />)}</div></div>
              <div className="grow"><Slider label="Opacity" value={draft.watermarkOpacity} min={5} max={100} unit="%" onChange={(v) => set({ watermarkOpacity: v })} /></div>
            </div>
          </Card>
          <Card title="Layout" open>
            <div className="seg"><button aria-pressed={draft.layout === "lowerThird"} onClick={() => set({ layout: "lowerThird" })}>Lower third</button><button aria-pressed={draft.layout === "fullScreen"} onClick={() => set({ layout: "fullScreen" })}>Full screen</button></div>
            {draft.layout === "lowerThird" && <>
              <Slider label="Width" value={draft.width} min={800} max={1840} step={20} unit=" px" onChange={(v) => set({ width: v })} />
              <Slider label="Height" value={draft.height} min={140} max={420} step={10} unit=" px" onChange={(v) => set({ height: v })} />
              <Slider label="Bottom margin" value={draft.bottom} min={0} max={300} step={10} unit=" px" onChange={(v) => set({ bottom: v })} />
              <div className="field"><label>Horizontal position</label><div className="seg">{["left", "center", "right"].map((p) => <button key={p} aria-pressed={draft.hpos === p} onClick={() => set({ hpos: p })} style={{ textTransform: "capitalize" }}>{p}</button>)}</div></div>
            </>}
          </Card>
          <Card title="Text">
            <Slider label="Size" value={draft.textSize} min={32} max={72} unit=" px" onChange={(v) => set({ textSize: v })} />
            <div className="field"><label>Weight</label><div className="seg"><button aria-pressed={draft.weight === 700} onClick={() => set({ weight: 700 })}>Bold</button><button aria-pressed={draft.weight === 800} onClick={() => set({ weight: 800 })}>Extra bold</button></div></div>
            <div className="field"><label>Colour</label><div className="swatches">{COLORS.map((c) => <button key={c} className="sw" aria-label={c} aria-pressed={draft.color.toLowerCase() === c.toLowerCase()} style={{ background: c }} onClick={() => set({ color: c })} />)}</div></div>
            <div className="field"><label>Alignment</label><div className="seg">{["left", "center", "right"].map((p) => <button key={p} aria-pressed={draft.align === p} onClick={() => set({ align: p })} style={{ textTransform: "capitalize" }}>{p}</button>)}</div></div>
          </Card>
          <Card title="Background">
            <div className="swatches">{BG_PRESETS.map((c) => <button key={c} className="sw" aria-label={c} aria-pressed={draft.bg.toLowerCase() === c.toLowerCase()} style={{ background: c }} onClick={() => set({ bg: c })} />)}</div>
            <div className="row"><input type="color" aria-label="Pick colour" value={draft.bg} onChange={(e) => set({ bg: e.target.value.toUpperCase() })} style={{ width: 44, height: 44, border: 0, background: "none" }} /><input className="input mono" value={draft.bg} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && set({ bg: e.target.value })} aria-label="Hex colour" /></div>
            <div className="row between"><label id="gl">Subtle animated gradient</label><button className="toggle" role="switch" aria-checked={draft.gradient} aria-labelledby="gl" onClick={() => set({ gradient: !draft.gradient })} /></div>
          </Card>
          <Card title="Animation">
            <div className="field"><label htmlFor="en">Entrance and exit</label><select id="en" className="select" value={draft.entrance} onChange={(e) => set({ entrance: e.target.value })}><option value="slide-up">Slide up and fade</option><option value="fade">Fade</option><option value="none">None</option></select></div>
            <Slider label="Speed" value={draft.speed} min={150} max={900} step={50} unit=" ms" onChange={(v) => set({ speed: v })} />
          </Card>
        </div>
        <div style={{ position: "sticky", top: 0 }}><PreviewFrame item={item} style={draft} /><p className="muted" style={{ fontSize: 12 }}>This is exactly what the overlay will show.</p></div>
      </div>
      {dirty && <div className="sticky-save"><span className="muted">You have unsaved changes.</span><button className="btn btn-ghost" onClick={() => { setDraft(style); setDirty(false); }}>Discard</button><button className="btn btn-primary" onClick={save}>Save changes</button></div>}
      <LogoCropModal src={cropSrc} onCancel={() => setCropSrc(null)} onApply={(cropped) => { set({ logo: cropped }); setCropSrc(null); }} />
    </AppShell>
  );
}
