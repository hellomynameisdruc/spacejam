"""Step 2½. From the raw releases picked out of the dump (sectors.jsonl.gz: every release of every
sector, as it is) to one sector's catalogue: only that sector's releases, editions of the same
master merged into one point, each YouTube video kept once (the first time it appears).

The merge is the one the old house-only parser did, so a sector's catalogue doesn't depend on
which other sectors were collected in the same pass.
"""
import gzip
import json
from pathlib import Path

SECTORS_FILE = Path(__file__).resolve().parent / "sectors.json"


def load_sectors(path=SECTORS_FILE):
    return json.loads(Path(path).read_text(encoding="utf-8"))["sectors"]


def in_sector(rec, sector):
    return bool(set(rec.get("genres", ())) & set(sector["genres"])) and bool(set(rec["styles"]) & set(sector["styles"]))


def merge(records):
    """Raw releases (in dump order) → merged catalogue entries with at least one video."""
    by_key, seen = {}, set()
    for rec in records:
        key = rec["master"] or -rec["id"]
        new = [v for v in rec["videos"] if v["yt"] not in seen]
        prev = by_key.get(key)
        if prev:
            if rec["year"] and (not prev["year"] or rec["year"] < prev["year"]):
                prev["year"] = rec["year"]
            if not prev["label"] and rec["label"]:
                prev["label"] = rec["label"]
            prev["styles"] = sorted(set(prev["styles"]) | set(rec["styles"]))
        else:
            prev = {k: v for k, v in rec.items() if k != "genres"}
            prev["videos"] = []
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
