"""Step 2. Streams the Discogs dump (from a file or straight from the internet) and keeps every
release of every map sector (pipeline/sectors.json) that has YouTube videos attached.

Nothing is downloaded from YouTube: only the video IDs Discogs users attached to releases.
Releases are written as they are (data/sectors.jsonl.gz); catalog.py merges editions per sector.
Same output as pipeline/browser_parse.js, which does this in a browser tab.
"""
import argparse
import gzip
import io
import json
import re
import time
import xml.etree.ElementTree as ET

from catalog import in_sector, keep_genres, load_sectors
from config import DATA_DIR

SECTORS = load_sectors()
KEEP = set(keep_genres())
GENRES = {g for s in SECTORS for g in s["genres"]}

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
    if not GENRES.intersection(genres):
        return None
    styles = [s.text for s in el.iterfind("styles/style") if s.text]
    if not KEEP.intersection(genres) and not any(in_sector({"genres": genres, "styles": styles}, sec) for sec in SECTORS):
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
        "genres": genres,
        "styles": styles,
        "videos": [{"yt": yt, "title": track_title(t, artist, tracklist), "dur": d} for yt, t, d in videos],
    }


def run(src, dst):
    n_all = n_kept = 0
    t0 = time.time()

    if src == "latest" or src.startswith("http"):
        from remote import ResumableHTTP, latest_releases_url
        url = latest_releases_url() if src == "latest" else src
        print(f"Streaming, nothing saved to disk: {url}")
        raw = io.BufferedReader(ResumableHTTP(url), buffer_size=1 << 20)
        f = gzip.GzipFile(fileobj=raw)
    else:
        f = gzip.open(src, "rb")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with f, gzip.open(dst, "wt", encoding="utf-8") as out:
        ctx = ET.iterparse(f, events=("start", "end"))
        _, root = next(ctx)
        for ev, el in ctx:
            if ev != "end" or el.tag != "release":
                continue
            n_all += 1
            rec = parse_release(el)
            root.clear()
            if n_all % 200_000 == 0:
                print(f"\r  {n_all:,} releases read, {n_kept:,} kept  ({time.time() - t0:.0f} s)", end="", flush=True)
            if rec:
                n_kept += 1
                out.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(f"\nRead {n_all:,} releases, kept {n_kept:,} → {dst}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(DATA_DIR / "releases.xml.gz"),
                    help="file path, URL, or 'latest' to stream the newest Discogs dump")
    ap.add_argument("--dst", default=str(DATA_DIR / "sectors.jsonl.gz"))
    a = ap.parse_args()
    run(a.src, a.dst)
