"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Select from "@/components/Select";
import { OverlayStage, PreviewFrame } from "@/components/Overlay";
import { useToast } from "@/components/Toast";
import { useApp } from "@/lib/store";
import {
  CURATED_FONTS,
  BG_TYPES,
  FIT_MODES,
  TRANSITION_TYPES,
  TEXT_ANIMATIONS,
  LOGO_ANIMATIONS,
  BG_MOTIONS,
  EASING_TYPES,
  REF_POSITIONS,
  REF_FORMATS,
  REF_BOX_STYLES,
  DIVIDER_STYLES,
  WATERMARK_POSITIONS,
  ELEMENT_KEYS,
  TEXT_ELEMENT_KEYS,
  DEFAULT_BRAND_SWATCHES,
  createBaseLayout,
  sanitizeTheme,
  validateImportedThemeJson,
  isTemplateNameTaken,
  suggestUniqueTemplateName,
  generateTemplatePngDataUrl,
  processUploadedImage,
} from "@/lib/themes";
import { SAMPLE_VERSE } from "@/lib/defaults";

const clone = (x) => JSON.parse(JSON.stringify(x));

export default function DisplayPage() {
  const {
    style, saveStyle, themes, activeThemeIds, saveTheme, deleteTheme, selectThemeForSlot,
    assetsMap, saveAsset, live, updateLive,
  } = useApp();
  const toast = useToast();

  // Main view: gallery | editor
  const [view, setView] = useState("editor");
  const [slotFilter, setSlotFilter] = useState("all");
  const [styleFilter, setStyleFilter] = useState("All");
  const [editMode, setEditMode] = useState("lowerThird"); // lowerThird | fullScreen
  const [selectedEl, setSelectedEl] = useState("body");
  const [showGuides, setShowGuides] = useState(true);
  const [animReplay, setAnimReplay] = useState(0);

  // Active working theme + local buffered style (never pushed to OBS until Save!) + Undo/Redo
  const initialTheme = themes.find((t) => t.id === activeThemeIds.scripture) || themes[0];
  const [draft, setDraft] = useState(() => sanitizeTheme(initialTheme));
  const [draftStyle, setDraftStyle] = useState(() => ({ ...style }));
  const [dirty, setDirty] = useState(false);
  const [styleDirty, setStyleDirty] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  useEffect(() => {
    if (!styleDirty) setDraftStyle({ ...style });
  }, [style, styleDirty]);

  const patchDraftStyle = (patch) => {
    setDraftStyle((prev) => ({ ...prev, ...patch }));
    setStyleDirty(true);
  };

  // Save-as-new-template & Unsaved prompt modals
  const [saveModal, setSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveSlot, setSaveSlot] = useState("scripture");
  const [saveDesc, setSaveDesc] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [pendingAction, setPendingAction] = useState(null); // { label, run } when leaving dirty editor
  const [renameModal, setRenameModal] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [renameErr, setRenameErr] = useState("");
  const [customFonts, setCustomFonts] = useState([]);
  const [copyTarget, setCopyTarget] = useState("reference");

  // Interactive canvas scale & drag state
  const stageWrapRef = useRef(null);
  const [stageScale, setStageScale] = useState(0.32);
  const dragRef = useRef(null);

  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    const update = () => {
      if (el.clientWidth > 0) setStageScale(Math.max(0.15, el.clientWidth / 1920));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  // Warn on tab close if unsaved changes exist (V1.2 §5.2)
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!dirty && !styleDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, styleDirty]);

  const layout = draft[editMode];
  const els = layout.elements;
  const activeTextEl = TEXT_ELEMENT_KEYS.includes(selectedEl) ? els[selectedEl] : null;

  // Sample preview item matching the current slot or live item
  const sampleItem = useMemo(() => {
    if (live && live.clearMode === "none") return { ...live, mode: editMode };
    if (draft.slot === "songs") {
      return {
        mode: editMode, kind: "song", title: "Amazing Grace", subtitle: "John Newton",
        author: "John Newton (Public Domain)", label: "Verse 1",
        body: "Amazing grace, how sweet the sound\nThat saved a wretch like me",
      };
    }
    if (draft.slot === "text") {
      return {
        mode: editMode, kind: "text",
        title: draft.placeholderTitle || "Welcome Home",
        subtitle: "",
        body: draft.placeholderBody || "We are so glad you joined us today!\nSay hello in the chat and let us pray with you.",
      };
    }
    return { ...SAMPLE_VERSE, mode: editMode };
  }, [live, draft.slot, draft.placeholderTitle, draft.placeholderBody, editMode]);

  // Commit a draft mutation locally ONLY (does NOT push to OBS until Save is clicked!)
  const mutateDraft = (updater) => {
    setDraft((prev) => {
      const next = sanitizeTheme(updater(clone(prev)));
      setUndoStack((u) => [...u.slice(-29), prev]);
      setRedoStack([]);
      setDirty(true);
      return next;
    });
  };

  const patchLayout = (patch) => {
    mutateDraft((d) => {
      d[editMode] = { ...d[editMode], ...patch };
      return d;
    });
  };

  const patchElement = (elKey, patch) => {
    mutateDraft((d) => {
      const cur = d[editMode].elements[elKey] || {};
      d[editMode].elements[elKey] = { ...cur, ...patch };
      return d;
    });
  };

  const undo = () => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, draft]);
    setDraft(prev);
  };

  const redo = () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, draft]);
    setDraft(next);
  };

  // Guarded action runner (prompts Save / Discard / Keep editing if dirty)
  const guardDirty = (label, run) => {
    if (!dirty && !styleDirty) { run(); return; }
    setPendingAction({ label, run });
  };

  const handleSaveAndApply = async () => {
    if (styleDirty) {
      saveStyle(draftStyle);
      setStyleDirty(false);
    }
    if (!dirty) {
      toast("Saved church branding & display settings to OBS.");
      return;
    }
    if (!draft.builtIn) {
      try {
        const saved = await saveTheme(draft);
        selectThemeForSlot(saved.slot, saved.id);
        setDraft(saved);
        setDirty(false);
        toast(`Saved "${saved.name}" and applied to OBS.`);
      } catch (e) {
        toast(e.message, "bad");
      }
    } else {
      openSaveAsModal();
    }
  };

  const openTemplateInEditor = (tpl) => {
    guardDirty(`switch to ${tpl.name}`, () => {
      setDraft(sanitizeTheme(tpl));
      setDirty(false);
      setUndoStack([]);
      setRedoStack([]);
      setView("editor");
    });
  };

  const openSaveAsModal = () => {
    setSaveName(suggestUniqueTemplateName(draft.name, themes));
    setSaveSlot(draft.slot || "scripture");
    setSaveDesc(draft.description || "");
    setSaveErr("");
    setSaveModal(true);
  };

  const confirmSaveAsNew = async (e) => {
    e?.preventDefault();
    const trimmed = saveName.trim();
    if (!trimmed || trimmed.length > 60) {
      setSaveErr("Template name is required (1–60 characters).");
      return;
    }
    if (isTemplateNameTaken(trimmed, themes)) {
      const suggestion = suggestUniqueTemplateName(trimmed, themes);
      setSaveErr(`That name already exists. Choose a different name (e.g. "${suggestion}").`);
      return;
    }
    try {
      if (styleDirty) {
        saveStyle(draftStyle);
        setStyleDirty(false);
      }
      const saved = await saveTheme({
        ...draft,
        id: `custom-${Date.now()}`,
        builtIn: false,
        name: trimmed,
        slot: saveSlot,
        description: saveDesc.trim(),
        styleTag: "Custom",
      });
      selectThemeForSlot(saved.slot, saved.id);
      setDraft(saved);
      setDirty(false);
      setSaveModal(false);
      toast(`Saved new template "${saved.name}" and applied to OBS.`);
      if (pendingAction) {
        const fn = pendingAction.run;
        setPendingAction(null);
        fn();
      }
    } catch (err) {
      setSaveErr(err.message);
    }
  };

  // Drag any selected element on the 16:9 canvas (Full Screen & Lower Third!)
  const startElementDrag = (e) => {
    const targetKey = selectedEl === "background" ? "body" : selectedEl;
    const curEl = els[targetKey];
    if (!curEl || !("x" in curEl)) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = curEl.x || 0;
    const origY = curEl.y || 0;
    const isLogoCorner = targetKey === "logo" && editMode === "fullScreen";

    const onMove = (ev) => {
      const dx = Math.round((ev.clientX - startX) / stageScale);
      const dy = Math.round((ev.clientY - startY) / stageScale);
      let nx = origX + dx;
      let ny = origY + dy;
      if (!isLogoCorner) {
        if (Math.abs(nx) < 16) nx = 0;
        if (Math.abs(ny) < 16) ny = 0;
        nx = Math.max(-960, Math.min(960, nx));
        ny = Math.max(-540, Math.min(540, ny));
        patchElement(targetKey, { x: nx, y: ny });
      } else {
        nx = Math.max(0, Math.min(1800, nx));
        ny = Math.max(0, Math.min(1000, ny));
        patchElement("logo", { position: "top-left", x: nx, y: ny });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Interactive drag & resize for Lower Third box
  const startDrag = (kind, e) => {
    if (editMode !== "lowerThird") return;
    e.preventDefault();
    dragRef.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      x: layout.x,
      bottom: layout.bottom,
      width: layout.width,
      height: layout.height,
    };
    const onMove = (ev) => {
      const st = dragRef.current;
      if (!st) return;
      const dx = Math.round((ev.clientX - st.startX) / stageScale);
      const dy = Math.round((ev.clientY - st.startY) / stageScale);
      if (st.kind === "move") {
        let nx = Math.max(0, Math.min(1920 - st.width, st.x + dx));
        // Center snap within 24px
        const centerX = Math.round((1920 - st.width) / 2);
        if (Math.abs(nx - centerX) < 24) nx = centerX;
        const nb = Math.max(0, Math.min(600, st.bottom - dy));
        patchLayout({ hpos: "custom", x: nx, bottom: nb });
      } else {
        const nw = Math.max(480, Math.min(1920, st.width + dx));
        const nh = Math.max(120, Math.min(600, st.height + dy));
        patchLayout({ width: nw, height: nh });
      }
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Upload background image (1 MB max, EXIF stripped)
  const handleBgImageUpload = async (file) => {
    try {
      const processed = await processUploadedImage(file, 1024 * 1024);
      const saved = await saveAsset(processed);
      patchLayout({ bgType: "image", bgImageAssetId: saved.assetId, bgImageDataUrl: saved.dataUrl });
      toast("Background image saved & synced to overlay.");
    } catch (e) {
      toast(e.message, "bad");
    }
  };

  // Upload church logo or watermark (2 MB max — buffered locally until Save & Apply)
  const handleBrandImageUpload = async (field, file) => {
    try {
      const processed = await processUploadedImage(file, 2 * 1024 * 1024);
      patchDraftStyle({ [field]: processed.dataUrl });
      toast(field === "logo" ? "Church logo staged (click Save & Apply to push to OBS)." : "Watermark staged (click Save & Apply to push to OBS).");
    } catch (e) {
      toast(e.message, "bad");
    }
  };

  // Upload custom .woff2 font
  const handleFontUpload = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith(".woff2")) {
      toast("Only .woff2 web font files are supported.", "bad");
      return;
    }
    if (file.size > 512 * 1024) {
      toast("Font file must be under 512 KB.", "bad");
      return;
    }
    const name = file.name.replace(/\.woff2$/i, "").replace(/[^a-zA-Z0-9 _-]/g, "");
    const url = URL.createObjectURL(file);
    try {
      const face = new FontFace(name, `url(${url})`);
      await face.load();
      document.fonts.add(face);
      const val = `"${name}", system-ui, sans-serif`;
      setCustomFonts((prev) => [...prev.filter((f) => f.value !== val), { value: val, label: `${name} (Uploaded)` }]);
      if (activeTextEl) patchElement(selectedEl, { fontFamily: val });
      toast(`Loaded font "${name}".`);
    } catch {
      toast("Could not load font file.", "bad");
    }
  };

  // Export & Import .selah-theme.json (V1.2 §3.3)
  const exportTheme = (tpl) => {
    const clean = clone(tpl);
    delete clean.lowerThird.bgImageDataUrl;
    delete clean.fullScreen.bgImageDataUrl;
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${tpl.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.selah-theme.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importThemeFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    const res = validateImportedThemeJson(text);
    if (!res.ok) { toast(res.error, "bad"); return; }
    const uniqueName = isTemplateNameTaken(res.theme.name, themes)
      ? suggestUniqueTemplateName(res.theme.name, themes)
      : res.theme.name;
    try {
      const saved = await saveTheme({ ...res.theme, name: uniqueName });
      toast(`Imported template "${saved.name}".`);
      openTemplateInEditor(saved);
    } catch (e) {
      toast(e.message, "bad");
    }
  };

  // Copy style from / Apply style to (V1.2 §2.2)
  const copyStyleFrom = (srcKey) => {
    if (!activeTextEl || !els[srcKey]) return;
    const src = els[srcKey];
    patchElement(selectedEl, {
      fontFamily: src.fontFamily,
      weight: src.weight,
      italic: src.italic,
      underline: src.underline,
      textTransform: src.textTransform,
      letterSpacing: src.letterSpacing,
      color: src.color,
      shadow: clone(src.shadow),
      outline: clone(src.outline),
      glow: clone(src.glow),
    });
    toast(`Copied style from ${srcKey} to ${selectedEl}.`);
  };

  const applyStyleTo = (dstKey) => {
    if (!activeTextEl || !els[dstKey]) return;
    patchElement(dstKey, {
      fontFamily: activeTextEl.fontFamily,
      weight: activeTextEl.weight,
      italic: activeTextEl.italic,
      underline: activeTextEl.underline,
      textTransform: activeTextEl.textTransform,
      letterSpacing: activeTextEl.letterSpacing,
      color: activeTextEl.color,
      shadow: clone(activeTextEl.shadow),
      outline: clone(activeTextEl.outline),
      glow: clone(activeTextEl.glow),
    });
    toast(`Applied ${selectedEl} style to ${dstKey}.`);
  };

  const resetSelectedElement = () => {
    const fresh = createBaseLayout(editMode === "fullScreen");
    if (selectedEl === "background") {
      patchLayout({
        bgType: fresh.bgType, bgColor: fresh.bgColor, bgOpacity: fresh.bgOpacity,
        gradientStops: fresh.gradientStops, bgMotion: fresh.bgMotion,
        borderWidth: fresh.borderWidth, borderColor: fresh.borderColor,
        accentBarColor: fresh.accentBarColor, accentBarHeight: fresh.accentBarHeight,
      });
    } else if (fresh.elements[selectedEl]) {
      patchElement(selectedEl, fresh.elements[selectedEl]);
    }
    toast(`Reset ${selectedEl} to default.`);
  };

  // Gallery filters
  const allFontOpts = [...CURATED_FONTS, ...customFonts];
  const styleTags = useMemo(() => ["All", ...new Set(themes.map((t) => t.styleTag || "Custom"))], [themes]);
  const filteredThemes = useMemo(
    () =>
      themes.filter(
        (t) =>
          (slotFilter === "all" || t.slot === slotFilter) &&
          (styleFilter === "All" || (t.styleTag || "Custom") === styleFilter)
      ),
    [themes, slotFilter, styleFilter]
  );
  const mostUsedThemes = useMemo(
    () => [...themes].sort((a, b) => (b.useCount || 0) - (a.useCount || 0)).slice(0, 4),
    [themes]
  );

  return (
    <AppShell pending={sampleItem}>
      <div className="col" style={{ gap: 16 }}>
        {/* Top Bar */}
        <div className="row between wrap" style={{ gap: 10 }}>
          <div className="row wrap" style={{ gap: 10 }}>
            <h1 className="page-title" style={{ margin: 0 }}>Display</h1>
            <div className="seg" role="tablist">
              <button aria-pressed={view === "gallery"} onClick={() => setView("gallery")}>Templates ({themes.length})</button>
              <button aria-pressed={view === "editor"} onClick={() => setView("editor")}>Element Editor</button>
            </div>
            {(dirty || styleDirty) && <span className="chip warn">Unsaved changes (not sent to OBS yet)</span>}
          </div>

          <div className="row wrap" style={{ gap: 8 }}>
            <label className="check" style={{ fontSize: 12 }} title="Caps canvas to 30 fps, lowers particles, disables blur">
              <input type="checkbox" checked={!!draftStyle.performanceMode} onChange={(e) => patchDraftStyle({ performanceMode: e.target.checked })} />
              <span>Performance mode</span>
            </label>
            <label className="check" style={{ fontSize: 12 }} title="Replace all motion with simple fades and static backgrounds">
              <input type="checkbox" checked={!!draftStyle.reduceMotion} onChange={(e) => patchDraftStyle({ reduceMotion: e.target.checked })} />
              <span>Reduce motion</span>
            </label>
            {view === "editor" && (
              <>
                <button className="btn btn-secondary btn-sm" disabled={!undoStack.length} onClick={undo} title="Undo"><Icon name="undo" size={15} /></button>
                <button className="btn btn-secondary btn-sm" disabled={!redoStack.length} onClick={redo} title="Redo"><Icon name="redo" size={15} /></button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!dirty && !styleDirty}
                  onClick={handleSaveAndApply}
                >
                  <Icon name="check" size={15} /> Save &amp; Apply to OBS
                </button>
                <button className="btn btn-secondary btn-sm" onClick={openSaveAsModal}>
                  Save as new template
                </button>
              </>
            )}
          </div>
        </div>

        {/* ====================================================================
            TEMPLATE GALLERY VIEW (V1.2 §3)
            ==================================================================== */}
        {view === "gallery" && (
          <div className="col" style={{ gap: 16 }}>
            <div className="row between wrap" style={{ gap: 10 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <div className="seg">
                  {[["all", "All"], ["scripture", "Scripture"], ["songs", "Songs"], ["text", "Text"]].map(([k, l]) => (
                    <button key={k} aria-pressed={slotFilter === k} onClick={() => setSlotFilter(k)}>{l}</button>
                  ))}
                </div>
                <Select
                  ariaLabel="Filter by style"
                  style={{ width: 160 }}
                  value={styleFilter}
                  onChange={setStyleFilter}
                  options={styleTags}
                />
              </div>
              <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                <Icon name="upload" size={15} /> Import .selah-theme.json
                <input type="file" hidden accept=".json,.selah-theme.json" onChange={(e) => { importThemeFile(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </div>

            {/* Most Used Row */}
            <div className="col" style={{ gap: 8 }}>
              <span className="label">Most used</span>
              <div className="row wrap" style={{ gap: 8 }}>
                {mostUsedThemes.map((t) => (
                  <button key={t.id} className="btn btn-secondary btn-sm" onClick={() => { selectThemeForSlot(t.slot, t.id); toast(`Applied "${t.name}" to ${t.slot}.`); }}>
                    <Icon name="sparkle" size={14} className="gold" /> {t.name} <span className="muted">({t.slot})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Gallery Grid */}
            <div className="grid2">
              {filteredThemes.map((t) => {
                const isDefault = activeThemeIds[t.slot] === t.id;
                const thumbItem =
                  t.slot === "songs"
                    ? { mode: "fullScreen", kind: "song", title: "Amazing Grace", subtitle: "Hymn", label: "Verse 1", body: "Amazing grace, how sweet the sound" }
                    : t.slot === "text"
                      ? { mode: "fullScreen", kind: "text", title: t.placeholderTitle || t.name, subtitle: "", body: t.placeholderBody || "Church announcement preview" }
                      : { ...SAMPLE_VERSE, mode: "fullScreen" };
                return (
                  <div key={t.id} className="card col" style={{ gap: 10 }}>
                    <PreviewFrame item={thumbItem} style={style} theme={t} assetsMap={assetsMap} paused />
                    <div className="row between" style={{ gap: 8 }}>
                      <div>
                        <b>{t.name}</b>
                        <div className="muted" style={{ fontSize: 12 }}>{t.description || `${t.slot} template`}</div>
                      </div>
                      <div className="row" style={{ gap: 4 }}>
                        <span className="chip">{t.slot}</span>
                        {t.builtIn ? <span className="chip">Built-in</span> : <span className="chip ok">Custom</span>}
                      </div>
                    </div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <button
                        className={`btn btn-sm ${isDefault ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => {
                          selectThemeForSlot(t.slot, t.id);
                          toast(`Applied "${t.name}" as ${t.slot} default.`);
                        }}
                      >
                        {isDefault ? "Active default" : "Apply"}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => openTemplateInEditor(t)}>Edit</button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const dup = sanitizeTheme({ ...clone(t), builtIn: false, name: suggestUniqueTemplateName(t.name, themes) });
                          setDraft(dup);
                          setDirty(true);
                          setView("editor");
                          toast(`Duplicated "${t.name}". Save with a unique name when ready.`);
                        }}
                      >
                        Duplicate
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => exportTheme(t)}>Export</button>
                      {!t.builtIn && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setRenameModal(t); setRenameVal(t.name); setRenameErr(""); }}>Rename</button>
                          <button className="btn btn-danger btn-sm" onClick={async () => { await deleteTheme(t.id); toast(`Deleted "${t.name}".`); }}>Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ====================================================================
            ELEMENT-BASED DESIGN EDITOR (V1.2 §2 & §4)
            ==================================================================== */}
        {view === "editor" && (
          <div className="col" style={{ gap: 14 }}>
            {/* Active template bar + Layout mode toggle */}
            <div className="card row between wrap" style={{ gap: 10 }}>
              <div className="row wrap" style={{ gap: 10 }}>
                <Select
                  searchable
                  ariaLabel="Template to edit"
                  style={{ width: 250 }}
                  value={draft.id}
                  onChange={(id) => {
                    const found = themes.find((t) => t.id === id);
                    if (found) openTemplateInEditor(found);
                  }}
                  options={themes.map((t) => ({ value: t.id, label: t.name, sub: `${t.slot}${t.builtIn ? " · Built-in" : " · Custom"}` }))}
                />
                <div className="seg">
                  <button aria-pressed={editMode === "lowerThird"} onClick={() => setEditMode("lowerThird")}>Lower third</button>
                  <button aria-pressed={editMode === "fullScreen"} onClick={() => setEditMode("fullScreen")}>Full screen</button>
                </div>
              </div>
              <div className="row wrap" style={{ gap: 8 }}>
                <label className="check" style={{ fontSize: 12 }}>
                  <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />
                  <span>Guides</span>
                </label>
                <button className="btn btn-secondary btn-sm" onClick={() => setAnimReplay((k) => k + 1)}>
                  <Icon name="play" size={14} /> Replay animation
                </button>
              </div>
            </div>

            {/* Interactive 16:9 Canvas Preview with Professional Broadcast Grid, Element Drag & Snap Tools */}
            <div className="card col" style={{ padding: 10, gap: 8 }}>
              <div className="row between wrap" style={{ gap: 8, fontSize: 12 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className="chip mono" style={{ fontSize: 11 }}>1920 × 1080</span>
                  <span className="muted" style={{ fontSize: 11 }}>
                    Drag on canvas to move: <b className="gold">{ELEMENT_KEYS.find((e) => e.key === (selectedEl === "background" ? "body" : selectedEl))?.label}</b>
                    {els[selectedEl === "background" ? "body" : selectedEl] && "x" in els[selectedEl === "background" ? "body" : selectedEl]
                      ? ` (X:${els[selectedEl === "background" ? "body" : selectedEl].x || 0}, Y:${els[selectedEl === "background" ? "body" : selectedEl].y || 0})`
                      : ""}
                  </span>
                </div>
                <div className="row wrap" style={{ gap: 4 }}>
                  {editMode === "lowerThird" && (
                    <>
                      <button className="btn btn-ghost btn-sm" style={{ padding: "2px 8px", minHeight: 26 }} onClick={() => patchLayout({ hpos: "left", x: 60 })}>Bar Left</button>
                      <button className="btn btn-ghost btn-sm" style={{ padding: "2px 8px", minHeight: 26 }} onClick={() => patchLayout({ hpos: "center", x: Math.round((1920 - layout.width) / 2) })}>Bar Center</button>
                      <button className="btn btn-ghost btn-sm" style={{ padding: "2px 8px", minHeight: 26 }} onClick={() => patchLayout({ hpos: "right", x: 1920 - 60 - layout.width })}>Bar Right</button>
                    </>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: "2px 8px", minHeight: 26 }}
                    onClick={() => {
                      const k = selectedEl === "background" ? "body" : selectedEl;
                      if (k === "logo" && editMode === "fullScreen") patchElement("logo", { x: 48, y: 40 });
                      else if (els[k]) patchElement(k, { x: 0, y: 0 });
                    }}
                  >
                    Center / Reset Element
                  </button>
                </div>
              </div>
              <div
                className="preview-box"
                ref={stageWrapRef}
                onPointerDown={startElementDrag}
                title="Click and drag to move the selected element on screen"
                style={{ position: "relative", cursor: "grab" }}
              >
                <div className="preview-stage" style={{ transform: `scale(${stageScale})` }}>
                  <OverlayStage
                    item={sampleItem}
                    style={draftStyle}
                    theme={draft}
                    assetsMap={assetsMap}
                    enterKey={animReplay}
                    contentKey={animReplay}
                    performanceMode={!!draftStyle.performanceMode}
                    reduceMotion={!!draftStyle.reduceMotion}
                  />
                </div>
                {showGuides && (
                  <>
                    <div className="canvas-grid" />
                    <div className="canvas-guide-safe" />
                    <div className="canvas-guide-title" />
                    <div className="canvas-guide-cx" />
                    <div className="canvas-guide-cy" />
                  </>
                )}
                {editMode === "lowerThird" && showGuides && (
                  <div
                    className="canvas-drag-box"
                    title="Drag to move Lower Third bar; drag corner handle to resize"
                    onPointerDown={(e) => startDrag("move", e)}
                    style={{
                      left: (layout.hpos === "custom" ? layout.x : layout.hpos === "left" ? 60 : layout.hpos === "right" ? 1920 - 60 - layout.width : (1920 - layout.width) / 2) * stageScale,
                      bottom: layout.bottom * stageScale,
                      width: layout.width * stageScale,
                      height: layout.height * stageScale,
                    }}
                  >
                    <div className="canvas-resize-handle" onPointerDown={(e) => { e.stopPropagation(); startDrag("resize", e); }} />
                  </div>
                )}
              </div>
            </div>

            {/* Element Selector + Element Inspector */}
            <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: 14, alignItems: "start" }}>
              {/* Left: Elements list with visibility eye toggles */}
              <div className="card col" style={{ gap: 4, padding: 10 }}>
                <span className="label" style={{ padding: "4px 6px" }}>Elements ({editMode === "lowerThird" ? "Lower third" : "Full screen"})</span>
                {ELEMENT_KEYS.map((el) => {
                  const hasVis = el.key !== "background" && els[el.key] && "visible" in els[el.key];
                  const isVis = hasVis ? !!els[el.key].visible : true;
                  return (
                    <div
                      key={el.key}
                      className={`list-item row between ${selectedEl === el.key ? "active" : ""}`}
                      style={{ padding: "7px 10px", cursor: "pointer" }}
                      onClick={() => setSelectedEl(el.key)}
                    >
                      <span style={{ fontSize: 13, opacity: isVis ? 1 : 0.45 }}>{el.label}</span>
                      {hasVis && (
                        <button
                          type="button"
                          className="iconbtn"
                          style={{ width: 26, height: 26 }}
                          aria-label={`Toggle ${el.label} visibility`}
                          onClick={(e) => {
                            e.stopPropagation();
                            patchElement(el.key, { visible: !isVis });
                          }}
                        >
                          <Icon name={isVis ? "eye" : "eyeoff"} size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Right: Inspector for the selected element */}
              <div className="card col" style={{ gap: 14 }}>
                <div className="row between wrap" style={{ gap: 8 }}>
                  <h3 style={{ margin: 0 }}>{ELEMENT_KEYS.find((e) => e.key === selectedEl)?.label}</h3>
                  <button className="btn btn-ghost btn-sm" onClick={resetSelectedElement}>Reset element</button>
                </div>

                {/* -------- BACKGROUND INSPECTOR -------- */}
                {selectedEl === "background" && (
                  <div className="col" style={{ gap: 12 }}>
                    <div className="grid2">
                      <div className="field">
                        <label>Background type</label>
                        <Select ariaLabel="Background type" value={layout.bgType} onChange={(v) => patchLayout({ bgType: v })} options={BG_TYPES} />
                      </div>
                      <div className="field">
                        <label>Layout space rule</label>
                        <Select
                          ariaLabel="Layout space reallocation"
                          value={layout.layoutFlow}
                          onChange={(v) => patchLayout({ layoutFlow: v })}
                          options={[
                            { value: "auto-fill", label: "Fill space (re-flow when hidden)" },
                            { value: "keep-space", label: "Keep space (fixed placeholder)" },
                            { value: "free-position", label: "Free position" },
                          ]}
                        />
                      </div>
                    </div>

                    {layout.bgType === "solid" && (
                      <div className="grid2">
                        <div className="field">
                          <label>Background colour</label>
                          <div className="row">
                            <input type="color" value={layout.bgColor} onChange={(e) => patchLayout({ bgColor: e.target.value })} />
                            <input className="input mono" value={layout.bgColor} onChange={(e) => patchLayout({ bgColor: e.target.value })} />
                          </div>
                        </div>
                        <div className="field">
                          <label>Opacity ({layout.bgOpacity}%)</label>
                          <input type="range" min={0} max={100} value={layout.bgOpacity} onChange={(e) => patchLayout({ bgOpacity: +e.target.value })} />
                        </div>
                      </div>
                    )}

                    {(layout.bgType === "gradient" || layout.bgType === "animated-gradient") && (
                      <div className="grid3">
                        <div className="field"><label>Stop 1</label><input type="color" value={layout.gradientStops[0] || "#0B1020"} onChange={(e) => patchLayout({ gradientStops: [e.target.value, layout.gradientStops[1] || "#17254A", layout.gradientStops[2] || "#0B1020"] })} /></div>
                        <div className="field"><label>Stop 2</label><input type="color" value={layout.gradientStops[1] || "#17254A"} onChange={(e) => patchLayout({ gradientStops: [layout.gradientStops[0] || "#0B1020", e.target.value, layout.gradientStops[2] || "#0B1020"] })} /></div>
                        <div className="field"><label>Angle ({layout.gradientAngle}°)</label><input type="range" min={0} max={360} value={layout.gradientAngle} onChange={(e) => patchLayout({ gradientAngle: +e.target.value })} /></div>
                      </div>
                    )}

                    {layout.bgType === "image" && (
                      <div className="col" style={{ gap: 10 }}>
                        <div className="row wrap" style={{ gap: 8 }}>
                          <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                            <Icon name="upload" size={14} /> Upload image (PNG/JPG/WebP ≤ 1 MB)
                            <input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && handleBgImageUpload(e.target.files[0])} />
                          </label>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              const a = document.createElement("a");
                              a.href = generateTemplatePngDataUrl(editMode);
                              a.download = `selah-${editMode}-template-1920x1080.png`;
                              a.click();
                            }}
                          >
                            <Icon name="download" size={14} /> Download 1920×1080 PNG guide
                          </button>
                        </div>
                        <div className="field">
                          <label>Image fit</label>
                          <Select ariaLabel="Background fit" value={layout.bgFit} onChange={(v) => patchLayout({ bgFit: v })} options={FIT_MODES} />
                        </div>
                      </div>
                    )}

                    {/* Background Motion (V1.2 §4.3) */}
                    <div className="card raised col" style={{ gap: 10 }}>
                      <b>Background motion (code-generated, lightweight)</b>
                      <div className="grid2">
                        <div className="field">
                          <label>Motion effect</label>
                          <Select ariaLabel="Background motion" value={layout.bgMotion?.type || "none"} onChange={(v) => patchLayout({ bgMotion: { ...layout.bgMotion, type: v } })} options={BG_MOTIONS} />
                        </div>
                        <div className="field">
                          <label>Motion accent colour</label>
                          <input type="color" value={layout.bgMotion?.color || "#E8B84A"} onChange={(e) => patchLayout({ bgMotion: { ...layout.bgMotion, color: e.target.value } })} />
                        </div>
                      </div>
                      {layout.bgMotion?.type !== "none" && (
                        <div className="grid2">
                          <div className="field"><label>Speed ({layout.bgMotion?.speed ?? 50}%)</label><input type="range" min={10} max={100} value={layout.bgMotion?.speed ?? 50} onChange={(e) => patchLayout({ bgMotion: { ...layout.bgMotion, speed: +e.target.value } })} /></div>
                          <div className="field"><label>Intensity ({layout.bgMotion?.intensity ?? 45}%)</label><input type="range" min={10} max={100} value={layout.bgMotion?.intensity ?? 45} onChange={(e) => patchLayout({ bgMotion: { ...layout.bgMotion, intensity: +e.target.value } })} /></div>
                        </div>
                      )}
                    </div>

                    {/* Container Entrance & Exit (V1.2 §4.4) */}
                    <div className="grid3">
                      <div className="field"><label>Entrance</label><Select ariaLabel="Container entrance" value={layout.entrance} onChange={(v) => patchLayout({ entrance: v })} options={TRANSITION_TYPES} /></div>
                      <div className="field"><label>Exit</label><Select ariaLabel="Container exit" value={layout.exit || layout.entrance} onChange={(v) => patchLayout({ exit: v })} options={TRANSITION_TYPES} /></div>
                      <div className="field"><label>Duration ({layout.transitionDuration}ms)</label><input type="range" min={0} max={1200} step={50} value={layout.transitionDuration} onChange={(e) => patchLayout({ transitionDuration: +e.target.value })} /></div>
                    </div>

                    <div className="grid3">
                      <div className="field"><label>Corner radius ({layout.radius}px)</label><input type="range" min={0} max={60} value={layout.radius} onChange={(e) => patchLayout({ radius: +e.target.value })} /></div>
                      <div className="field"><label>Accent bar ({layout.accentBarHeight}px)</label><input type="range" min={0} max={12} value={layout.accentBarHeight} onChange={(e) => patchLayout({ accentBarHeight: +e.target.value })} /></div>
                      <div className="field"><label>Accent colour</label><input type="color" value={layout.accentBarColor} onChange={(e) => patchLayout({ accentBarColor: e.target.value })} /></div>
                    </div>
                  </div>
                )}

                {/* -------- DIVIDER INSPECTOR (V1.2 §2.4) -------- */}
                {selectedEl === "divider" && (
                  <div className="col" style={{ gap: 12 }}>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <label className="check">
                        <input type="checkbox" checked={!!els.divider.visible} onChange={(e) => patchElement("divider", { visible: e.target.checked })} />
                        <span>Show divider line</span>
                      </label>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => patchElement("divider", { visible: true, style: "gradient", thickness: 2, lengthMode: "percent", lengthValue: 35, marginTop: 10, marginBottom: 10 })}
                      >
                        Preset: Line between verse &amp; reference
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => patchLayout({ refBox: { ...layout.refBox, style: "underline", borderColor: els.divider.color || "#E8B84A", borderWidth: 2 } })}
                      >
                        Preset: Underline the reference
                      </button>
                    </div>
                    <div className="grid3">
                      <div className="field"><label>Style</label><Select ariaLabel="Divider style" value={els.divider.style} onChange={(v) => patchElement("divider", { style: v })} options={DIVIDER_STYLES} /></div>
                      <div className="field"><label>Thickness ({els.divider.thickness}px)</label><input type="range" min={1} max={12} value={els.divider.thickness} onChange={(e) => patchElement("divider", { thickness: +e.target.value })} /></div>
                      <div className="field"><label>Colour</label><input type="color" value={els.divider.color} onChange={(e) => patchElement("divider", { color: e.target.value })} /></div>
                    </div>
                    <div className="grid3">
                      <div className="field"><label>Length mode</label><Select ariaLabel="Length mode" value={els.divider.lengthMode} onChange={(v) => patchElement("divider", { lengthMode: v })} options={[{ value: "full", label: "Full width" }, { value: "percent", label: "Percentage (%)" }, { value: "px", label: "Fixed pixels (px)" }]} /></div>
                      <div className="field"><label>Length ({els.divider.lengthValue})</label><input type="range" min={10} max={els.divider.lengthMode === "px" ? 1200 : 100} value={els.divider.lengthValue} onChange={(e) => patchElement("divider", { lengthValue: +e.target.value })} /></div>
                      <div className="field"><label>Align</label><Select ariaLabel="Divider align" value={els.divider.align} onChange={(v) => patchElement("divider", { align: v })} options={["left", "center", "right"]} /></div>
                    </div>
                    <div className="grid3">
                      <div className="field"><label>Opacity ({els.divider.opacity}%)</label><input type="range" min={5} max={100} value={els.divider.opacity} onChange={(e) => patchElement("divider", { opacity: +e.target.value })} /></div>
                      <div className="field"><label>Space above ({els.divider.marginTop}px)</label><input type="range" min={0} max={60} value={els.divider.marginTop} onChange={(e) => patchElement("divider", { marginTop: +e.target.value })} /></div>
                      <div className="field"><label>Space below ({els.divider.marginBottom}px)</label><input type="range" min={0} max={60} value={els.divider.marginBottom} onChange={(e) => patchElement("divider", { marginBottom: +e.target.value })} /></div>
                    </div>
                    <div className="card raised col" style={{ gap: 8 }}>
                      <div className="row between wrap">
                        <b>Position offset (or drag on canvas)</b>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => patchElement("divider", { x: 0, y: 0 })}>Reset position (0, 0)</button>
                      </div>
                      <div className="grid2">
                        <div className="field"><label>Horizontal X ({els.divider.x || 0}px)</label><input type="range" min={-960} max={960} value={els.divider.x || 0} onChange={(e) => patchElement("divider", { x: +e.target.value })} /></div>
                        <div className="field"><label>Vertical Y ({els.divider.y || 0}px)</label><input type="range" min={-540} max={540} value={els.divider.y || 0} onChange={(e) => patchElement("divider", { y: +e.target.value })} /></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* -------- LOGO INSPECTOR (V1.2 §2.5 & §4.2) -------- */}
                {selectedEl === "logo" && (
                  <div className="col" style={{ gap: 12 }}>
                    <div className="row between wrap" style={{ gap: 8 }}>
                      <label className="check">
                        <input type="checkbox" checked={!!els.logo.visible} onChange={(e) => patchElement("logo", { visible: e.target.checked })} />
                        <span>Show church logo (hiding re-allocates space)</span>
                      </label>
                      <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                        <Icon name="upload" size={14} /> Upload logo (≤ 2 MB)
                        <input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && handleBrandImageUpload("logo", e.target.files[0])} />
                      </label>
                    </div>
                    <div className="field">
                      <label htmlFor="brand-church-name">Church name text</label>
                      <input
                        id="brand-church-name"
                        className="input"
                        maxLength={120}
                        value={draftStyle.churchName || ""}
                        placeholder="e.g. Grace Fellowship Church"
                        onChange={(e) => patchDraftStyle({ churchName: e.target.value })}
                      />
                    </div>
                    <div className="grid3">
                      <div className="field"><label>Size ({els.logo.size}px)</label><input type="range" min={24} max={220} value={els.logo.size} onChange={(e) => patchElement("logo", { size: +e.target.value })} /></div>
                      <div className="field"><label>Position</label><Select ariaLabel="Logo position" value={els.logo.position} onChange={(v) => patchElement("logo", { position: v })} options={editMode === "lowerThird" ? ["left", "right"] : ["top-left", "top-right", "bottom-left", "bottom-right"]} /></div>
                      <div className="field"><label>Shape mask</label><Select ariaLabel="Logo mask" value={els.logo.mask} onChange={(v) => patchElement("logo", { mask: v })} options={["none", "rounded", "circle"]} /></div>
                    </div>
                    {editMode === "fullScreen" && (
                      <div className="card raised col" style={{ gap: 8 }}>
                        <div className="row between wrap">
                          <b>Full-screen position (X / Y or drag on canvas)</b>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => patchElement("logo", { position: "top-left", x: 48, y: 40 })}>Reset top-left</button>
                        </div>
                        <div className="grid2">
                          <div className="field"><label>X ({els.logo.x ?? 48}px)</label><input type="range" min={0} max={1800} value={els.logo.x ?? 48} onChange={(e) => patchElement("logo", { position: "top-left", x: +e.target.value })} /></div>
                          <div className="field"><label>Y ({els.logo.y ?? 40}px)</label><input type="range" min={0} max={1000} value={els.logo.y ?? 40} onChange={(e) => patchElement("logo", { position: "top-left", y: +e.target.value })} /></div>
                        </div>
                      </div>
                    )}
                    <div className="grid3">
                      <div className="field"><label>Opacity ({els.logo.opacity}%)</label><input type="range" min={10} max={100} value={els.logo.opacity} onChange={(e) => patchElement("logo", { opacity: +e.target.value })} /></div>
                      <div className="field"><label>Padding ({els.logo.padding}px)</label><input type="range" min={0} max={32} value={els.logo.padding} onChange={(e) => patchElement("logo", { padding: +e.target.value })} /></div>
                      <div className="field"><label>Logo animation</label><Select ariaLabel="Logo animation" value={els.logo.anim?.type || "fade"} onChange={(v) => patchElement("logo", { anim: { ...els.logo.anim, type: v } })} options={LOGO_ANIMATIONS} /></div>
                    </div>
                  </div>
                )}

                {/* -------- WATERMARK INSPECTOR (V1.2 §2.5) -------- */}
                {selectedEl === "watermark" && (
                  <div className="col" style={{ gap: 12 }}>
                    <div className="row between wrap" style={{ gap: 8 }}>
                      <label className="check">
                        <input type="checkbox" checked={!!els.watermark.visible} onChange={(e) => patchElement("watermark", { visible: e.target.checked })} />
                        <span>Show watermark</span>
                      </label>
                      <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                        <Icon name="upload" size={14} /> Upload watermark
                        <input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && handleBrandImageUpload("watermark", e.target.files[0])} />
                      </label>
                    </div>
                    <div className="grid3">
                      <div className="field"><label>9-point position</label><Select ariaLabel="Watermark position" value={els.watermark.position} onChange={(v) => patchElement("watermark", { position: v })} options={WATERMARK_POSITIONS} /></div>
                      <div className="field"><label>Size ({els.watermark.size}px)</label><input type="range" min={24} max={200} value={els.watermark.size} onChange={(e) => patchElement("watermark", { size: +e.target.value })} /></div>
                      <div className="field"><label>Opacity ({els.watermark.opacity}%)</label><input type="range" min={5} max={100} value={els.watermark.opacity} onChange={(e) => patchElement("watermark", { opacity: +e.target.value })} /></div>
                    </div>
                    <div className="grid2">
                      <div className="field"><label>Blend mode</label><Select ariaLabel="Watermark blend" value={els.watermark.blend} onChange={(v) => patchElement("watermark", { blend: v })} options={["normal", "multiply"]} /></div>
                      <div className="field"><label>Animation</label><Select ariaLabel="Watermark animation" value={els.watermark.anim?.type || "fade"} onChange={(v) => patchElement("watermark", { anim: { ...els.watermark.anim, type: v } })} options={["none", "fade"]} /></div>
                    </div>
                  </div>
                )}

                {/* -------- UNIVERSAL TEXT ELEMENT INSPECTOR (V1.2 §2.2, §2.3, §4.1) -------- */}
                {activeTextEl && (
                  <div className="col" style={{ gap: 12 }}>
                    <div className="row between wrap" style={{ gap: 8 }}>
                      <label className="check">
                        <input type="checkbox" checked={!!activeTextEl.visible} onChange={(e) => patchElement(selectedEl, { visible: e.target.checked })} />
                        <span>Visible</span>
                      </label>
                      <div className="row wrap" style={{ gap: 6 }}>
                        <Select
                          ariaLabel="Target element for style copy"
                          style={{ width: 150 }}
                          value={copyTarget}
                          onChange={setCopyTarget}
                          options={TEXT_ELEMENT_KEYS.filter((k) => k !== selectedEl)}
                        />
                        <button className="btn btn-secondary btn-sm" onClick={() => copyStyleFrom(copyTarget)}>Copy from</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => applyStyleTo(copyTarget)}>Apply to</button>
                      </div>
                    </div>

                    {selectedEl === "churchName" && (
                      <div className="field">
                        <label htmlFor="church-name-input">Church name text</label>
                        <input
                          id="church-name-input"
                          className="input"
                          maxLength={120}
                          value={draftStyle.churchName || ""}
                          placeholder="e.g. Grace Fellowship Church"
                          onChange={(e) => patchDraftStyle({ churchName: e.target.value })}
                        />
                      </div>
                    )}

                    {selectedEl === "customText" && (
                      <div className="field">
                        <label>Custom text content</label>
                        <input className="input" value={activeTextEl.text || ""} placeholder="e.g. Online: yourchurch.org/give" onChange={(e) => patchElement("customText", { text: e.target.value })} />
                      </div>
                    )}

                    {/* Position (X / Y offset) & Quick Placement on Display */}
                    <div className="card raised col" style={{ gap: 8 }}>
                      <div className="row between wrap" style={{ gap: 6 }}>
                        <b>Position on screen (drag on canvas or use sliders)</b>
                        <div className="row wrap" style={{ gap: 4 }}>
                          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: "2px 8px", minHeight: 24 }} onClick={() => patchElement(selectedEl, { y: -180 })}>Move Up</button>
                          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: "2px 8px", minHeight: 24 }} onClick={() => patchElement(selectedEl, { x: 0, y: 0 })}>Center (0, 0)</button>
                          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: "2px 8px", minHeight: 24 }} onClick={() => patchElement(selectedEl, { y: 180 })}>Move Down</button>
                        </div>
                      </div>
                      <div className="grid2">
                        <div className="field">
                          <label>Horizontal X offset ({activeTextEl.x || 0}px)</label>
                          <input type="range" min={-960} max={960} value={activeTextEl.x || 0} onChange={(e) => patchElement(selectedEl, { x: +e.target.value })} />
                        </div>
                        <div className="field">
                          <label>Vertical Y offset ({activeTextEl.y || 0}px)</label>
                          <input type="range" min={-540} max={540} value={activeTextEl.y || 0} onChange={(e) => patchElement(selectedEl, { y: +e.target.value })} />
                        </div>
                      </div>
                    </div>

                    {/* Reference-specific options (V1.2 §2.3) */}
                    {selectedEl === "reference" && (
                      <div className="card raised col" style={{ gap: 10 }}>
                        <b>Reference line &amp; border box options</b>
                        <div className="grid3">
                          <div className="field"><label>Position</label><Select ariaLabel="Reference position" value={layout.refPosition} onChange={(v) => patchLayout({ refPosition: v })} options={REF_POSITIONS} /></div>
                          <div className="field"><label>Format</label><Select ariaLabel="Reference format" value={layout.refFormat || "full"} onChange={(v) => patchLayout({ refFormat: v })} options={REF_FORMATS} /></div>
                          <div className="field"><label>Separator</label><input className="input" value={layout.refSeparator} placeholder=" · " onChange={(e) => patchLayout({ refSeparator: e.target.value })} /></div>
                        </div>
                        <div className="grid3">
                          <div className="field"><label>Border box</label><Select ariaLabel="Reference box style" value={layout.refBox?.style || "none"} onChange={(v) => patchLayout({ refBox: { ...layout.refBox, style: v } })} options={REF_BOX_STYLES} /></div>
                          <div className="field"><label>Box border colour</label><input type="color" value={layout.refBox?.borderColor || "#E8B84A"} onChange={(e) => patchLayout({ refBox: { ...layout.refBox, borderColor: e.target.value } })} /></div>
                          <div className="field"><label>Box thickness ({layout.refBox?.borderWidth ?? 1.5}px)</label><input type="range" min={1} max={6} step={0.5} value={layout.refBox?.borderWidth ?? 1.5} onChange={(e) => patchLayout({ refBox: { ...layout.refBox, borderWidth: +e.target.value } })} /></div>
                        </div>
                      </div>
                    )}

                    {/* Typography */}
                    <div className="grid2">
                      <div className="field">
                        <label>Font family</label>
                        <div className="row" style={{ gap: 6 }}>
                          <div className="grow">
                            <Select ariaLabel="Font family" value={activeTextEl.fontFamily} onChange={(v) => patchElement(selectedEl, { fontFamily: v })} options={allFontOpts} />
                          </div>
                          <label className="btn btn-secondary btn-sm" title="Upload .woff2 font" style={{ cursor: "pointer" }}>
                            .woff2
                            <input type="file" hidden accept=".woff2" onChange={(e) => e.target.files?.[0] && handleFontUpload(e.target.files[0])} />
                          </label>
                        </div>
                      </div>
                      <div className="field">
                        <label>Size ({activeTextEl.fontSize}px) · Weight ({activeTextEl.weight})</label>
                        <div className="row" style={{ gap: 8 }}>
                          <input type="range" min={14} max={140} value={activeTextEl.fontSize} onChange={(e) => patchElement(selectedEl, { fontSize: +e.target.value })} />
                          <Select ariaLabel="Font weight" style={{ width: 110 }} value={String(activeTextEl.weight)} onChange={(v) => patchElement(selectedEl, { weight: +v })} options={["400", "500", "600", "700", "800", "900"]} />
                        </div>
                      </div>
                    </div>

                    {/* Quick style toggles: Bold, Italic, Underline, Transform, Align */}
                    <div className="row wrap" style={{ gap: 8 }}>
                      <button className={`btn btn-sm ${activeTextEl.weight >= 700 ? "btn-primary" : "btn-secondary"}`} onClick={() => patchElement(selectedEl, { weight: activeTextEl.weight >= 700 ? 400 : 800 })}><b>B</b></button>
                      <button className={`btn btn-sm ${activeTextEl.italic ? "btn-primary" : "btn-secondary"}`} onClick={() => patchElement(selectedEl, { italic: !activeTextEl.italic })}><i>I</i></button>
                      <button className={`btn btn-sm ${activeTextEl.underline ? "btn-primary" : "btn-secondary"}`} onClick={() => patchElement(selectedEl, { underline: !activeTextEl.underline })}><u>U</u></button>
                      <Select ariaLabel="Text transform" style={{ width: 135 }} value={activeTextEl.textTransform || "none"} onChange={(v) => patchElement(selectedEl, { textTransform: v })} options={[{ value: "none", label: "Normal case" }, { value: "uppercase", label: "UPPERCASE" }, { value: "capitalize", label: "Capitalize" }]} />
                      <div className="seg">
                        {["left", "center", "right"].map((a) => (
                          <button key={a} aria-pressed={activeTextEl.align === a} onClick={() => patchElement(selectedEl, { align: a })}>{a}</button>
                        ))}
                      </div>
                      <div className="seg">
                        {["top", "middle", "bottom"].map((v) => (
                          <button key={v} aria-pressed={activeTextEl.valign === v} onClick={() => patchElement(selectedEl, { valign: v })}>{v}</button>
                        ))}
                      </div>
                    </div>

                    {/* Colour + Swatches + Opacity + Spacing */}
                    <div className="grid3">
                      <div className="field">
                        <label>Colour</label>
                        <div className="row" style={{ gap: 6 }}>
                          <input type="color" value={activeTextEl.color} onChange={(e) => patchElement(selectedEl, { color: e.target.value })} />
                          <input className="input mono" value={activeTextEl.color} onChange={(e) => patchElement(selectedEl, { color: e.target.value })} />
                        </div>
                        <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
                          {DEFAULT_BRAND_SWATCHES.map((c) => (
                            <button key={c} type="button" aria-label={c} onClick={() => patchElement(selectedEl, { color: c })} style={{ width: 18, height: 18, borderRadius: 4, background: c, border: "1px solid var(--border)", cursor: "pointer" }} />
                          ))}
                        </div>
                      </div>
                      <div className="field">
                        <label>Letter spacing ({activeTextEl.letterSpacing}px) · Line height ({activeTextEl.lineHeight})</label>
                        <input type="range" min={-2} max={12} step={0.5} value={activeTextEl.letterSpacing} onChange={(e) => patchElement(selectedEl, { letterSpacing: +e.target.value })} />
                        <input type="range" min={0.9} max={2.0} step={0.05} value={activeTextEl.lineHeight} onChange={(e) => patchElement(selectedEl, { lineHeight: +e.target.value })} />
                      </div>
                      <div className="field">
                        <label>Opacity ({activeTextEl.opacity}%) · Auto-fit</label>
                        <input type="range" min={10} max={100} value={activeTextEl.opacity} onChange={(e) => patchElement(selectedEl, { opacity: +e.target.value })} />
                        <label className="check" style={{ fontSize: 12 }}><input type="checkbox" checked={!!activeTextEl.autoFit} onChange={(e) => patchElement(selectedEl, { autoFit: e.target.checked })} />Auto-fit text</label>
                      </div>
                    </div>

                    {/* Effects: Shadow, Outline, Glow, Highlight */}
                    <div className="card raised col" style={{ gap: 8 }}>
                      <b>Effects (Shadow · Outline · Glow · Highlight)</b>
                      <div className="grid3">
                        <div className="col" style={{ gap: 4 }}>
                          <label className="check"><input type="checkbox" checked={!!activeTextEl.shadow?.enabled} onChange={(e) => patchElement(selectedEl, { shadow: { ...activeTextEl.shadow, enabled: e.target.checked } })} />Shadow</label>
                          {activeTextEl.shadow?.enabled && (
                            <div className="row" style={{ gap: 4 }}>
                              <input type="color" value={activeTextEl.shadow.color} onChange={(e) => patchElement(selectedEl, { shadow: { ...activeTextEl.shadow, color: e.target.value } })} />
                              <input type="range" min={0} max={40} value={activeTextEl.shadow.blur} onChange={(e) => patchElement(selectedEl, { shadow: { ...activeTextEl.shadow, blur: +e.target.value } })} />
                            </div>
                          )}
                        </div>
                        <div className="col" style={{ gap: 4 }}>
                          <label style={{ fontSize: 12 }}>Outline ({activeTextEl.outline?.width || 0}px)</label>
                          <div className="row" style={{ gap: 4 }}>
                            <input type="color" value={activeTextEl.outline?.color || "#000000"} onChange={(e) => patchElement(selectedEl, { outline: { ...activeTextEl.outline, color: e.target.value } })} />
                            <input type="range" min={0} max={6} step={0.5} value={activeTextEl.outline?.width || 0} onChange={(e) => patchElement(selectedEl, { outline: { ...activeTextEl.outline, width: +e.target.value } })} />
                          </div>
                        </div>
                        <div className="col" style={{ gap: 4 }}>
                          <label className="check"><input type="checkbox" checked={!!activeTextEl.glow?.enabled} onChange={(e) => patchElement(selectedEl, { glow: { ...activeTextEl.glow, enabled: e.target.checked } })} />Glow</label>
                          {activeTextEl.glow?.enabled && (
                            <div className="row" style={{ gap: 4 }}>
                              <input type="color" value={activeTextEl.glow.color} onChange={(e) => patchElement(selectedEl, { glow: { ...activeTextEl.glow, color: e.target.value } })} />
                              <input type="range" min={4} max={40} value={activeTextEl.glow.blur} onChange={(e) => patchElement(selectedEl, { glow: { ...activeTextEl.glow, blur: +e.target.value } })} />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Text Animation In / Out (V1.2 §4.1) */}
                    <div className="card raised col" style={{ gap: 8 }}>
                      <b>Text animation (In / Delay / Stagger)</b>
                      <div className="grid3">
                        <div className="field">
                          <label>Animate in</label>
                          <Select ariaLabel="Text animation in" value={activeTextEl.animIn?.type || "fade"} onChange={(v) => patchElement(selectedEl, { animIn: { ...activeTextEl.animIn, type: v } })} options={TEXT_ANIMATIONS} />
                        </div>
                        <div className="field">
                          <label>Duration ({activeTextEl.animIn?.duration ?? 280}ms)</label>
                          <input type="range" min={0} max={1500} step={20} value={activeTextEl.animIn?.duration ?? 280} onChange={(e) => patchElement(selectedEl, { animIn: { ...activeTextEl.animIn, duration: +e.target.value } })} />
                        </div>
                        <div className="field">
                          <label>Delay ({activeTextEl.animIn?.delay ?? 0}ms)</label>
                          <input type="range" min={0} max={1500} step={20} value={activeTextEl.animIn?.delay ?? 0} onChange={(e) => patchElement(selectedEl, { animIn: { ...activeTextEl.animIn, delay: +e.target.value } })} />
                        </div>
                      </div>
                      <div className="grid2">
                        <div className="field">
                          <label>Easing</label>
                          <Select ariaLabel="Animation easing" value={activeTextEl.animIn?.easing || "ease-out"} onChange={(v) => patchElement(selectedEl, { animIn: { ...activeTextEl.animIn, easing: v } })} options={EASING_TYPES} />
                        </div>
                        <div className="field">
                          <label>Stagger ({activeTextEl.animIn?.stagger ?? 40}ms)</label>
                          <input type="range" min={10} max={200} step={5} value={activeTextEl.animIn?.stagger ?? 40} onChange={(e) => patchElement(selectedEl, { animIn: { ...activeTextEl.animIn, stagger: +e.target.value } })} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save-as-new-template Modal (V1.2 §5.2) */}
      {saveModal && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Save as new template">
          <form className="modal col" style={{ gap: 12 }} onSubmit={confirmSaveAsNew}>
            <h3>Save as new template</h3>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Built-in templates are never overwritten. Give your template a unique name (1–60 characters).</p>
            <div className="field">
              <label htmlFor="tpl-name">Template name</label>
              <input id="tpl-name" className="input" maxLength={60} autoFocus value={saveName} onChange={(e) => { setSaveName(e.target.value); setSaveErr(""); }} />
            </div>
            <div className="grid2">
              <div className="field">
                <label>Slot</label>
                <Select ariaLabel="Template slot" value={saveSlot} onChange={setSaveSlot} options={[{ value: "scripture", label: "Scripture" }, { value: "songs", label: "Songs" }, { value: "text", label: "Text / Announcement" }]} />
              </div>
              <div className="field">
                <label>Description (optional)</label>
                <input className="input" maxLength={240} value={saveDesc} onChange={(e) => setSaveDesc(e.target.value)} placeholder="Short note" />
              </div>
            </div>
            {saveErr && <div className="banner bad"><Icon name="alertc" size={16} /><span>{saveErr}</span></div>}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setSaveModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save template</button>
            </div>
          </form>
        </div>
      )}

      {/* Unsaved Changes Prompt (V1.2 §5.2) */}
      {pendingAction && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Unsaved changes">
          <div className="modal col" style={{ gap: 12 }}>
            <h3>Unsaved template changes</h3>
            <p className="muted" style={{ margin: 0 }}>You have unsaved edits to <b>{draft.name}</b>. Save them as a new template before continuing?</p>
            <div className="row wrap" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setPendingAction(null)}>Keep editing</button>
              <button className="btn btn-danger" onClick={() => { const fn = pendingAction.run; setDirty(false); setPendingAction(null); fn(); }}>Discard</button>
              <button className="btn btn-primary" onClick={openSaveAsModal}>Save as new template</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Custom Template Modal */}
      {renameModal && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Rename template">
          <form
            className="modal col"
            style={{ gap: 12 }}
            onSubmit={async (e) => {
              e.preventDefault();
              const trimmed = renameVal.trim();
              if (!trimmed || trimmed.length > 60) { setRenameErr("Name must be 1–60 characters."); return; }
              if (isTemplateNameTaken(trimmed, themes, renameModal.id)) { setRenameErr("That name already exists. Choose a different name."); return; }
              await saveTheme({ ...renameModal, name: trimmed });
              toast(`Renamed to "${trimmed}".`);
              setRenameModal(null);
            }}
          >
            <h3>Rename template</h3>
            <div className="field">
              <label>New unique name</label>
              <input className="input" maxLength={60} autoFocus value={renameVal} onChange={(e) => { setRenameVal(e.target.value); setRenameErr(""); }} />
            </div>
            {renameErr && <div className="banner bad"><Icon name="alertc" size={16} /><span>{renameErr}</span></div>}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setRenameModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Rename</button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
