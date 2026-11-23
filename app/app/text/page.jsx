"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Select from "@/components/Select";
import { useApp } from "@/lib/store";
import { useToast } from "@/components/Toast";
import { SuggestionTray } from "@/src/voice/ui/SuggestionTray";

export default function TextPage() {
  const {
    show, updateLive, takeLive, live,
    recentTexts, addRecentText,
    savedTexts, saveTextItem, deleteTextItem, toggleFavText, bumpTextUse,
    themes,
  } = useApp();
  const toast = useToast();

  const [activeId, setActiveId] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [favourite, setFavourite] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [onlyFav, setOnlyFav] = useState(false);
  const fileRef = useRef(null);

  const textThemes = useMemo(() => themes.filter((t) => t.slot === "text"), [themes]);
  const allTags = useMemo(() => {
    const s = new Set();
    savedTexts.forEach((t) => (t.tags || []).forEach((tg) => s.add(tg)));
    return ["all", ...Array.from(s).sort()];
  }, [savedTexts]);

  // Filter saved texts & split Favourites on top (most used first, then title — V1.2 §6)
  const { favList, otherList } = useMemo(() => {
    const nq = search.trim().toLowerCase();
    const filtered = savedTexts.filter((t) => {
      if (onlyFav && !t.favourite) return false;
      if (tagFilter !== "all" && !(t.tags || []).includes(tagFilter)) return false;
      if (nq && !`${t.title} ${t.body} ${(t.tags || []).join(" ")}`.toLowerCase().includes(nq)) return false;
      return true;
    });
    const favs = filtered
      .filter((t) => t.favourite)
      .sort((a, b) => ((b.useCount || 0) - (a.useCount || 0)) || (a.title || "").localeCompare(b.title || ""));
    const others = filtered
      .filter((t) => !t.favourite)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    return { favList: favs, otherList: others };
  }, [savedTexts, search, tagFilter, onlyFav]);

  const item = body.trim()
    ? { kind: "text", title: title.trim(), subtitle: "", body: body.trim(), templateId }
    : null;

  // Live Follow: editing text updates overlay smoothly while live
  useEffect(() => {
    if (live && live.kind === "text" && item) {
      updateLive(item);
    }
  }, [title, body, templateId]); // eslint-disable-line

  const openSaved = (t) => {
    setActiveId(t.id);
    setTitle(t.title || "");
    setBody(t.body || "");
    setTagsInput((t.tags || []).join(", "));
    setFavourite(!!t.favourite);
    setTemplateId(t.templateId || "");
    const nextItem = { kind: "text", title: t.title || "", subtitle: "", body: t.body || "", templateId: t.templateId || "" };
    updateLive(nextItem);
  };

  const titleInputRef = useRef(null);

  const startNew = () => {
    setActiveId(null);
    setTitle("");
    setBody("");
    setTagsInput("");
    setFavourite(false);
    setTemplateId("");
    setTimeout(() => titleInputRef.current?.focus(), 20);
  };

  const deriveTitle = () => {
    const t = title.trim();
    if (t) return t;
    const firstLine = body.trim().split("\n")[0]?.trim() || "";
    return firstLine.slice(0, 60) || "Announcement";
  };

  const handleSave = async ({ asNew = false, alsoShow = false } = {}) => {
    if (!title.trim() && !body.trim()) {
      toast("Type a title or message first.", "bad");
      return;
    }
    try {
      const finalTitle = deriveTitle();
      const tags = tagsInput.split(",").map((x) => x.trim()).filter(Boolean);
      const saved = await saveTextItem({
        id: asNew ? null : activeId,
        title: finalTitle,
        body: body.trim(),
        tags,
        favourite,
        templateId,
      });
      setActiveId(saved.id);
      setTitle(saved.title);
      toast(asNew || !activeId ? `Added "${saved.title}" to your Saved Texts.` : `Updated "${saved.title}".`);
      if (alsoShow) {
        const showPayload = { kind: "text", title: saved.title, subtitle: "", body: saved.body, templateId: saved.templateId || "" };
        if (live) takeLive(showPayload);
        else show(showPayload);
        bumpTextUse(saved.id);
      }
    } catch (e) {
      toast(e.message, "bad");
    }
  };

  const handleDuplicate = async (t) => {
    try {
      const saved = await saveTextItem({
        title: `${t.title} (copy)`.slice(0, 100),
        body: t.body,
        tags: t.tags,
        favourite: false,
        templateId: t.templateId,
      });
      openSaved(saved);
      toast(`Duplicated "${t.title}".`);
    } catch (e) {
      toast(e.message, "bad");
    }
  };

  const handleTemplateSelect = (tid) => {
    setTemplateId(tid);
    const tpl = textThemes.find((t) => t.id === tid);
    if (tpl && !title.trim() && !body.trim() && (tpl.placeholderTitle || tpl.placeholderBody)) {
      setTitle(tpl.placeholderTitle || "");
      setBody(tpl.placeholderBody || "");
    }
  };

  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (f) {
      const txt = await f.text();
      setBody(txt.slice(0, 10000));
      if (!title.trim()) setTitle(f.name.replace(/\.txt$/i, "").slice(0, 100));
    }
    e.target.value = "";
  };

  const renderSavedRow = (t) => (
    <div
      key={t.id}
      className={`list-item col ${activeId === t.id ? "active" : ""}`}
      style={{ gap: 4, cursor: "pointer" }}
      onClick={() => openSaved(t)}
    >
      <div className="row between" style={{ gap: 6 }}>
        <b style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</b>
        <div className="row" style={{ gap: 2 }}>
          <button
            type="button"
            className="iconbtn"
            style={{ width: 26, height: 26 }}
            aria-label={t.favourite ? "Remove from favourites" : "Add to favourites"}
            onClick={(e) => { e.stopPropagation(); toggleFavText(t.id); if (activeId === t.id) setFavourite(!t.favourite); }}
          >
            <Icon name="star" size={14} className={t.favourite ? "gold" : "muted"} />
          </button>
          <button
            type="button"
            className="iconbtn"
            style={{ width: 26, height: 26 }}
            aria-label="Duplicate"
            onClick={(e) => { e.stopPropagation(); handleDuplicate(t); }}
          >
            <Icon name="copy" size={13} />
          </button>
          <button
            type="button"
            className="iconbtn"
            style={{ width: 26, height: 26 }}
            aria-label="Delete"
            onClick={async (e) => {
              e.stopPropagation();
              await deleteTextItem(t.id);
              if (activeId === t.id) startNew();
              toast(`Deleted "${t.title}".`);
            }}
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.body}</div>
      {t.tags?.length > 0 && (
        <div className="row wrap" style={{ gap: 4 }}>
          {t.tags.slice(0, 3).map((tg) => <span key={tg} className="chip" style={{ fontSize: 10, padding: "1px 6px" }}>{tg}</span>)}
        </div>
      )}
    </div>
  );

  return (
    <AppShell pending={item}>
      <div className="row between wrap" style={{ gap: 10 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Text &amp; Announcements</h1>
          <span className="muted" style={{ fontSize: 13 }}>Type out any new text, save it to your app list, or push it live to OBS.</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={startNew}><Icon name="plus" size={15} />Create New Text</button>
      </div>

      {/* SG-8: Voice suggestions for Saved Texts (intent triggers like "offering time", "welcome", "prayer") */}
      <SuggestionTray
        filterKind="text"
        savedTexts={savedTexts}
        onOperatorShow={(sugItem) => {
          const found = savedTexts.find((t) => t.id === sugItem.savedTextId);
          if (found) {
            openSaved(found);
            bumpTextUse(found.id);
          }
          if (live) takeLive(sugItem);
          else show(sugItem);
        }}
        onOperatorPreview={(sugItem) => {
          const found = savedTexts.find((t) => t.id === sugItem.savedTextId);
          if (found) openSaved(found);
        }}
      />

      <div className="two" style={{ gridTemplateColumns: "290px 1fr", alignItems: "start" }}>
        {/* Left: Saved Texts library with Favourites pinned on top */}
        <div className="card col" style={{ gap: 10, padding: 12 }}>
          <button className="btn btn-secondary btn-sm btn-block" onClick={startNew}>
            <Icon name="plus" size={15} /> + Type &amp; Add New Text
          </button>
          <div className="row" style={{ gap: 6 }}>
            <input
              className="input"
              placeholder="Search saved texts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className={`btn btn-sm ${onlyFav ? "btn-primary" : "btn-secondary"}`}
              aria-pressed={onlyFav}
              title="Favourites only"
              onClick={() => setOnlyFav((f) => !f)}
            >
              <Icon name="star" size={15} />
            </button>
          </div>
          {allTags.length > 1 && (
            <Select
              ariaLabel="Filter by tag"
              value={tagFilter}
              onChange={setTagFilter}
              options={allTags.map((tg) => ({ value: tg, label: tg === "all" ? "All tags / folders" : tg }))}
            />
          )}

          <div className="col" style={{ gap: 6, maxHeight: 460, overflowY: "auto" }}>
            {favList.length > 0 && (
              <>
                <span className="label" style={{ fontSize: 11 }}>Favourites (most used)</span>
                {favList.map(renderSavedRow)}
              </>
            )}
            {otherList.length > 0 && (
              <>
                <span className="label" style={{ fontSize: 11, marginTop: favList.length ? 6 : 0 }}>Saved texts</span>
                {otherList.map(renderSavedRow)}
              </>
            )}
            {favList.length === 0 && otherList.length === 0 && (
              <div className="muted" style={{ fontSize: 13, padding: 8 }}>No saved texts match your filter.</div>
            )}
          </div>
        </div>

        {/* Right: Editor */}
        <div className="card col" style={{ gap: 12 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <span className="chip">{activeId ? `Editing: ${title || "Saved text"}` : "Creating new text"}</span>
            {activeId && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={startNew}>
                <Icon name="plus" size={14} /> Clear &amp; start fresh
              </button>
            )}
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="t">Title (auto-filled from text if left blank)</label>
              <input ref={titleInputRef} id="t" className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Offering today, Welcome, Sermon Note…" />
            </div>
            <div className="field">
              <label>Template</label>
              <Select
                ariaLabel="Text template"
                value={templateId}
                onChange={handleTemplateSelect}
                options={[
                  { value: "", label: "Default Text template" },
                  ...textThemes.map((t) => ({ value: t.id, label: t.name })),
                ]}
              />
            </div>
          </div>

          <div className="field">
            <div className="row between">
              <label htmlFor="b">Text</label>
              <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()}>
                <Icon name="upload" size={15} />Upload .txt
              </button>
              <input ref={fileRef} type="file" accept=".txt" hidden onChange={upload} />
            </div>
            <textarea
              id="b"
              className="textarea"
              maxLength={10000}
              style={{ minHeight: 170 }}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type or paste what you want to show…"
            />
            <span className="muted mono" style={{ fontSize: 12, textAlign: "right" }}>{body.length.toLocaleString()} / 10,000 characters</span>
          </div>

          <div className="row between wrap" style={{ gap: 10 }}>
            <div className="field grow" style={{ maxWidth: 320 }}>
              <label htmlFor="tags">Tags / folders (comma separated)</label>
              <input id="tags" className="input" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="Service, Giving, Youth" />
            </div>
            <label className="check" style={{ marginTop: 18 }}>
              <input type="checkbox" checked={favourite} onChange={(e) => setFavourite(e.target.checked)} />
              <span>Favourite (pin to top)</span>
            </label>
          </div>

          <div className="row wrap" style={{ gap: 8 }}>
            <button
              className="btn btn-primary"
              disabled={!item}
              onClick={() => {
                if (live) takeLive(item);
                else show(item);
                if (activeId) bumpTextUse(activeId);
                addRecentText({ title: deriveTitle(), body: body.trim() });
              }}
            >
              <Icon name="play" size={16} />{live ? "Update live" : "Show now"}
            </button>

            <button
              className="btn btn-secondary"
              disabled={!title.trim() && !body.trim()}
              onClick={() => handleSave({ asNew: true, alsoShow: false })}
            >
              <Icon name="plus" size={16} />{activeId ? "Save as New Text" : "Save & Add to App"}
            </button>

            {activeId && (
              <button
                className="btn btn-secondary"
                disabled={!title.trim() && !body.trim()}
                onClick={() => handleSave({ asNew: false, alsoShow: false })}
              >
                <Icon name="check" size={16} />Update Existing
              </button>
            )}

            <button
              className="btn btn-ghost"
              disabled={!body.trim()}
              onClick={() => handleSave({ asNew: !activeId, alsoShow: true })}
            >
              Save &amp; Show Live
            </button>
          </div>

          {recentTexts.length > 0 && (
            <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <span className="label">Recent texts</span>
              <div className="row wrap" style={{ gap: 6 }}>
                {recentTexts.map((t, i) => (
                  <button
                    key={i}
                    className="chip clickable"
                    onClick={() => {
                      setActiveId(null);
                      setTitle(t.title || "");
                      setBody(t.body);
                      updateLive({ kind: "text", title: t.title || "", subtitle: "", body: t.body });
                    }}
                  >
                    {(t.title || t.body).slice(0, 36)}{(t.title || t.body).length > 36 ? "…" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
