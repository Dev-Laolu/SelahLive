"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Logo from "@/components/Logo";
import Icon from "@/components/Icon";
import { useToast } from "@/components/Toast";

const NAV = [
  ["dash", "Dashboard", "chart"],
  ["bible", "Bible versions", "book"],
  ["songs", "Song packs", "music"],
  ["rel", "Releases and notifications", "bell"],
  ["users", "Users", "users"],
  ["audit", "Audit log", "file"],
  ["set", "Settings", "sliders"],
];

let currentCsrfToken = "";

async function authFetch(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    credentials: "include",
    headers: {
      ...(opts.headers || {}),
      ...(currentCsrfToken ? { "x-csrf-token": currentCsrfToken } : {}),
    },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Request failed.");
  return j;
}

function downloadCsv(filename, headers, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function NativeModal({ open, onClose, title, titleId, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      dlg.returnValue = "";
      onClose?.();
    };
    dlg.addEventListener("close", handleClose);
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      const handleClick = (event) => {
        if (event.target !== dlg) return;
        const rect = dlg.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isDialogContent) dlg.close();
      };
      dlg.addEventListener("click", handleClick);
      return () => {
        dlg.removeEventListener("close", handleClose);
        dlg.removeEventListener("click", handleClick);
      };
    }
    return () => dlg.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog ref={ref} className="native-dialog" closedby="any" aria-labelledby={titleId}>
      <div className="row between" style={{ marginBottom: 14 }}>
        <h2 id={titleId} style={{ fontSize: 20 }}>{title}</h2>
        <button type="button" className="iconbtn" aria-label="Close dialog" onClick={() => ref.current?.close()}>
          <Icon name="x" size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function BarChart({ data, valueKey, label, color = "var(--gold)" }) {
  if (!data || !data.length) return <div className="muted">No data for this period.</div>;
  const max = Math.max(1, ...data.map((d) => d[valueKey] || 0));
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row between">
        <b>{label}</b>
        <span className="muted mono" style={{ fontSize: 12 }}>Peak: {max}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120, paddingTop: 12 }}>
        {data.slice(-30).map((d) => {
          const v = d[valueKey] || 0;
          const pct = Math.max(4, Math.round((v / max) * 100));
          return (
            <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }} title={`${d.date}: ${v}`}>
              <div style={{ width: "100%", height: `${pct}%`, background: d.isSunday ? "var(--gold)" : color, borderRadius: "4px 4px 2px 2px", opacity: d.isSunday ? 1 : 0.7 }} />
            </div>
          );
        })}
      </div>
      <div className="row between muted mono" style={{ fontSize: 11 }}>
        <span>{data[Math.max(0, data.length - 30)]?.date}</span>
        <span>Gold bars = Sundays</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function DashboardTab() {
  const [range, setRange] = useState("30d");
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState("");
  const load = () => {
    setErr("");
    authFetch(`/api/admin/analytics?range=${range}`).then(setStats).catch((e) => setErr(e.message));
  };
  useEffect(load, [range]);

  const exportCsv = () => {
    if (!stats?.series) return;
    downloadCsv(
      `selah-analytics-${range}.csv`,
      ["Date", "Sunday", "Installs", "Visits", "Active Users"],
      stats.series.map((s) => [s.date, s.isSunday ? "Yes" : "No", s.installs, s.visits, s.activeUsers])
    );
  };

  const card = (label, val, sub) => (
    <div className="card" key={label}>
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <h2 className="mono" style={{ fontSize: 30, marginTop: 4 }}>{val ?? "—"}</h2>
      {sub && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="row between wrap">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <span className="muted" style={{ fontSize: 13 }}>Anonymous usage metrics — never records which verses or songs are shown.</span>
        </div>
        <div className="row wrap">
          <div className="seg" role="group" aria-label="Date range">
            {[["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["all", "All time"]].map(([k, l]) => (
              <button key={k} aria-pressed={range === k} onClick={() => setRange(k)}>{l}</button>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={!stats?.series?.length}>
            <Icon name="download" size={15} />Export CSV
          </button>
        </div>
      </div>

      {err && (
        <div className="banner bad">
          <Icon name="alertc" size={18} />
          <span className="grow">{err}</span>
          <button className="btn btn-secondary btn-sm" onClick={load}>Retry</button>
        </div>
      )}

      {!stats && !err ? (
        <div className="grid3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 108 }} />)}</div>
      ) : stats && (
        <>
          <div className="grid3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {card("PWA downloads (installs)", stats.installs?.toLocaleString(), `In selected range`)}
            {card("Visits & app opens", stats.visits?.toLocaleString(), `Landing + app opens`)}
            {card("Registered users", stats.registeredUsers?.toLocaleString(), `Firebase Auth accounts`)}
            {card("Active users", `${stats.activeThisSunday ?? 0} Sunday`, `${stats.activeThisWeek ?? 0} active this week`)}
            {card("Update adoption", `${stats.updateAdoption ?? 100}%`, `Active users on latest pack`)}
          </div>

          <div className="grid2">
            <div className="card">
              <BarChart data={stats.series} valueKey="installs" label="PWA installs over time" color="var(--blue)" />
            </div>
            <div className="card">
              <BarChart data={stats.series} valueKey="activeUsers" label="Daily active users (Sunday vs week)" color="var(--ok)" />
            </div>
          </div>

          <div className="card col" style={{ gap: 10 }}>
            <div className="row between">
              <b>Sunday vs rest of week activity</b>
              <span className="chip ok">Avg {stats.sundayVsWeekday?.sundayAvg || 0} churches on Sundays vs {stats.sundayVsWeekday?.weekdayAvg || 0} weekdays</span>
            </div>
            <div className="progress" style={{ height: 10 }}>
              <i style={{ width: `${Math.min(100, Math.round(((stats.sundayVsWeekday?.sundayAvg || 1) / Math.max(1, (stats.sundayVsWeekday?.sundayAvg || 1) + (stats.sundayVsWeekday?.weekdayAvg || 1))) * 100))}%` }} />
            </div>
          </div>

          <div className="grid2">
            <div className="card col">
              <h3>Most active users</h3>
              <div tabIndex={0} role="region" aria-label="Most active users" className="table-wrapper">
                <table className="data-table" style={{ "--label-1": '"User"', "--label-2": '"Church"', "--label-3": '"Days active"', "--label-4": '"Last active"' }}>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Church</th>
                      <th>Days active</th>
                      <th>Last active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stats.topUsers || []).map((u) => (
                      <tr key={u.uid}>
                        <th>{u.name}</th>
                        <td>{u.churchName}</td>
                        <td className="mono">{u.daysActive}</td>
                        <td className="muted">{fmtDate(u.lastActiveAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card col">
              <h3>Top Bible versions & song packs</h3>
              <div tabIndex={0} role="region" aria-label="Top downloaded packs" className="table-wrapper">
                <table className="data-table" style={{ "--label-1": '"Pack"', "--label-2": '"Type"', "--label-3": '"Version"', "--label-4": '"Downloads"' }}>
                  <thead>
                    <tr>
                      <th>Pack</th>
                      <th>Type</th>
                      <th>Version</th>
                      <th>Downloads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stats.topPacks || []).map((p) => (
                      <tr key={p.id}>
                        <th>{p.name}</th>
                        <td><span className="chip">{p.type}</span></td>
                        <td className="mono">v{p.version}</td>
                        <td className="mono gold">{p.downloads}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BiblesTab() {
  const toast = useToast();
  const [bibles, setBibles] = useState(null);
  const [file, setFile] = useState(null);
  const [rep, setRep] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [viewBible, setViewBible] = useState(null);
  const [meta, setMeta] = useState({
    name: "",
    code: "",
    language: "English",
    license: "Public domain",
    rights: false,
    notes: "",
    notificationText: "",
    notify: true,
  });

  const load = () => authFetch("/api/admin/bible").then((r) => setBibles(r.bibles || [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const runUpload = async (action = "validate") => {
    if (!file) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("action", action);
      fd.append("name", meta.name);
      fd.append("code", meta.code);
      fd.append("language", meta.language);
      fd.append("license", meta.license);
      fd.append("rights", String(meta.rights));
      const res = await authFetch("/api/admin/bible/upload", { method: "POST", body: fd });
      setRep(res);
      if (res.draft) {
        setDraft(res.draft);
        if (!meta.notificationText) {
          setMeta((m) => ({ ...m, notificationText: `New Bible version: ${res.draft.name} (${res.draft.code}) is ready to download.` }));
        }
        toast(`Saved ${res.draft.name} (${res.draft.code}) as draft.`);
        load();
      }
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const publish = async (id) => {
    setBusy(true); setErr("");
    try {
      const res = await authFetch(`/api/admin/bible/${id}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: meta.notes, notificationText: meta.notificationText, notify: meta.notify }),
      });
      toast(`Published ${res.bible.name} v${res.bible.version} to manifest.`);
      setDraft(null); setRep(null); setFile(null);
      load();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const act = async (id, action) => {
    try {
      await authFetch("/api/admin/bible", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      toast(action === "delete" ? "Bible version deleted." : "Bible version unpublished from manifest.");
      setConfirmDel(null);
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="col" style={{ gap: 20 }}>
      <h1 className="page-title">Bible versions</h1>

      <div className="card col">
        <h3>Installed & draft translations</h3>
        {!bibles ? (
          <div className="skeleton" style={{ height: 96 }} />
        ) : bibles.length === 0 ? (
          <div className="empty"><Icon name="book" /><b>No Bible versions yet. Upload your first.</b></div>
        ) : (
          <div tabIndex={0} role="region" aria-label="Bible versions" className="table-wrapper">
            <table className="data-table" style={{ "--label-1": '"Name"', "--label-2": '"Code"', "--label-3": '"Language"', "--label-4": '"License"', "--label-5": '"Version"', "--label-6": '"Verses"', "--label-7": '"Status"', "--label-8": '"Published"', "--label-9": '"Actions"' }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Language</th>
                  <th>License</th>
                  <th>Version</th>
                  <th>Verses</th>
                  <th>Status</th>
                  <th>Published</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bibles.map((b) => (
                  <tr key={b.id}>
                    <th>{b.name}</th>
                    <td className="mono gold">{b.code}</td>
                    <td>{b.language}</td>
                    <td>{b.license}</td>
                    <td className="mono">v{b.version}</td>
                    <td className="mono">{(b.verseCount || 0).toLocaleString()}</td>
                    <td>
                      <span className={`chip ${b.status === "published" ? "ok" : b.status === "draft" ? "warn" : ""}`}>
                        {b.status === "published" ? "Published" : b.status === "draft" ? "Draft" : "Unpublished"}
                      </span>
                    </td>
                    <td className="muted">{fmtDate(b.publishedAt)}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setViewBible(b)}>View</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setMeta((m) => ({ ...m, name: b.name, code: b.code, language: b.language, license: b.license }))}>Upload new version</button>
                        {b.status === "draft" && <button className="btn btn-primary btn-sm" onClick={() => publish(b.id)}>Publish</button>}
                        {b.status === "published" && <button className="btn btn-secondary btn-sm" onClick={() => act(b.id, "unpublish")}>Unpublish</button>}
                        <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel(b)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card col" style={{ gap: 16 }}>
        <h3>Upload Bible version (.js, .json or .xml)</h3>
        <label className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setRep(null); setDraft(null); } }}>
          <div>
            <Icon name="upload" size={28} className="gold" />
            <div style={{ marginTop: 6 }}><b>{file ? `${file.name} (${(file.size / 1024).toFixed(1)} KB)` : "Drop a .js, .json or .xml Bible file, or click to choose"}</b></div>
            <div className="muted" style={{ fontSize: 12 }}>Supports JS (var bible_data = [...]), JSON (books → chapters → verses), Zefania XML, and OSIS XML up to 50 MB.</div>
          </div>
          <input type="file" hidden accept=".js,.json,.xml" onChange={(e) => { setFile(e.target.files?.[0] || null); setRep(null); setDraft(null); }} />
        </label>

        <div className="grid2">
          <div className="field"><label htmlFor="b-name">Translation name</label><input id="b-name" className="input" value={meta.name} placeholder="King James Version" onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="b-code">Short code</label><input id="b-code" className="input" value={meta.code} placeholder="KJV" onChange={(e) => setMeta({ ...meta, code: e.target.value.toUpperCase() })} /></div>
          <div className="field"><label htmlFor="b-lang">Language</label><input id="b-lang" className="input" value={meta.language} onChange={(e) => setMeta({ ...meta, language: e.target.value })} /></div>
          <div className="field"><label htmlFor="b-lic">License type</label><select id="b-lic" className="select" value={meta.license} onChange={(e) => setMeta({ ...meta, license: e.target.value })}><option>Public domain</option><option>Licensed</option><option>Other</option></select></div>
        </div>

        <label className="check">
          <input type="checkbox" checked={meta.rights} onChange={(e) => setMeta({ ...meta, rights: e.target.checked })} />
          <span><b>Rights confirmation (required):</b> I have the right to distribute this text.</span>
        </label>

        <div className="row wrap">
          <button className="btn btn-secondary" disabled={!file || busy} onClick={() => runUpload("validate")}>
            {busy ? "Validating…" : "1. Validate and preview"}
          </button>
          <button className="btn btn-secondary" disabled={!file || !rep?.ok || !meta.name || !meta.code || !meta.rights || busy} onClick={() => runUpload("draft")}>
            2. Save as Draft
          </button>
          <button className="btn btn-primary" disabled={!draft || busy} onClick={() => publish(draft.id)}>
            <Icon name="send" size={16} />3. Publish & build .json.gz pack
          </button>
        </div>

        {draft && (
          <div className="card raised col" style={{ gap: 10 }}>
            <b>Release & notification settings for {draft.name} (v{draft.version})</b>
            <div className="grid2">
              <div className="field"><label>Release notes</label><input className="input" value={meta.notes} placeholder="Optional release notes" onChange={(e) => setMeta({ ...meta, notes: e.target.value })} /></div>
              <div className="field"><label>In-app notification text</label><input className="input" value={meta.notificationText} onChange={(e) => setMeta({ ...meta, notificationText: e.target.value })} /></div>
            </div>
            <label className="check"><input type="checkbox" checked={meta.notify} onChange={(e) => setMeta({ ...meta, notify: e.target.checked })} />Notify users in-app when published</label>
          </div>
        )}

        {err && <div className="banner bad"><Icon name="alertc" size={18} /><span className="grow">{err}</span>{file && <button className="btn btn-secondary btn-sm" onClick={() => runUpload("validate")}>Retry</button>}</div>}

        {rep && (
          <div className="col" style={{ gap: 12 }}>
            {rep.errors?.map((e) => <div key={e} className="banner bad"><Icon name="alertc" size={18} />{e}</div>)}
            {rep.ok && <div className="banner ok"><Icon name="checkc" size={18} />Validation passed ({rep.format}). {draft ? "Saved as draft — ready to publish." : "Fill metadata & tick rights confirmation to save as draft."}</div>}
            {rep.counts && (
              <div className="grid3">
                <div className="card raised"><div className="muted">Books</div><h3 className="mono">{rep.counts.books}</h3></div>
                <div className="card raised"><div className="muted">Chapters</div><h3 className="mono">{rep.counts.chapters.toLocaleString()}</h3></div>
                <div className="card raised"><div className="muted">Verses</div><h3 className="mono">{rep.counts.verses.toLocaleString()}</h3></div>
              </div>
            )}
            {(rep.first || rep.last) && (
              <div className="grid2">
                {rep.first && <div className="card raised"><div className="label">First verse ({rep.first.ref})</div><div className="muted">{rep.first.text}</div></div>}
                {rep.last && <div className="card raised"><div className="label">Last verse ({rep.last.ref})</div><div className="muted">{rep.last.text}</div></div>}
              </div>
            )}
            {rep.sample?.length > 0 && (
              <div className="card raised col" style={{ gap: 6 }}>
                <b>5 random sample verses</b>
                {rep.sample.map((s) => <div key={s.ref}><b className="gold">{s.ref}</b> <span className="muted">{s.text}</span></div>)}
              </div>
            )}
            {rep.warnings?.slice(0, 10).map((w, i) => <div key={i} className="banner warn"><Icon name="alert" size={18} />{w}</div>)}
          </div>
        )}
      </div>

      <NativeModal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete Bible version?" titleId="del-bible-title">
        {confirmDel && (
          <div className="col">
            <p className="muted" style={{ margin: 0 }}>Are you sure you want to delete <b>{confirmDel.name} ({confirmDel.code})</b> from the master library? Already-installed copies on church computers will continue to work offline.</p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn btn-secondary" autoFocus onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => act(confirmDel.id, "delete")}>Delete</button>
            </div>
          </div>
        )}
      </NativeModal>

      <NativeModal open={!!viewBible} onClose={() => setViewBible(null)} title={viewBible ? `${viewBible.name} (${viewBible.code})` : "Details"} titleId="view-bible-title">
        {viewBible && (
          <div className="col" style={{ gap: 8 }}>
            <div className="row between"><span className="muted">Version</span><span className="mono">v{viewBible.version}</span></div>
            <div className="row between"><span className="muted">Language</span><span>{viewBible.language}</span></div>
            <div className="row between"><span className="muted">License</span><span>{viewBible.license}</span></div>
            <div className="row between"><span className="muted">Verses</span><span className="mono">{(viewBible.verseCount || 0).toLocaleString()}</span></div>
            <div className="row between"><span className="muted">Pack URL</span><span className="mono" style={{ fontSize: 12 }}>{viewBible.url || "Not published"}</span></div>
            <div className="row between"><span className="muted">SHA-256</span><span className="mono" style={{ fontSize: 11 }}>{viewBible.sha256 ? viewBible.sha256.slice(0, 24) + "…" : "—"}</span></div>
          </div>
        )}
      </NativeModal>
    </div>
  );
}

function SongsTab() {
  const toast = useToast();
  const [packs, setPacks] = useState(null);
  const [files, setFiles] = useState([]);
  const [songs, setSongs] = useState([]);
  const [rep, setRep] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [meta, setMeta] = useState({
    name: "Selah Live Song Library 102",
    language: "English",
    rights: false,
    notes: "",
    notificationText: "New song pack: Selah Live Song Library 102 is ready to download.",
    notify: true,
  });

  const load = () => {
    authFetch("/api/admin/songs").then((r) => {
      setPacks(r.songPacks || []);
      if (r.suggestedName) {
        setMeta((m) => ({
          ...m,
          name: m.name || r.suggestedName,
          notificationText: `New song pack: ${r.suggestedName} is ready to download.`,
        }));
      }
    }).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, []);

  const uploadAndValidate = async () => {
    if (!files.length) return;
    setBusy(true); setErr(""); setDraft(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await authFetch("/api/admin/songs/upload", { method: "POST", body: fd });
      setRep(res);
      setSongs(res.songs || []);
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  // Recompute validation locally whenever admin edits a title inline or removes a song
  const liveValidation = useMemo(() => {
    if (!songs.length && !rep) return null;
    const seen = new Set();
    const problems = [];
    songs.forEach((s, i) => {
      const t = (s.title || "").trim();
      if (!t) problems.push(`Song #${i + 1}: Missing title`);
      if (!s.sections?.length && !s.slides) problems.push(`Empty song: ${t || "(untitled)"}`);
      const k = t.toLowerCase();
      if (k && seen.has(k)) problems.push(`Duplicate title: ${t}`);
      if (k) seen.add(k);
    });
    const errors = [];
    if (songs.length < 20) errors.push(`Minimum 20 songs required per pack (currently ${songs.length}).`);
    return { ok: errors.length === 0 && problems.length === 0, errors, problems };
  }, [songs, rep]);

  const saveDraft = async () => {
    setBusy(true); setErr("");
    try {
      const res = await authFetch("/api/admin/songs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "draft", meta, songs }),
      });
      setDraft(res.draft);
      toast(`Saved ${res.draft.name} (${res.draft.songCount} songs) as draft.`);
      load();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const publish = async (packId) => {
    setBusy(true); setErr("");
    try {
      const res = await authFetch(`/api/admin/songs/${packId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: meta.notes, notificationText: meta.notificationText, notify: meta.notify }),
      });
      toast(`Published ${res.pack.name} v${res.pack.version} to manifest.`);
      setDraft(null); setRep(null); setSongs([]); setFiles([]);
      load();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const act = async (id, action) => {
    try {
      await authFetch("/api/admin/songs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      toast(action === "delete" ? "Song pack deleted." : "Song pack unpublished.");
      setConfirmDel(null);
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="col" style={{ gap: 20 }}>
      <h1 className="page-title">Song packs</h1>

      <div className="card col">
        <h3>Song libraries</h3>
        {!packs ? (
          <div className="skeleton" style={{ height: 96 }} />
        ) : packs.length === 0 ? (
          <div className="empty"><Icon name="music" /><b>No song packs yet. Upload your first.</b></div>
        ) : (
          <div tabIndex={0} role="region" aria-label="Song packs" className="table-wrapper">
            <table className="data-table" style={{ "--label-1": '"Pack name"', "--label-2": '"Language"', "--label-3": '"Songs"', "--label-4": '"Version"', "--label-5": '"Status"', "--label-6": '"Published"', "--label-7": '"Actions"' }}>
              <thead>
                <tr>
                  <th>Pack name</th>
                  <th>Language</th>
                  <th>Songs</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Published</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {packs.map((p) => (
                  <tr key={p.id}>
                    <th>{p.name}</th>
                    <td>{p.language}</td>
                    <td className="mono">{p.songCount}</td>
                    <td className="mono">v{p.version}</td>
                    <td><span className={`chip ${p.status === "published" ? "ok" : "warn"}`}>{p.status === "published" ? "Published" : "Draft"}</span></td>
                    <td className="muted">{fmtDate(p.publishedAt)}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        {p.status === "draft" && <button className="btn btn-primary btn-sm" onClick={() => publish(p.id)}>Publish</button>}
                        {p.status === "published" && <button className="btn btn-secondary btn-sm" onClick={() => act(p.id, "unpublish")}>Unpublish</button>}
                        <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel(p)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card col" style={{ gap: 16 }}>
        <h3>Upload song pack (minimum 20 songs)</h3>
        <label className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) { setFiles([...e.dataTransfer.files]); setRep(null); setDraft(null); } }}>
          <div>
            <Icon name="upload" size={28} className="gold" />
            <div style={{ marginTop: 6 }}><b>{files.length ? `${files.length} file(s) selected: ${files.map((f) => f.name).join(", ")}` : "Drop multiple .txt files, a .zip of .txt files, or a combined .txt (separated by === SONG ===)"}</b></div>
            <div className="muted" style={{ fontSize: 12 }}>Minimum 20 songs per pack. Max 10 MB per file.</div>
          </div>
          <input type="file" hidden multiple accept=".txt,.zip" onChange={(e) => { setFiles([...(e.target.files || [])]); setRep(null); setDraft(null); }} />
        </label>

        <div className="grid2">
          <div className="field"><label htmlFor="sp-name">Pack name</label><input id="sp-name" className="input" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value, notificationText: `New song pack: ${e.target.value} is ready to download.` })} /></div>
          <div className="field"><label htmlFor="sp-lang">Language</label><input id="sp-lang" className="input" value={meta.language} onChange={(e) => setMeta({ ...meta, language: e.target.value })} /></div>
        </div>

        <label className="check">
          <input type="checkbox" checked={meta.rights} onChange={(e) => setMeta({ ...meta, rights: e.target.checked })} />
          <span><b>Rights confirmation (required):</b> I have the right to distribute these songs.</span>
        </label>

        <div className="row wrap">
          <button className="btn btn-secondary" disabled={!files.length || busy} onClick={uploadAndValidate}>
            {busy ? "Parsing…" : "1. Validate and preview"}
          </button>
          <button className="btn btn-secondary" disabled={!liveValidation?.ok || !meta.rights || busy} onClick={saveDraft}>
            2. Save as Draft ({songs.length} songs)
          </button>
          <button className="btn btn-primary" disabled={!draft || songs.length < 20 || busy} onClick={() => publish(draft.id)}>
            <Icon name="send" size={16} />3. Publish song pack
          </button>
          <label className="check" style={{ marginLeft: 8 }}>
            <input type="checkbox" checked={meta.notify} onChange={(e) => setMeta({ ...meta, notify: e.target.checked })} />
            <span>Notify users</span>
          </label>
        </div>

        {err && <div className="banner bad"><Icon name="alertc" size={18} /><span className="grow">{err}</span></div>}

        {liveValidation && (
          <div className="col" style={{ gap: 10 }}>
            {liveValidation.errors.map((e) => <div key={e} className="banner bad"><Icon name="alertc" size={18} />{e}</div>)}
            {liveValidation.problems.map((p, i) => <div key={i} className="banner warn"><Icon name="alert" size={18} />{p}</div>)}
            {liveValidation.ok && <div className="banner ok"><Icon name="checkc" size={18} />{songs.length} songs validated (minimum 20 met). Ready to save draft and publish.</div>}
          </div>
        )}

        {songs.length > 0 && (
          <div className="card raised col" style={{ gap: 10 }}>
            <div className="row between">
              <b>Detected songs ({songs.length}) — edit titles inline or remove songs before publishing</b>
              <span className="chip">{songs.length} / 20 min</span>
            </div>
            <div style={{ maxHeight: 320, overflow: "auto" }} className="col">
              {songs.map((s, idx) => (
                <div key={s.id || idx} className="row" style={{ gap: 10 }}>
                  <span className="mono muted" style={{ width: 28 }}>{idx + 1}.</span>
                  <input
                    className="input"
                    style={{ minHeight: 36, padding: "6px 10px" }}
                    value={s.title}
                    aria-label={`Song ${idx + 1} title`}
                    onChange={(e) => setSongs((list) => list.map((it, i) => (i === idx ? { ...it, title: e.target.value } : it)))}
                  />
                  <span className="muted mono" style={{ fontSize: 12, width: 80 }}>{s.slides || s.sections?.length || 0} slides</span>
                  <button className="btn btn-ghost btn-sm" aria-label={`Remove ${s.title}`} onClick={() => setSongs((list) => list.filter((_, i) => i !== idx))}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <NativeModal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete song pack?" titleId="del-pack-title">
        {confirmDel && (
          <div className="col">
            <p className="muted" style={{ margin: 0 }}>Delete <b>{confirmDel.name}</b> from the master library?</p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn btn-secondary" autoFocus onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => act(confirmDel.id, "delete")}>Delete</button>
            </div>
          </div>
        )}
      </NativeModal>
    </div>
  );
}

function ReleasesTab() {
  const toast = useToast();
  const [releases, setReleases] = useState(null);
  const [err, setErr] = useState("");
  const load = () => authFetch("/api/admin/releases").then((r) => setReleases(r.releases || [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const unpublish = async (id) => {
    try {
      await authFetch(`/api/admin/release/${id}/unpublish`, { method: "POST" });
      toast("Release unpublished and removed from manifest.");
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="col" style={{ gap: 20 }}>
      <div>
        <h1 className="page-title">Releases and notifications</h1>
        <span className="muted" style={{ fontSize: 13 }}>Every published Bible version or song pack creates a release. Unpublishing removes it from the manifest without touching already-installed copies.</span>
      </div>
      {err && <div className="banner bad"><Icon name="alertc" size={18} />{err}</div>}
      <div className="card">
        {!releases ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : releases.length === 0 ? (
          <div className="empty"><Icon name="bell" /><b>No releases yet</b></div>
        ) : (
          <div tabIndex={0} role="region" aria-label="Release history" className="table-wrapper">
            <table className="data-table" style={{ "--label-1": '"Release"', "--label-2": '"Type"', "--label-3": '"Version"', "--label-4": '"Notification text"', "--label-5": '"Notify"', "--label-6": '"Status"', "--label-7": '"Published"', "--label-8": '"Actions"' }}>
              <thead>
                <tr>
                  <th>Release</th>
                  <th>Type</th>
                  <th>Version</th>
                  <th>Notification text</th>
                  <th>Notify</th>
                  <th>Status</th>
                  <th>Published</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {releases.map((r) => (
                  <tr key={r.id}>
                    <th>{r.name}</th>
                    <td><span className="chip">{r.type === "bible" ? "Bible" : "Song pack"}</span></td>
                    <td className="mono">v{r.version}</td>
                    <td className="muted" style={{ maxWidth: 280 }}>{r.notificationText || r.notes}</td>
                    <td>{r.notify ? <span className="chip ok">On</span> : <span className="chip">Off</span>}</td>
                    <td>{r.active ? <span className="chip ok">Live in manifest</span> : <span className="chip">Unpublished</span>}</td>
                    <td className="muted">{fmtDate(r.publishedAt)}</td>
                    <td>
                      {r.active && (
                        <button className="btn btn-secondary btn-sm" onClick={() => unpublish(r.id)}>
                          Unpublish / Roll back
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function UsersTab() {
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  const [err, setErr] = useState("");

  const load = () => authFetch("/api/admin/users").then((r) => setUsers(r.users || [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!users) return [];
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) => `${u.name} ${u.email} ${u.churchName}`.toLowerCase().includes(s));
  }, [users, q]);

  const act = async (uid, action) => {
    try {
      const res = await authFetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uid, action }),
      });
      setUsers(res.users);
      if (selected?.uid === uid) setSelected(res.user);
      const msgs = {
        disable: "Account disabled.",
        enable: "Account re-enabled.",
        grantAdmin: "Granted admin role (custom claim admin: true).",
        revokeAdmin: "Revoked admin role.",
        resetPassword: "Password reset email queued.",
      };
      toast(msgs[action] || "Updated user.");
    } catch (e) {
      setErr(e.message);
    }
  };

  const exportCsv = () => {
    if (!filtered.length) return;
    downloadCsv(
      "selah-users.csv",
      ["Name", "Email", "Church", "Sign-up Date", "Last Active", "Installs", "Status", "Role"],
      filtered.map((u) => [u.name, u.email, u.churchName, u.createdAt, u.lastActiveAt, u.installs, u.status, u.admin ? "Admin" : "User"])
    );
  };

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="row between wrap">
        <div>
          <h1 className="page-title">Users</h1>
          <span className="muted" style={{ fontSize: 13 }}>Manage accounts and roles. Admins never have access to the verses or songs a church displays.</span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={!filtered.length}>
          <Icon name="download" size={15} />Export CSV
        </button>
      </div>

      <div className="search">
        <Icon name="search" />
        <input className="input" style={{ height: 48 }} placeholder="Search by name, email, or church…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
      </div>

      {err && <div className="banner bad"><Icon name="alertc" size={18} />{err}</div>}

      <div className="card">
        {!users ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : filtered.length === 0 ? (
          <div className="empty"><Icon name="users" /><b>No matching users found</b></div>
        ) : (
          <div tabIndex={0} role="region" aria-label="Users directory" className="table-wrapper">
            <table className="data-table" style={{ "--label-1": '"Name"', "--label-2": '"Email"', "--label-3": '"Church"', "--label-4": '"Signed up"', "--label-5": '"Last active"', "--label-6": '"Installs"', "--label-7": '"Status"', "--label-8": '"Actions"' }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Church</th>
                  <th>Signed up</th>
                  <th>Last active</th>
                  <th>Installs</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.uid}>
                    <th>
                      <div className="row" style={{ gap: 8 }}>
                        <span>{u.name}</span>
                        {u.admin && <span className="chip gold">Admin</span>}
                      </div>
                    </th>
                    <td className="mono" style={{ fontSize: 12 }}>{u.email}</td>
                    <td>{u.churchName || "—"}</td>
                    <td className="muted">{fmtDate(u.createdAt)}</td>
                    <td className="muted">{fmtDate(u.lastActiveAt)}</td>
                    <td className="mono">{u.installs || 0}</td>
                    <td>
                      <span className={`chip ${u.status === "disabled" ? "bad" : "ok"}`}>
                        {u.status === "disabled" ? "Disabled" : "Active"}
                      </span>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setSelected(u)}>View</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => act(u.uid, "resetPassword")}>Reset password</button>
                        {u.status === "disabled" ? (
                          <button className="btn btn-secondary btn-sm" onClick={() => act(u.uid, "enable")}>Enable</button>
                        ) : (
                          <button className="btn btn-secondary btn-sm" onClick={() => act(u.uid, "disable")}>Disable</button>
                        )}
                        {u.admin ? (
                          <button className="btn btn-ghost btn-sm" onClick={() => act(u.uid, "revokeAdmin")}>Revoke admin</button>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={() => act(u.uid, "grantAdmin")}>Grant admin</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NativeModal open={!!selected} onClose={() => setSelected(null)} title={selected?.name || "User profile"} titleId="view-user-title">
        {selected && (
          <div className="col" style={{ gap: 10 }}>
            <div className="row between"><span className="muted">Email</span><span className="mono">{selected.email}</span></div>
            <div className="row between"><span className="muted">Church</span><span>{selected.churchName || "—"}</span></div>
            <div className="row between"><span className="muted">Signed up</span><span>{fmtDate(selected.createdAt)}</span></div>
            <div className="row between"><span className="muted">Last active</span><span>{fmtDate(selected.lastActiveAt)}</span></div>
            <div className="row between"><span className="muted">Days active</span><span className="mono">{selected.daysActive || 1}</span></div>
            <div className="row between"><span className="muted">Role</span><span>{selected.admin ? "Admin (admin: true)" : "Church volunteer"}</span></div>
          </div>
        )}
      </NativeModal>
    </div>
  );
}

function AuditTab() {
  const [logs, setLogs] = useState(null);
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  useEffect(() => {
    authFetch("/api/admin/audit").then((r) => setLogs(r.logs || [])).catch(() => setLogs([]));
  }, []);

  const actions = useMemo(() => {
    if (!logs) return [];
    return [...new Set(logs.map((l) => l.action))];
  }, [logs]);

  const filtered = useMemo(() => {
    if (!logs) return [];
    return logs.filter((l) => {
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (dateFilter && !(l.createdAt || "").startsWith(dateFilter)) return false;
      return true;
    });
  }, [logs, actionFilter, dateFilter]);

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="row between wrap">
        <div>
          <h1 className="page-title">Audit log</h1>
          <span className="muted" style={{ fontSize: 13 }}>Read-only record of every admin upload, publish, unpublish, delete, and role change.</span>
        </div>
        <div className="row wrap">
          <select className="select" style={{ width: 200 }} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} aria-label="Filter by action">
            <option value="all">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input type="date" className="input" style={{ width: 170 }} value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} aria-label="Filter by date" />
          {(actionFilter !== "all" || dateFilter) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setActionFilter("all"); setDateFilter(""); }}>Clear</button>
          )}
        </div>
      </div>

      <div className="card">
        {!logs ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : filtered.length === 0 ? (
          <div className="empty"><Icon name="file" /><b>No audit log entries match this filter</b></div>
        ) : (
          <div tabIndex={0} role="region" aria-label="Admin audit log" className="table-wrapper">
            <table className="data-table" style={{ "--label-1": '"Time"', "--label-2": '"Admin"', "--label-3": '"Action"', "--label-4": '"Target"' }}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id}>
                    <th className="mono" style={{ fontWeight: 500, fontSize: 12 }}>{new Date(l.createdAt).toLocaleString()}</th>
                    <td>{l.adminUid}</td>
                    <td><span className="chip mono">{l.action}</span></td>
                    <td>{l.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsTab() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ defaultBibleId: "kjv", starterSongPackId: "starter-101", announcement: "" });
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    authFetch("/api/admin/settings").then((r) => {
      setData(r);
      setForm({
        defaultBibleId: r.settings?.defaultBibleId || "kjv",
        starterSongPackId: r.settings?.starterSongPackId || "starter-101",
        announcement: r.settings?.announcement || "",
      });
    });
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await authFetch("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      toast("Admin settings saved.");
      load();
    } catch (e) {
      toast(e.message);
    }
    setBusy(false);
  };

  const addAdmin = async (e) => {
    e.preventDefault();
    if (!newAdminEmail.trim()) return;
    try {
      await authFetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: newAdminEmail.trim(), action: "grantAdmin" }),
      });
      setNewAdminEmail("");
      toast("Admin added.");
      load();
    } catch (er) {
      toast(er.message);
    }
  };

  const removeAdmin = async (uid) => {
    try {
      await authFetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uid, action: "revokeAdmin" }),
      });
      toast("Admin removed.");
      load();
    } catch (er) {
      toast(er.message);
    }
  };

  const manifestUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/manifest`;

  return (
    <div className="col" style={{ gap: 20 }}>
      <h1 className="page-title">Settings</h1>

      <div className="card col">
        <h3>Manifest status</h3>
        <div className="grid2">
          <div className="field"><label>Public manifest URL</label><input className="input mono" readOnly value={manifestUrl} /></div>
          <div className="field"><label>Current manifest version</label><input className="input mono" readOnly value={`v${data?.manifestVersion ?? 1}`} /></div>
        </div>
      </div>

      <div className="card col">
        <h3>Setup wizard defaults & announcement banner</h3>
        <div className="grid2">
          <div className="field">
            <label htmlFor="def-b">Default Bible version in Setup wizard</label>
            <select id="def-b" className="select" value={form.defaultBibleId} onChange={(e) => setForm({ ...form, defaultBibleId: e.target.value })}>
              {(data?.bibles || [{ id: "kjv", name: "King James Version", code: "KJV" }]).map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="def-s">Starter song pack in Setup wizard</label>
            <select id="def-s" className="select" value={form.starterSongPackId} onChange={(e) => setForm({ ...form, starterSongPackId: e.target.value })}>
              {(data?.songPacks || [{ id: "starter-101", name: "Selah Live Song Library 101" }]).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="ann">Optional announcement banner text (shown inside the app when non-empty)</label>
          <input id="ann" className="input" value={form.announcement} placeholder="e.g. Easter worship song pack is now available in Library!" onChange={(e) => setForm({ ...form, announcement: e.target.value })} />
        </div>
        <div>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save settings"}</button>
        </div>
      </div>

      <div className="card col">
        <h3>Admin management</h3>
        <p className="muted" style={{ margin: 0 }}>Admins carry the Firebase custom claim <code className="mono">admin: true</code> verified on every server request.</p>
        <div className="col" style={{ gap: 8 }}>
          {(data?.settings?.admins || []).map((a) => (
            <div key={a.email || a.uid} className="card raised row between" style={{ padding: "10px 14px" }}>
              <div><b>{a.name || a.email}</b> <span className="muted mono" style={{ fontSize: 12 }}>({a.email})</span></div>
              <button className="btn btn-ghost btn-sm" onClick={() => removeAdmin(a.uid)}>Remove</button>
            </div>
          ))}
        </div>
        <form className="row" onSubmit={addAdmin}>
          <input className="input" type="email" placeholder="admin@church.org" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} aria-label="New admin email" />
          <button className="btn btn-secondary" type="submit"><Icon name="plus" size={16} />Add admin</button>
        </form>
      </div>
    </div>
  );
}

function AdminLoginForm({ mfaEnforced, onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/admin/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, code }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Invalid credentials.");
      currentCsrfToken = data.csrfToken || "";
      onLoggedIn(data.admin);
    } catch (er) {
      setErr(er.message);
    }
    setBusy(false);
  };

  return (
    <div className="auth-bg">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div style={{ display: "grid", placeItems: "center", gap: 10 }}>
          <Logo size={44} stacked />
          <span className="chip gold"><Icon name="shield" size={13} />Owner Admin Portal</span>
        </div>
        <h1 style={{ fontSize: 24, textAlign: "center" }}>Admin sign in</h1>
        {err && <div className="banner bad"><Icon name="alertc" size={16} /><span>{err}</span></div>}
        <div className="field">
          <label htmlFor="admin-user">Admin username</label>
          <input
            id="admin-user"
            className={`input ${err ? "error" : ""}`}
            type="text"
            autoComplete="username"
            required
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter admin username"
          />
        </div>
        <div className="field">
          <label htmlFor="admin-pw">Password</label>
          <div className="pw">
            <input
              id="admin-pw"
              className={`input ${err ? "error" : ""}`}
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
            <button type="button" className="iconbtn" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw(!showPw)}>
              <Icon name={showPw ? "eyeoff" : "eye"} size={18} />
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="admin-code">
            Authenticator / Recovery code {!mfaEnforced && <span className="muted">(optional)</span>}
          </label>
          <input
            id="admin-code"
            className="input mono"
            type="text"
            autoComplete="one-time-code"
            required={mfaEnforced}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit TOTP or XXXXX-XXXXX"
          />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || !username.trim() || !password}>
          {busy ? "Verifying…" : "Sign in to Admin"}
        </button>
        <p className="muted" style={{ fontSize: 12, margin: 0, textAlign: "center" }}>
          Protected by constant-time hash verification, lockout throttling, and 20-minute idle session timeout.
        </p>
      </form>
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState("dash");
  const [adminUser, setAdminUser] = useState(undefined); // undefined = loading, null = signed out
  const [mfaEnforced, setMfaEnforced] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/auth/session", { credentials: "include", cache: "no-store" });
        const data = await r.json().catch(() => ({}));
        setMfaEnforced(!!data.mfaEnforced);
        if (r.ok && data.authenticated) {
          currentCsrfToken = data.csrfToken || "";
          setAdminUser(data.admin);
        } else {
          setAdminUser(null);
        }
      } catch {
        setAdminUser(null);
      }
    })();
  }, []);

  const handleLogout = async () => {
    await fetch("/api/admin/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    currentCsrfToken = "";
    setAdminUser(null);
  };

  if (adminUser === undefined) return <div className="auth-bg"><Logo size={44} stacked /></div>;
  if (!adminUser) return <AdminLoginForm mfaEnforced={mfaEnforced} onLoggedIn={(adm) => setAdminUser(adm)} />;

  return (
    <div className="shell no-preview">
      <header className="topbar">
        <div className="row">
          <Logo />
          <span className="chip gold"><Icon name="shield" size={13} />Owner Admin</span>
        </div>
        <div className="row">
          <span className="chip ok"><Icon name="user" size={13} />{adminUser.username}</span>
          <a className="btn btn-ghost btn-sm" href="/app/scripture">Open app</a>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
            <Icon name="logout" size={15} />Log out
          </button>
        </div>
      </header>
      <nav className="nav" aria-label="Admin navigation">
        {NAV.map(([k, l, i]) => (
          <a key={k} href={`#${k}`} aria-current={tab === k ? "page" : undefined} onClick={(e) => { e.preventDefault(); setTab(k); }}>
            <Icon name={i} size={20} /><span className="lbl">{l}</span>
          </a>
        ))}
      </nav>
      <main className="main">
        {tab === "dash" && <DashboardTab />}
        {tab === "bible" && <BiblesTab />}
        {tab === "songs" && <SongsTab />}
        {tab === "rel" && <ReleasesTab />}
        {tab === "users" && <UsersTab />}
        {tab === "audit" && <AuditTab />}
        {tab === "set" && <SettingsTab />}
      </main>
    </div>
  );
}
