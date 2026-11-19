// Song parsing, slide splitting, and V1.2 §7.1 strict song pack TXT validation with line numbers.

export function songSlides(song, maxLinesPerSlide = 2) {
  if (!song?.sections?.length) return [];
  const out = [];
  for (const sec of song.sections) {
    const lines = String(sec.text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i += Math.max(1, maxLinesPerSlide)) {
      out.push({ label: sec.label || "", text: lines.slice(i, i + maxLinesPerSlide).join("\n") });
    }
  }
  return out;
}

export function parseSong(raw, maxLinesPerSlide = 2) {
  const lines = (raw || "").replace(/\r/g, "").split("\n").filter((l) => !l.trim().startsWith("#"));
  const song = { title: "", author: "", language: "English", ccli: "", sections: [] };
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
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
    if (!buf.length) return;
    if (maxLinesPerSlide && maxLinesPerSlide > 0) {
      for (let k = 0; k < buf.length; k += maxLinesPerSlide) {
        const text = buf.slice(k, k + maxLinesPerSlide).join("\n").trim();
        if (text) song.sections.push({ label, text });
      }
    } else {
      const text = buf.join("\n").trim();
      if (text) song.sections.push({ label, text });
    }
    buf = [];
  };
  for (const l of body) {
    const m = l.match(/^\s*\[(.+?)\]\s*$/);
    if (m) {
      flush();
      label = m[1].trim();
    } else if (!l.trim()) {
      flush();
    } else {
      buf.push(l.trim());
    }
  }
  flush();
  return song;
}

