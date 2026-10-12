// Відбір хаус-релізів з дампу Discogs прямо у вкладці браузера на data.discogs.com.
// Дамп іде потоком: завантаження → розпаковка → розбір, на диск нічого не пишеться.
// Логіка повторює pipeline/parse.py; результат — той самий catalog.jsonl.gz.
//
// Використання (у консолі на сторінці https://data.discogs.com/):
//   kosmos.run("data/2026/discogs_20261001_releases.xml.gz")   // повний прохід
//   kosmos.run(path, {limitBytes: 50e6})                        // пробний прохід
//   kosmos.status()                                             // прогрес
//   kosmos.save()                                               // зберегти catalog.jsonl.gz
(() => {
  const GENRE = "Electronic";
  const CORE = new Set(["House", "Deep House", "Tech House", "Acid House", "Garage House",
    "Progressive House", "Hard House", "Ghetto House", "Hip-House", "Italo House", "Electro House",
    "Speed Garage", "UK Garage", "Euro House", "Latin House", "Afro House", "Jackin House",
    "Funky House", "Ghettotech"]);
  const YT = /(?:v=|youtu\.be\/|\/embed\/)([A-Za-z0-9_-]{11})/;
  const DISAMBIG = /\s\(\d+\)$/;
  const clean = (s) => (s || "").trim().replace(DISAMBIG, "");

  const S = { state: "idle", bytesIn: 0, total: 0, releases: 0, kept: 0, videos: 0, t0: 0, error: null, url: null };
  let byKey = new Map(), seen = new Set(), abort = null;

  function trackTitle(vt, artist, tracklist) {
    const low = vt.toLowerCase();
    for (const t of [...tracklist].sort((a, b) => b.length - a.length)) if (t.length > 2 && low.includes(t.toLowerCase())) return t;
    const parts = vt.split(/\s[-–—]\s/);
    if (parts.length >= 2 && artist && parts[0].trim().toLowerCase().startsWith(artist.toLowerCase().slice(0, 6))) return parts.slice(1).join(" - ").trim();
    return vt.trim();
  }

  const parser = new DOMParser();
  function handle(xml) {
    S.releases++;
    // швидкі відсіювання до повного розбору
    if (!xml.includes(`<genre>${GENRE}</genre>`) || !xml.includes("youtu")) return;
    let core = false;
    for (const m of xml.matchAll(/<style>([^<]*)<\/style>/g)) if (CORE.has(m[1].replace(/&amp;/g, "&"))) { core = true; break; }
    if (!core) return;
    const el = parser.parseFromString(xml, "text/xml").documentElement;
    if (!el || el.nodeName !== "release") return;
    const q = (sel) => [...el.querySelectorAll(sel)];
    const styles = q("styles > style").map((s) => s.textContent);
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
    const rec = {
      id: +el.getAttribute("id"), master: +(el.querySelector("release > master_id")?.textContent || 0),
      title: (el.querySelector("release > title")?.textContent || "").trim(), artist, label, year,
      country: el.querySelector("release > country")?.textContent || "", styles,
      videos: videos.map(([yt, t, d]) => ({ yt, title: trackTitle(t, artist, tracklist), dur: d })),
    };
    const key = rec.master || -rec.id;
    let prev = byKey.get(key);
    if (prev) {
      if (rec.year && (!prev.year || rec.year < prev.year)) prev.year = rec.year;
      if (!prev.label && rec.label) prev.label = rec.label;
      prev.styles = [...new Set([...prev.styles, ...rec.styles])].sort();
    } else {
      prev = { ...rec, videos: [] };
      byKey.set(key, prev);
    }
    for (const v of rec.videos) if (!seen.has(v.yt)) { seen.add(v.yt); prev.videos.push(v); }
    S.kept = byKey.size; S.videos = seen.size;
  }

  async function run(path, opts = {}) {
    if (S.state === "running") return "уже працює";
    Object.assign(S, { state: "running", bytesIn: 0, total: 0, releases: 0, kept: 0, videos: 0, t0: Date.now(), error: null, url: path });
    byKey = new Map(); seen = new Set(); abort = new AbortController();
    try {
      const res = await fetch("/?download=" + encodeURIComponent(path), { signal: abort.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      S.total = +(res.headers.get("content-length") || 0);
      const counted = res.body.pipeThrough(new TransformStream({
        transform(chunk, ctl) {
          S.bytesIn += chunk.byteLength;
          if (opts.limitBytes && S.bytesIn > opts.limitBytes) { ctl.terminate(); abort.abort(); return; }
          ctl.enqueue(chunk);
        },
      }));
      const text = counted.pipeThrough(new DecompressionStream("gzip")).pipeThrough(new TextDecoderStream());
      const reader = text.getReader();
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

  async function blob() {
    const lines = [];
    for (const r of byKey.values()) if (r.videos.length) lines.push(JSON.stringify(r) + "\n");
    const gz = new Blob(lines).stream().pipeThrough(new CompressionStream("gzip"));
    return new Response(gz).blob();
  }

  async function save(name = "catalog.jsonl.gz") {
    const b = await blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = name;
    document.body.appendChild(a); a.click();
    return { file: name, mb: +(b.size / 1e6).toFixed(1), releases: byKey.size };
  }

  function sample(n = 3) { return [...byKey.values()].slice(0, n); }
  function stop() { abort?.abort(); }

  window.kosmos = { run, status, save, blob, sample, stop };
  return "kosmos готовий";
})();
