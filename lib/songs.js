// Song parsing, slide splitting (max 2 lines per slide), and song pack validation logic.

export function parseSong(raw, maxLinesPerSlide = 2) {
  const lines = (raw || "").replace(/\r/g, "").split("\n");
  const song = { title: "", author: "", language: "English", ccli: "", sections: [] };
  let i = 0;
  while (i < lines.length && /^(title|author|language|ccli)\s*:/i.test(lines[i])) {
    const [k, ...r] = lines[i].split(":");
    song[k.trim().toLowerCase()] = r.join(":").trim();
    i++;
  }
  let body = lines.slice(i);
  if (!song.title) {
    const first = body.findIndex((l) => l.trim() && !/^\s*\[.+?\]\s*$/.test(l));
    if (first >= 0) {
      song.title = body[first].trim();
      body = [...body.slice(0, first), ...body.slice(first + 1)];
    }
  }
  let label = "";
  let buf = [];
  const flush = () => {
    for (let k = 0; k < buf.length; k += maxLinesPerSlide) {
      const text = buf.slice(k, k + maxLinesPerSlide).join("\n").trim();
      if (text) song.sections.push({ label, text });
    }
    buf = [];
  };
  for (const l of body) {
    const m = l.match(/^\s*\[(.+?)\]\s*$/);
    if (m) {
      flush();
      label = m[1];
    } else if (!l.trim()) {
      flush();
    } else {
      buf.push(l.trim());
    }
  }
  flush();
  return song;
}

export function splitSongs(files) {
  const out = [];
  for (const f of files) {
    if (/=== SONG ===/.test(f.text)) {
      out.push(...f.text.split(/^=== SONG ===\s*$/m).map((s) => s.trim()).filter(Boolean));
    } else {
      out.push(f.text);
    }
  }
  return out;
}

export function validateSongs(raws, parseSongFn = parseSong) {
  const songs = raws.map((r, idx) => (typeof r === "object" && r.sections ? r : { ...parseSongFn(r, 2), id: `s${idx + 1}` }));
  const seen = new Map();
  const problems = [];
  songs.forEach((s, i) => {
    if (!s.title || !s.title.trim()) problems.push({ index: i, msg: `Song #${i + 1}: No title` });
    if (!s.sections || !s.sections.length) problems.push({ index: i, msg: `Empty song: ${s.title || "(untitled)"}` });
    const k = (s.title || "").trim().toLowerCase();
    if (k && seen.has(k)) problems.push({ index: i, msg: `Duplicate title: ${s.title}` });
    if (k) seen.set(k, i);
  });
  const MIN = 20;
  const errors = [];
  if (songs.length < MIN) errors.push(`A song pack needs at least ${MIN} songs. This one has ${songs.length}.`);
  return {
    ok: errors.length === 0 && problems.length === 0,
    errors,
    problems,
    songs: songs.map((s, i) => ({
      id: s.id || `s${i + 1}`,
      title: s.title,
      author: s.author || "",
      language: s.language || "English",
      ccli: s.ccli || "",
      slides: s.sections.length,
      sections: s.sections,
    })),
    count: songs.length,
    min: MIN,
  };
}