// V1.2 §7.1 Exact Pack Parser with file + 1-based line numbers for every error and warning.
export function parseSongPackFiles(files = [], minSongs = 5) {
  const MIN = Math.max(5, Number(minSongs) || 5);
  const songs = [];
  const errors = [];
  const warnings = [];
  const problems = []; // backwards-compatible flat list for UI

  const addErr = (file, line, msg) => {
    const full = `${file ? `${file} ` : ""}Line ${line}: ${msg}`;
    errors.push({ file, line, msg, full });
    problems.push({ file, line, severity: "error", msg: full });
  };
  const addWarn = (file, line, msg) => {
    const full = `${file ? `${file} ` : ""}Line ${line}: ${msg}`;
    warnings.push({ file, line, msg, full });
    problems.push({ file, line, severity: "warn", msg: full });
  };

  for (const f of files) {
    const fileName = f.name || "songs.txt";
    const text = String(f.text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (text.includes("\uFFFD")) {
      addWarn(fileName, 1, "Encoding warning: non-UTF-8 characters detected. Please save the file as UTF-8.");
    }
    const allLines = text.split("\n");

    // Split into song chunks tracking exact 1-based starting line number
    const chunks = [];
    const hasDelimiter = allLines.some((l) => l.trim() === "=== SONG ===");
    if (hasDelimiter) {
      let cur = [];
      let startLine = 1;
      let started = false;
      for (let idx = 0; idx < allLines.length; idx++) {
        const lineNo = idx + 1;
        const rawLine = allLines[idx];
        if (rawLine.trim() === "=== SONG ===") {
          if (started && cur.some((x) => x.text.trim() && !x.text.trim().startsWith("#"))) {
            chunks.push({ startLine, lines: cur });
          }
          cur = [];
          startLine = lineNo + 1;
          started = true;
        } else {
          if (!started && rawLine.trim() && !rawLine.trim().startsWith("#")) {
            started = true;
            startLine = lineNo;
          }
          if (started) cur.push({ lineNo, text: rawLine });
        }
      }
      if (started && cur.some((x) => x.text.trim() && !x.text.trim().startsWith("#"))) {
        chunks.push({ startLine, lines: cur });
      }
    } else {
      const nonEmpty = allLines.some((l) => l.trim() && !l.trim().startsWith("#"));
      if (nonEmpty) {
        chunks.push({
          startLine: 1,
          lines: allLines.map((t, i) => ({ lineNo: i + 1, text: t })),
        });
      }
    }

    for (const chunk of chunks) {
      const song = {
        id: `s${songs.length + 1}`,
        title: "",
        author: "",
        language: "English",
        ccli: "",
        sections: [],
        sourceFile: fileName,
        startLine: chunk.startLine,
      };

      // Filter out `#` comment lines while preserving original line numbers
      const active = chunk.lines.filter((l) => !l.text.trim().startsWith("#"));
      let idx = 0;
      while (idx < active.length && !active[idx].text.trim()) idx++;

      // Header lines: Title (required), Author, Language, CCLI
      let sawBlankAfterHeader = false;
      while (idx < active.length) {
        const { lineNo, text: line } = active[idx];
        if (!line.trim()) {
          sawBlankAfterHeader = true;
          idx++;
          break;
        }
        const hm = line.match(/^(Title|Author|Language|CCLI)\s*:\s*(.*)$/i);
        if (hm) {
          const key = hm[1].toLowerCase();
          song[key] = hm[2].trim();
          idx++;
        } else {
          break;
        }
      }

      if (!song.title) {
        addErr(fileName, chunk.startLine, "Missing required 'Title:' header.");
      }

      // Lyrics: blank line separates slides, [Section] applies to slides after it
      let currentLabel = "";
      let slideBuf = [];
      let slideStartLine = chunk.startLine;

      const flushSlide = () => {
        if (!slideBuf.length) return;
        if (slideBuf.length > 40) {
          addErr(fileName, slideStartLine, `Slide in "${song.title || "(untitled)"}" has ${slideBuf.length} lines (hard limit is 40 lines per slide).`);
        }
        song.sections.push({
          label: currentLabel,
          text: slideBuf.join("\n"),
        });
        slideBuf = [];
      };

      for (; idx < active.length; idx++) {
        const { lineNo, text: line } = active[idx];
        const trimmed = line.trim();
        if (!trimmed) {
          flushSlide();
          continue;
        }
        const secMatch = trimmed.match(/^\[(.+?)\]$/);
        if (secMatch) {
          flushSlide();
          currentLabel = secMatch[1].trim();
          continue;
        }
        if (trimmed.length > 400) {
          addErr(fileName, lineNo, `Line exceeds hard maximum length (${trimmed.length} characters).`);
        } else if (trimmed.length > 120) {
          addWarn(fileName, lineNo, `Line is ${trimmed.length} characters (recommended max 120 characters).`);
        }
        if (!slideBuf.length) slideStartLine = lineNo;
        slideBuf.push(trimmed);
      }
      flushSlide();

      if (song.sections.length === 0) {
        addErr(fileName, chunk.startLine, `Empty song (no lyrics found) for "${song.title || "(untitled)"}".`);
      } else if (song.sections.length > 200) {
        addErr(fileName, chunk.startLine, `Song "${song.title}" has ${song.sections.length} slides (max 200 slides per song).`);
      }

      songs.push(song);
    }
  }

  // Flag duplicate titles within pack (warn)
  const seen = new Map();
  songs.forEach((s) => {
    const k = (s.title || "").trim().toLowerCase();
    if (!k) return;
    if (seen.has(k)) {
      addWarn(s.sourceFile, s.startLine, `Duplicate title "${s.title}" (first seen at line ${seen.get(k)}).`);
    } else {
      seen.set(k, s.startLine);
    }
  });

  // Minimum songs enforcement (admin-selected pack size, absolute floor 5)
  const topErrors = errors.map((e) => e.full);
  if (songs.length < MIN) {
    const needed = MIN - songs.length;
    topErrors.unshift(`This pack has ${songs.length} song${songs.length === 1 ? "" : "s"}. Add at least ${needed} more (minimum ${MIN}).`);
  }

  return {
    ok: topErrors.length === 0,
    errors: topErrors,
    warnings: warnings.map((w) => w.full),
    problems,
    songs: songs.map((s) => ({
      id: s.id,
      title: s.title,
      author: s.author,
      language: s.language || "English",
      ccli: s.ccli || "",
      slides: s.sections.length,
      sections: s.sections,
      sourceFile: s.sourceFile,
      startLine: s.startLine,
    })),
    count: songs.length,
    min: MIN,
  };
}

export function splitSongs(files) {
  return files;
}

export function validateSongs(filesOrSongs, minSongs = 5) {
  const MIN = Math.max(5, Number(minSongs) || 5);
  if (!Array.isArray(filesOrSongs) || filesOrSongs.length === 0) {
    return {
      ok: false,
      errors: [`This pack has 0 songs. Add at least ${MIN} more (minimum ${MIN}).`],
      warnings: [],
      problems: [],
      songs: [],
      count: 0,
      min: MIN,
    };
  }
  // Case 1: Raw uploaded files ({ name, text })
  if (typeof filesOrSongs[0] === "object" && "text" in filesOrSongs[0]) {
    return parseSongPackFiles(filesOrSongs, MIN);
  }
  // Case 2: Already-parsed song objects ({ title, sections: [...] }) from Admin Save Draft
  if (typeof filesOrSongs[0] === "object" && Array.isArray(filesOrSongs[0].sections)) {
    const errors = [];
    const warnings = [];
    const problems = [];
    const seen = new Map();
    const normalized = filesOrSongs.map((s, idx) => {
      const title = String(s.title || "").trim();
      const sections = Array.isArray(s.sections) ? s.sections : [];
      if (!title) {
        const msg = `Song #${idx + 1}: Missing required title.`;
        errors.push(msg);
        problems.push({ index: idx, severity: "error", msg });
      }
      if (!sections.length) {
        const msg = `Empty song (no lyrics): "${title || "(untitled)"}".`;
        errors.push(msg);
        problems.push({ index: idx, severity: "error", msg });
      }
      const k = title.toLowerCase();
      if (k && seen.has(k)) {
        const msg = `Duplicate title "${title}".`;
        warnings.push(msg);
        problems.push({ index: idx, severity: "warn", msg });
      } else if (k) {
        seen.set(k, idx + 1);
      }
      return {
        id: s.id || `s${idx + 1}`,
        title,
        author: String(s.author || "").trim(),
        language: String(s.language || "English").trim(),
        ccli: String(s.ccli || "").trim(),
        slides: sections.length,
        sections,
      };
    });
    if (normalized.length < MIN) {
      const needed = MIN - normalized.length;
      errors.unshift(`This pack has ${normalized.length} song${normalized.length === 1 ? "" : "s"}. Add at least ${needed} more (minimum ${MIN}).`);
    }
    return {
      ok: errors.length === 0,
      errors,
      warnings,
      problems,
      songs: normalized,
      count: normalized.length,
      min: MIN,
    };
  }
  // Case 3: Array of raw song strings
  const wrapped = filesOrSongs.map((r, i) => ({ name: `song-${i + 1}.txt`, text: typeof r === "string" ? r : "" }));
  return parseSongPackFiles(wrapped, MIN);
}
