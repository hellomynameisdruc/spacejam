// Picks the releases of every map sector out of the Discogs dump, right in a browser tab on
// data.discogs.com (Discogs only lets real browsers download the dump). The dump streams through:
// download → unzip → parse; nothing is written to disk until you save the result. If the connection
// drops, it reconnects and carries on from the same byte (status().retries counts those). Where the
// server allows it, 4 parts of the file download at once (kosmos.run(path, {parallel: 1}) for one).
// Releases are kept as they are (gzip-compressed in memory); the pipeline merges editions later
// (pipeline/catalog.py), so the tab only needs a few hundred MB of memory.
//
// Use (in the console on https://data.discogs.com/):
//   kosmos.run("data/2026/discogs_20261001_releases.xml.gz")   // full pass, about an hour
//   kosmos.run(path, {limitBytes: 50e6})                        // quick trial
//   kosmos.status()                                             // progress
//   kosmos.save()                                               // download sectors.jsonl.gz
(() => {
  /*SECTORS*/const SECTORS = [
    { id: "house", genres: ["Electronic"], styles: ["House", "Deep House", "Tech House", "Acid House", "Garage House", "Progressive House", "Hard House", "Ghetto House", "Hip-House", "Italo House", "Electro House", "Speed Garage", "UK Garage", "Euro House", "Latin House", "Afro House", "Jackin House", "Funky House", "Ghettotech"] },
    { id: "techno", genres: ["Electronic"], styles: ["Techno", "Minimal", "Minimal Techno", "Dub Techno", "Deep Techno", "Hard Techno", "Schranz", "Acid", "Bleep"] },
    { id: "disco", genres: ["Electronic", "Funk / Soul"], styles: ["Disco", "Nu-Disco", "Italo-Disco", "Euro-Disco", "Hi NRG", "Boogie"] },
    { id: "trance", genres: ["Electronic"], styles: ["Trance", "Progressive Trance", "Psy-Trance", "Goa Trance", "Hard Trance", "Tech Trance"] },
    { id: "dnb", genres: ["Electronic"], styles: ["Drum n Bass", "Jungle", "Breakbeat", "Breaks", "Progressive Breaks", "Big Beat", "Breakcore", "Halftime"] },
    { id: "ambient", genres: ["Electronic"], styles: ["Ambient", "Downtempo", "IDM", "Trip Hop", "Dark Ambient", "Berlin-School", "Illbient", "Glitch"] },
  ];/*END*/
  const SECT = SECTORS.map((s) => ({ id: s.id, genres: new Set(s.genres), styles: new Set(s.styles) }));
  const GENRES = [...new Set(SECTORS.flatMap((s) => s.genres))];
  const YT = /(?:v=|youtu\.be\/|\/embed\/)([A-Za-z0-9_-]{11})/;
  const DISAMBIG = /\s\(\d+\)$/;
  const clean = (s) => (s || "").trim().replace(DISAMBIG, "");

  const S = { state: "idle", bytesIn: 0, dl: 0, mode: null, total: 0, releases: 0, kept: 0, videos: 0, outMB: 0, retries: 0, lastError: null, t0: 0, error: null, url: null, sectors: {} };
  let abort = null, out = null;

  function trackTitle(vt, artist, tracklist) {
    const low = vt.toLowerCase();
    for (const t of [...tracklist].sort((a, b) => b.length - a.length)) if (t.length > 2 && low.includes(t.toLowerCase())) return t;
    const parts = vt.split(/\s[-–—]\s/);
    if (parts.length >= 2 && artist && parts[0].trim().toLowerCase().startsWith(artist.toLowerCase().slice(0, 6))) return parts.slice(1).join(" - ").trim();
    return vt.trim();
  }

  /** gzip output kept in memory: text goes in, compressed chunks pile up */
  function gzipSink() {
    const cs = new CompressionStream("gzip"), w = cs.writable.getWriter(), chunks = [];
    let pending = "", size = 0;
    const drained = (async () => { const r = cs.readable.getReader(); for (;;) { const { done, value } = await r.read(); if (done) return; chunks.push(value); size += value.byteLength; S.outMB = +(size / 1e6).toFixed(1); } })();
    const flush = () => { if (pending) { w.write(new TextEncoder().encode(pending)); pending = ""; } };
    return {
      line(s) { pending += s + "\n"; if (pending.length > 1 << 20) flush(); },
      async close() { flush(); await w.close(); await drained; return new Blob(chunks, { type: "application/gzip" }); },
    };
  }

  // Release fields are read with plain string matching (a DOM parse per release was the bottleneck).
  // Same results as the DOM selectors it replaced: release-level fields are read with the nested
  // parts (tracklist, extra artists, videos, companies, series) cut out.
  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  const text = (s) => (s || "").replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e) =>
    e[0] !== "#" ? ENT[e] : String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)));
  const section = (xml, tag) => { const a = xml.indexOf(`<${tag}>`); if (a < 0) return ""; const b = xml.indexOf(`</${tag}>`, a); return b < 0 ? "" : xml.slice(a + tag.length + 2, b); };
  const cut = (xml, tag) => xml.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>|<${tag}\\s*/>`, "g"), "");
  const tagText = (xml, tag) => { const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`).exec(xml); return m ? text(m[1]) : ""; };
  const attr = (attrs, name) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs); return m ? text(m[1]) : ""; };
  const all = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, "g"))].map((m) => text(m[1]));

  function handle(xml) {
    S.releases++;
    // quick rejections before reading the rest
    if (!xml.includes("youtu")) return;
    if (!GENRES.some((g) => xml.includes(`<genre>${g.replace("&", "&amp;")}</genre>`))) return;
    const genres = all(xml, "genre"), styles = all(xml, "style");
    const hit = SECT.filter((s) => genres.some((g) => s.genres.has(g)) && styles.some((x) => s.styles.has(x)));
    if (!hit.length) return;
    const videos = [];
    for (const m of section(xml, "videos").matchAll(/<video\b([^>]*?)(\/>|>([\s\S]*?)<\/video>)/g)) {
      const y = YT.exec(attr(m[1], "src"));
      if (y) videos.push([y[1], m[3] ? tagText(m[3], "title") : "", +(attr(m[1], "duration") || 0)]);
    }
    if (!videos.length) return;
    let head = xml;
    for (const t of ["tracklist", "extraartists", "videos", "companies", "series"]) head = cut(head, t);
    const artist = section(head, "artists").split("</artist>").map((a) => clean(tagText(a, "name"))).filter(Boolean).join(" & ") || "Unknown Artist";
    const lm = /<label\b([^>]*)>/.exec(section(head, "labels"));
    let label = clean(lm ? attr(lm[1], "name") : "");
    if (label.toLowerCase().startsWith("not on label")) label = "";
    const released = tagText(head, "released");
    const year = /^\d{4}/.test(released) ? +released.slice(0, 4) : 0;
    const tracklist = cut(section(xml, "tracklist"), "sub_tracks").split("</track>").filter((t) => t.includes("<track")).map((t) => tagText(cut(cut(t, "artists"), "extraartists"), "title"));
    const id = /^<release\b[^>]*\bid="(\d+)"/.exec(xml);
    out.line(JSON.stringify({
      id: id ? +id[1] : 0, master: +(tagText(head, "master_id") || 0),
      title: tagText(head, "title").trim(), artist, label, year,
      country: tagText(head, "country"),
      genres, styles,
      videos: videos.map(([yt, t, d]) => ({ yt, title: trackTitle(t, artist, tracklist), dur: d })),
    }));
    S.kept++; S.videos += videos.length;
    for (const s of hit) S.sectors[s.id] = (S.sectors[s.id] || 0) + 1;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const url = (path) => "/?download=" + encodeURIComponent(path);

  /** one stream from `from` to the end; when the connection drops, reconnects at the same byte */
  async function* sequential(path, opts) {
    let offset = 0, tries = 0;
    for (;;) {
      try {
        const res = await fetch(url(path), { signal: abort.signal, headers: offset ? { Range: `bytes=${offset}-` } : {} });
        if (!res.ok) throw new Error("HTTP " + res.status);
        if (!S.total) S.total = +(res.headers.get("content-length") || 0);
        let skip = offset && res.status !== 206 ? offset : 0; // server ignored the range: skip what we have
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            if (S.total && offset < S.total) throw new Error(`cut short at ${offset}`);
            return;
          }
          let v = value;
          if (skip) { if (v.byteLength <= skip) { skip -= v.byteLength; continue; } v = v.subarray(skip); skip = 0; }
          offset += v.byteLength; S.bytesIn = offset; S.dl = offset; tries = 0;
          yield v;
          if (opts.limitBytes && offset > opts.limitBytes) return;
        }
      } catch (e) {
        if (abort.signal.aborted) throw e;
        if (++tries > 60) throw e;
        S.retries++; S.lastError = String(e);
        console.warn(`kosmos: connection dropped at ${(offset / 1e6).toFixed(0)} MB, reconnecting (${tries})…`, e);
        await sleep(Math.min(30000, 1500 * tries));
      }
    }
  }

  /** bytes a..b (inclusive) as a list of chunks; retries from where it stopped */
  async function segment(path, a, b) {
    const parts = []; let got = 0, tries = 0;
    while (a + got <= b) {
      try {
        const res = await fetch(url(path), { signal: abort.signal, headers: { Range: `bytes=${a + got}-${b}` } });
        if (res.status !== 206) throw new Error("HTTP " + res.status + " (expected 206)");
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value); got += value.byteLength; S.dl += value.byteLength; tries = 0;
        }
        if (a + got <= b) throw new Error(`segment cut short at ${a + got}`);
      } catch (e) {
        if (abort.signal.aborted) throw e;
        if (++tries > 60) throw e;
        S.retries++; S.lastError = String(e);
        console.warn(`kosmos: segment ${(a / 1e6).toFixed(0)} MB dropped, retrying (${tries})…`, e);
        await sleep(Math.min(30000, 1500 * tries));
      }
    }
    return parts;
  }

  /** the dump's bytes in order. If the server allows ranges, several parts download at once (one
   * connection is often throttled) and are handed on in order; otherwise one resumable stream. */
  async function* bytesFrom(path, opts) {
    const N = opts.parallel ?? 4, SEG = opts.segmentMB ? opts.segmentMB * 1e6 : 16e6;
    let total = 0;
    if (N > 1) {
      try {
        const probe = new AbortController();
        const res = await fetch(url(path), { signal: probe.signal, headers: { Range: "bytes=0-0" } });
        const m = /\/(\d+)\s*$/.exec(res.headers.get("content-range") || "");
        if (res.status === 206 && m) total = +m[1];
        probe.abort();
      } catch (e) { console.warn("kosmos: range probe failed, using one connection", e); }
    }
    if (!total) { S.mode = "single"; yield* sequential(path, opts); return; }
    S.mode = `parallel ×${N}`; S.total = total;
    const end = opts.limitBytes ? Math.min(total, opts.limitBytes + SEG) : total;
    const queue = []; let next = 0;
    const fill = () => {
      while (queue.length < N && next < end) {
        const p = segment(path, next, Math.min(next + SEG, end) - 1); p.catch(() => {});
        queue.push(p); next += SEG;
      }
    };
    fill();
    while (queue.length) {
      const parts = await queue.shift();
      fill();
      for (const v of parts) { S.bytesIn += v.byteLength; yield v; }
      if (opts.limitBytes && S.bytesIn > opts.limitBytes) return;
    }
  }

  async function run(path, opts = {}) {
    if (S.state === "running") return "already running";
    Object.assign(S, { state: "running", bytesIn: 0, total: 0, releases: 0, kept: 0, videos: 0, outMB: 0, dl: 0, mode: null, retries: 0, lastError: null, t0: Date.now(), error: null, url: path, sectors: {} });
    out = gzipSink(); abort = new AbortController(); result = null;
    try {
      const ds = new DecompressionStream("gzip"), w = ds.writable.getWriter();
      const pump = (async () => { for await (const v of bytesFrom(path, opts)) await w.write(v); await w.close(); })();
      pump.catch((e) => w.abort(e).catch(() => {}));
      const reader = ds.readable.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        let r;
        try { r = await reader.read(); } catch (e) { if (opts.limitBytes) break; throw e; }
        if (r.done) break;
        buf += r.value;
        let start = buf.indexOf("<release "), end;
        while (start !== -1 && (end = buf.indexOf("</release>", start)) !== -1) {
          handle(buf.slice(start, end + 10));
          start = buf.indexOf("<release ", end + 10);
        }
        buf = start === -1 ? buf.slice(-20) : buf.slice(start);
      }
      S.state = "done";
    } catch (e) {
      if (opts.limitBytes && S.bytesIn > opts.limitBytes) S.state = "done";
      else { S.state = "error"; S.error = String(e); }
    }
    return status();
  }

  function status() {
    const sec = (Date.now() - S.t0) / 1000;
    return { ...S, mb: Math.round(S.bytesIn / 1e6), pct: S.total ? +(S.bytesIn * 100 / S.total).toFixed(1) : null,
      mbps: +(S.bytesIn / 1e6 / Math.max(1, sec)).toFixed(1), dlMbps: +(S.dl / 1e6 / Math.max(1, sec)).toFixed(1), minutes: +(sec / 60).toFixed(1),
      etaMin: S.total && S.bytesIn ? Math.round((S.total - S.bytesIn) / (S.bytesIn / Math.max(1, sec)) / 60) : null };
  }

  let result = null;
  async function blob() { if (!result) result = await out.close(); return result; }

  async function save(name = "sectors.jsonl.gz") {
    if (S.state === "running") return "still running — wait for state: done";
    const b = await blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = name;
    document.body.appendChild(a); a.click();
    return { file: name, mb: +(b.size / 1e6).toFixed(1), releases: S.kept, sectors: S.sectors };
  }

  function stop() { abort?.abort(); }

  window.kosmos = { run, status, save, blob, stop };
  return "kosmos ready";
})();
