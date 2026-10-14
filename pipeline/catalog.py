"""Step 2½. From the raw releases picked out of the dump (sectors.jsonl.gz: every release of every
sector, as it is) to the catalogue: editions of the same master merged into one point, each YouTube
video kept once (the first time it appears), and each release tagged with the sectors it belongs to
(`secs`). Sectors become galaxies on the one map.

The merge is the one the old house-only parser did (sector_catalogue gives exactly its output).
"""
import gzip
import json
from pathlib import Path

SECTORS_FILE = Path(__file__).resolve().parent / "sectors.json"


def load_sectors(path=SECTORS_FILE):
    return json.loads(Path(path).read_text(encoding="utf-8"))["sectors"]


def keep_genres(path=SECTORS_FILE):
    """genres whose releases are kept in the raw file even when they match no galaxy"""
    return json.loads(Path(path).read_text(encoding="utf-8")).get("keep_genres", [])


def in_sector(rec, sector):
    return bool(set(rec.get("genres", ())) & set(sector["genres"])) and bool(set(rec["styles"]) & set(sector["styles"]))


def merge(records, sectors=None):
    """Raw releases (in dump order) → merged catalogue entries with at least one video.
    With `sectors`, each entry gets `secs`: ids of the sectors any of its editions belongs to."""
    by_key, seen = {}, set()
    for rec in records:
        secs = [s["id"] for s in sectors if in_sector(rec, s)] if sectors else None
        key = rec["master"] or -rec["id"]
        new = [v for v in rec["videos"] if v["yt"] not in seen]
        prev = by_key.get(key)
        if prev:
            if rec["year"] and (not prev["year"] or rec["year"] < prev["year"]):
                prev["year"] = rec["year"]
            if not prev["label"] and rec["label"]:
                prev["label"] = rec["label"]
            prev["styles"] = sorted(set(prev["styles"]) | set(rec["styles"]))
            if secs:
                prev["secs"] = list(dict.fromkeys(prev["secs"] + secs))
        else:
            prev = {k: v for k, v in rec.items() if k != "genres"}
            prev["videos"] = []
            if sectors is not None:
                prev["secs"] = secs
            by_key[key] = prev
        for v in new:
            seen.add(v["yt"])
            prev["videos"].append(v)
    return [r for r in by_key.values() if r["videos"]]


def read_raw(path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def sector_catalogue(raw_path, sector):
    return merge(r for r in read_raw(raw_path) if in_sector(r, sector))


def full_catalogue(raw_path, sectors):
    """Every sector's releases in one catalogue (a release in two sectors appears once)."""
    return merge((r for r in read_raw(raw_path) if any(in_sector(r, s) for s in sectors)), sectors)
