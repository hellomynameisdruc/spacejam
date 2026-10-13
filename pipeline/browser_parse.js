// Picks the releases of every map sector out of the Discogs dump, right in a browser tab on
// data.discogs.com (Discogs only lets real browsers download the dump). The dump streams through:
// download → unzip → parse; nothing is written to disk until you save the result. If the connection
// drops, it reconnects and carries on from the same byte (status().retries counts those).
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
  const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

  const S = { state: "idle", bytesIn: 0, total: 0, releases: 0, kept: 0, videos: 0, outMB: 0, retries: 0, lastError: null, t0: 0, error: null, url: null, sectors: {} };
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

  const parser = new DOMParser();
  function handle(xml) {
    S.releases++;
    // quick rejections before the full parse
    if (!xml.includes("youtu")) return;
    if (!GENRES.some((g) => xml.includes(`<genre>${g.replace("&", "&amp;")}</genre>`))) return;
    const genres = [...xml.matchAll(/<genre>([^<]*)<\/genre>/g)].map((m) => unesc(m[1]));
    const stylesQ = [...xml.matchAll(/<style>([^<]*)<\/style>/g)].map((m) => unesc(m[1]));
    const hit = SECT.filter((s) => genres.some((g) => s.genres.has(g)) && stylesQ.some((x) => s.styles.has(x)));
    if (!hit.length) return;
    const el = parser.parseFromString(xml, "text/xml").documentElement;
    if (!el || el.nodeName !== "release") return;
    const q = (sel) => [...el.querySelectorAll(sel)];
    const videos = [];
    for (const v of q("videos > video")) {
      const m = YT.exec(v.getAttribute("src") || "");
      if (m) videos.push([m[1], v.querySelector("title")?.textContent || "", +(v.getAttribute("duration") || 0)]);
    }
    if (!videos.length) return;
    const artist = q("release > artists > artist > name").map((n) => clean(n.textContent)).filter(Boolean).join(" & ") || "Unknown Artist";
    let label = clean(el.querySelector("labels > label")?.getAttribute("name"));
    if (label.toLowerCase().startsWith("not on label")) label = "";
    const released = el.querySelector("release > released")?.textContent || "";
    const year = /^\d{4}/.test(released) ? +released.slice(0, 4) : 0;
    const tracklist = q("tracklist > track > title").map((t) => t.textContent || "");
    out.line(JSON.stringify({
      id: +el.getAttribute("id"), master: +(el.querySelector("release > master_id")?.textContent || 0),
      title: (el.querySelector("release > title")?.textContent || "").trim(), artist, label, year,
      country: el.querySelector("release > country")?.textContent || "",
      genres: q("genres > genre").map((g) => g.textContent),
      styles: q("styles > style").map((s) => s.textContent),
      videos: videos.map(([yt, t, d]) => ({ yt, title: trackTitle(t, artist, tracklist), dur: d })),
    }));
    S.kept++; S.videos += videos.length;
    for (const s of hit) S.sectors[s.id] = (S.sectors[s.id] || 0) + 1;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** the dump's bytes; when the connection drops, reconnects and continues from the same byte */
  async function* bytesFrom(path, opts) {
    let offset = 0, tries = 0;
    for (;;) {
      try {
        const res = await fetch("/?download=" + encodeURIComponent(path), { signal: abort.signal, headers: offset ? { Range: `bytes=${offset}-` } : {} });
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
          offset += v.byteLength; S.bytesIn = offset; tries = 0;
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

  async function run(path, opts = {}) {
    if (S.state === "running") return "already running";
    Object.assign(S, { state: "running", bytesIn: 0, total: 0, releases: 0, kept: 0, videos: 0, outMB: 0, retries: 0, lastError: null, t0: Date.now(), error: null, url: path, sectors: {} });
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
      mbps: +(S.bytesIn / 1e6 / Math.max(1, sec)).toFixed(1), minutes: +(sec / 60).toFixed(1),
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
