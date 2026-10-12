"""Крок 2. Потоково (з файлу або прямо з інтернету) читає дамп і відбирає хаус-релізи, до яких прикріплені YouTube-відео.

Ми нічого не завантажуємо з YouTube — беремо тільки ID відео, які користувачі
Discogs уже прив'язали до релізів. Результат: data/catalog.jsonl.gz
"""
import argparse
import gzip
import io
import json
import re
import time
import xml.etree.ElementTree as ET

from config import CORE_STYLES, DATA_DIR, GENRE

YT_RE = re.compile(r"(?:v=|youtu\.be/|/embed/)([A-Za-z0-9_-]{11})")
DISAMBIG = re.compile(r"\s\(\d+\)$")  # "Artist (2)" → "Artist"


def clean(name: str | None) -> str:
    return DISAMBIG.sub("", (name or "").strip())


def track_title(video_title: str, artist: str, tracklist: list[str]) -> str:
    vt = video_title.lower()
    for t in sorted(tracklist, key=len, reverse=True):
        if len(t) > 2 and t.lower() in vt:
            return t
    # "Artist - Title" → "Title"
    parts = re.split(r"\s[-–—]\s", video_title, maxsplit=1)
    if len(parts) == 2 and artist and parts[0].strip().lower().startswith(artist.lower()[:6]):
        return parts[1].strip()
    return video_title.strip()


def parse_release(el: ET.Element) -> dict | None:
    genres = [g.text for g in el.iterfind("genres/genre")]
    if GENRE not in genres:
        return None
    styles = [s.text for s in el.iterfind("styles/style") if s.text]
    if not CORE_STYLES.intersection(styles):
        return None
    videos = []
    for v in el.iterfind("videos/video"):
        m = YT_RE.search(v.get("src", ""))
        if m:
            videos.append((m.group(1), v.findtext("title") or "", int(v.get("duration") or 0)))
    if not videos:
        return None

    artists = [clean(a.findtext("name")) for a in el.iterfind("artists/artist")]
    artist = " & ".join(a for a in artists if a) or "Unknown Artist"
    label_el = el.find("labels/label")
    label = clean(label_el.get("name")) if label_el is not None else ""
    if label.lower().startswith("not on label"):
        label = ""
    released = el.findtext("released") or ""
    year = int(released[:4]) if released[:4].isdigit() else 0
    tracklist = [t.findtext("title") or "" for t in el.iterfind("tracklist/track")]

    return {
        "id": int(el.get("id")),
        "master": int(el.findtext("master_id") or 0),
        "title": (el.findtext("title") or "").strip(),
        "artist": artist,
        "label": label,
        "year": year,
        "country": el.findtext("country") or "",
        "styles": styles,
        "videos": [{"yt": yt, "title": track_title(t, artist, tracklist), "dur": d} for yt, t, d in videos],
    }


def run(src, dst):
    by_key: dict[int, dict] = {}   # master або id релізу → запис
    seen_videos: set[str] = set()
    n_all = n_kept = 0
    t0 = time.time()

    if src == "latest" or src.startswith("http"):
        from remote import ResumableHTTP, latest_releases_url
        url = latest_releases_url() if src == "latest" else src
        print(f"Читаю потоком, без збереження на диск: {url}")
        raw = io.BufferedReader(ResumableHTTP(url), buffer_size=1 << 20)
        f = gzip.GzipFile(fileobj=raw)
    else:
        f = gzip.open(src, "rb")
    with f:
        ctx = ET.iterparse(f, events=("start", "end"))
        _, root = next(ctx)
        for ev, el in ctx:
            if ev != "end" or el.tag != "release":
                continue
            n_all += 1
            rec = parse_release(el)
            root.clear()
            if n_all % 200_000 == 0:
                print(f"\r  переглянуто {n_all:,} релізів, відібрано {n_kept:,}  ({time.time() - t0:.0f} с)", end="", flush=True)
            if not rec:
                continue
            # Різні видання одного релізу (master) склеюємо в одну точку
            key = rec["master"] or -rec["id"]
            prev = by_key.get(key)
            if prev:
                if rec["year"] and (not prev["year"] or rec["year"] < prev["year"]):
                    prev["year"] = rec["year"]
                if not prev["label"] and rec["label"]:
                    prev["label"] = rec["label"]
                prev["styles"] = sorted(set(prev["styles"]) | set(rec["styles"]))
                new = [v for v in rec["videos"] if v["yt"] not in seen_videos]
            else:
                by_key[key] = rec
                new = [v for v in rec["videos"] if v["yt"] not in seen_videos]
                rec["videos"] = []
                prev = rec
            for v in new:
                seen_videos.add(v["yt"])
                prev["videos"].append(v)
            n_kept = len(by_key)

    print()
    kept = [r for r in by_key.values() if r["videos"]]
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with gzip.open(dst, "wt", encoding="utf-8") as out:
        for r in kept:
            out.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"Переглянуто {n_all:,} релізів. На мапу йде {len(kept):,} релізів і {len(seen_videos):,} відео.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(DATA_DIR / "releases.xml.gz"),
                    help="шлях до файлу, URL, або 'latest' — найсвіжіший дамп Discogs потоком")
    ap.add_argument("--dst", default=str(DATA_DIR / "catalog.jsonl.gz"))
    a = ap.parse_args()
    run(a.src, a.dst)
