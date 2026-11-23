"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { useApp } from "@/lib/store";
import { useToast } from "@/components/Toast";
import { VoiceModelsTab } from "@/src/voice/ui/VoiceModelsTab";

const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

export default function LibraryPage() {
  const { manifest, packs, updates, installPack, rollbackPack, removePack, downloads, online, refreshManifest } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState("bible");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "voice" || t === "songpack" || t === "bible") setTab(t);
  }, []);
  const type = tab;
  const catalog = (manifest?.packs || []).filter((p) => p.type === type);
  const orphan = packs.filter((p) => p.type === type && !catalog.find((c) => c.id === p.id)).map((p) => ({ id: p.id, type: p.type, name: p.name, version: p.version, language: p.language || "", sizeBytes: 0 }));
  const rows = [...catalog, ...orphan];

  const run = async (entry, verb) => {
    const ok = await installPack(entry);
    toast(ok ? `${entry.name} ${verb === "Update" ? "updated" : "installed"}.` : "That download didn't finish. Your previous version still works. Try again.");
  };

  const handleRollback = async (have) => {
    const prevVer = have.previousPack?.version;
    const ok = await rollbackPack(have);
    if (ok) toast(`Rolled back ${have.name} to v${prevVer}.`);
  };

  return (
    <AppShell preview={false}>
      <div className="row between"><h1 className="page-title">Library</h1>{!online && <span className="chip warn"><Icon name="wifioff" size={14} />You're offline</span>}</div>
      {updates.length > 0 && (
        <div className="banner warn">
          <Icon name="download" size={20} />
          <span className="grow"><b>New Bible version and song pack available</b> — {updates.length} {updates.length === 1 ? "item" : "items"} ready to download.</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setTab(updates[0].type)}>Review</button>
        </div>
      )}
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "bible"} onClick={() => setTab("bible")}>Bible versions</button>
        <button role="tab" aria-selected={tab === "songpack"} onClick={() => setTab("songpack")}>Song packs</button>
        <button role="tab" aria-selected={tab === "voice"} onClick={() => setTab("voice")}>Voice models</button>
      </div>
      {tab === "voice" ? (
        <VoiceModelsTab />
      ) : (
        <>
          {!manifest && packs.length === 0 && online && <div className="col">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}</div>}
          {!manifest && !online && packs.length === 0 && <div className="empty"><Icon name="wifioff" /><b style={{ color: "var(--text)" }}>You're offline</b><span>Connect once to download a Bible version. After that it works offline.</span></div>}
          {!manifest && online && <div className="banner bad"><Icon name="alertc" size={20} /><span className="grow">We couldn't check for updates.</span><button className="btn btn-secondary btn-sm" onClick={refreshManifest}>Retry</button></div>}
          <div className="col" style={{ gap: 8 }}>
            {rows.map((e) => {
              const have = packs.find((p) => p.id === e.id && p.type === e.type);
              const status = !have ? "none" : have.version !== e.version && e.sizeBytes ? "update" : "ok";
              const pct = downloads[e.id];
              return (
                <div key={e.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div className="libwide">
                    <div>
                      <b>{e.name}</b>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {e.language}
                        {e.type === "songpack" && e.songCount ? ` · ${e.songCount} songs` : ""}
                      </div>
                    </div>
                    <span className="muted mono">{e.sizeBytes ? kb(e.sizeBytes) : "—"}</span>
                    <span className="muted mono">v{have ? have.version : e.version}</span>
                    <span className={`chip ${status === "ok" ? "ok" : status === "update" ? "warn" : ""}`}>{status === "ok" ? "Downloaded" : status === "update" ? "Update available" : "Not downloaded"}</span>
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      {status !== "ok" && (
                        <button className="btn btn-primary btn-sm" disabled={pct != null || !online} onClick={() => run(e, status === "update" ? "Update" : "Download")}>
                          <Icon name="download" size={14} />{status === "update" ? "Update" : "Download"}
                        </button>
                      )}
                      {have?.previousPack && (
                        <button className="btn btn-secondary btn-sm" title={`Roll back to v${have.previousPack.version}`} onClick={() => handleRollback(have)}>
                          <Icon name="refresh" size={14} />Roll back
                        </button>
                      )}
                      {have && (
                        <button className="btn btn-ghost btn-sm" aria-label={`Remove ${e.name}`} onClick={() => removePack(have)}>
                          <Icon name="trash" size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  {pct != null && <div className="progress"><i style={{ width: pct * 100 + "%" }} /></div>}
                </div>
              );
            })}
            {manifest && rows.length === 0 && <div className="empty"><Icon name="library" /><b style={{ color: "var(--text)" }}>Nothing here yet</b><span>New {tab === "bible" ? "Bible versions" : "song packs"} will appear when they're published.</span></div>}
          </div>
        </>
      )}
    </AppShell>
  );
}
