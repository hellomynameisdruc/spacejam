"""Step 3. Turns the catalogue into a cosmos.

  star      = a Discogs style (Deep House, Garage House…)
  planet    = a label, orbiting the style it releases most
  satellite = a track (YouTube video) around its planet
  belt      = releases without a label or from small labels, at the edge of a system

Distances between stars depend on how often two styles appear on the same release.
Writes each sector into web/public/data/<sector>/ (map.json, tracks/<star>.json, artists.json)
and the list of sectors into web/public/data/sectors.json.

The build is a chain of small steps (see build()); each one is a plain function over plain data,
so they can be tested on a handful of fake releases (tests/test_build_map.py).
"""
import argparse
import colorsys
import gzip
import json
import math
import random
import zlib
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

import config as C
from catalog import load_sectors, sector_catalogue

GOLDEN = math.pi * (3 - math.sqrt(5))
HULL_N = 48
LINK_MIN = 0.03  # weaker style links are not drawn


def seed_of(name):
    """Per-style random seed, stable across runs (Python's hash() of a str changes every run,
    which used to reshuffle the planets on every rebuild)."""
    return zlib.crc32(name.encode("utf-8")) & 0xFFFF


# ---------- loading ----------
def load(path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return [json.loads(line) for line in f]


# ---------- styles ----------
def style_counts(rel, min_style):
    """Releases per style, and the styles big enough to become stars (most common first)."""
    # dict.fromkeys de-duplicates in a fixed order (a set's order changes between runs)
    style_n = Counter(s for r in rel for s in dict.fromkeys(r["styles"]))
    stars = [s for s, n in style_n.most_common() if n >= min_style]
    return style_n, stars


def style_links(rel, stars, style_n):
    """Link strength between two styles: cosine similarity of the releases they share."""
    star_set = set(stars)
    pair = Counter()
    for r in rel:
        ss = sorted(star_set.intersection(r["styles"]))
        for i in range(len(ss)):
            for k in range(i + 1, len(ss)):
                pair[(ss[i], ss[k])] += 1
    weight = {}
    for (a, b), c in pair.items():
        w = c / math.sqrt(style_n[a] * style_n[b])
        weight[(a, b)] = weight[(b, a)] = w
    return weight


def year_histograms(rel, stars):
    """Releases per year for each style (drives a star's glow and the activity chart)."""
    star_set = set(stars)
    years_all = [r["year"] for r in rel if r["year"]]
    y1 = max(years_all) if years_all else 2025
    y0 = min(1980, y1 - 1)
    hist = {s: [0] * (y1 - y0 + 1) for s in stars}
    for r in rel:
        y = r["year"]
        if y0 <= y <= y1:
            for st in star_set.intersection(r["styles"]):
                hist[st][y - y0] += 1
    return y0, y1, hist


def assign_homes(rel, stars, style_n):
    """A release's home is its narrowest (rarest) star style; releases without one are dropped."""
    star_set = set(stars)
    for r in rel:
        ss = [s for s in r["styles"] if s in star_set]
        r["home"] = min(ss, key=lambda s: style_n[s]) if ss else None
    return [r for r in rel if r["home"]]


# ---------- labels → planets ----------
def even_sample(items, cap):
    """Keep at most `cap` items, evenly spread over the list (e.g. across a label's whole history)."""
    if len(items) <= cap:
        return items
    step = len(items) / cap
    return [items[int(k * step)] for k in range(cap)]


def group_labels(rel, stars, min_label):
    """Labels with enough releases become planets of their most common home style; the rest of the
    releases (small labels, no label) go to that style's asteroid belt."""
    star_set = set(stars)
    by_label = defaultdict(list)
    for r in rel:
        if r["label"]:
            by_label[r["label"]].append(r)
    planets, belt = [], defaultdict(list)
    for name, rs in by_label.items():
        if len(rs) < min_label:
            for r in rs:
                belt[r["home"]].append(r)
            continue
        star = Counter(r["home"] for r in rs).most_common(1)[0][0]
        side = Counter(s for r in rs for s in r["styles"] if s in star_set and s != star)
        tracks = sorted(((r, v) for r in rs for v in r["videos"]), key=lambda rv: (rv[0]["year"] or 9999))
        tracks = even_sample(tracks, C.MAX_TRACKS_PER_PLANET)
        r_pl = min(26, 3 + 1.25 * math.sqrt(len(rs)))
        planets.append({
            "name": name, "star": star, "n": len(rs), "side": side, "tracks": tracks,
            "r": r_pl, "halo": r_pl + 4 + 1.5 * math.sqrt(len(tracks)),
            "years": [min((r["year"] for r in rs if r["year"]), default=0), max(r["year"] for r in rs)],
            "active_years": len({r["year"] for r in rs if r["year"]}),
            "rs": rs,
        })
    for r in rel:
        if not r["label"]:
            belt[r["home"]].append(r)
    return planets, belt


def cap_planets(planets, belt):
    """Only the biggest labels of each style become planets (keeps the map readable and fast);
    the others join the belt. Returns planets grouped by star, biggest first."""
    sys_by_star = defaultdict(list)
    for p in planets:
        sys_by_star[p["star"]].append(p)
    for s in list(sys_by_star):
        ps = sorted(sys_by_star[s], key=lambda p: -p["n"])
        for p in ps[C.MAX_PLANETS_PER_STAR:]:
            belt[s].extend(p["rs"])
        sys_by_star[s] = ps[:C.MAX_PLANETS_PER_STAR]
    return sys_by_star


# ---------- layout ----------
def mds(dist: np.ndarray) -> np.ndarray:
    """Classical multidimensional scaling into 2D."""
    n = len(dist)
    if n == 1:
        return np.zeros((1, 2))
    j = np.eye(n) - np.ones((n, n)) / n
    b = -0.5 * j @ (dist ** 2) @ j
    vals, vecs = np.linalg.eigh(b)
    idx = np.argsort(vals)[::-1][:2]
    return vecs[:, idx] * np.sqrt(np.maximum(vals[idx], 1e-9))


def layout_stars(names, radius, weight, iters=900):
    """Strongly linked styles attract, every system repels the others so they don't overlap."""
    n = len(names)
    w = np.array([[weight.get((a, b), 0.0) for b in names] for a in names])
    pos = mds(1 - np.clip(w * 3, 0, 1))
    pos -= pos.mean(0)
    span = np.abs(pos).max() or 1
    pos = pos / span * (radius.sum() * 0.6)
    r = radius
    rng = np.random.default_rng(1)
    pos += rng.normal(0, 1, pos.shape)
    for it in range(iters):
        step = 0.25 * (1 - it / iters) + 0.02
        d = pos[:, None, :] - pos[None, :, :]
        dist = np.maximum(np.linalg.norm(d, axis=2), 1e-3) + np.eye(n)
        unit = d / dist[..., None]
        want = r[:, None] + r[None, :] + 60 + 900 * (1 - np.clip(w * 3, 0, 1))
        force = np.zeros_like(pos)
        # springs between linked styles
        pull = np.where(w > 0, (dist - want) * np.clip(w * 3, 0.05, 1), 0)
        force -= (unit * pull[..., None]).sum(1)
        # push apart systems that overlap
        minsep = r[:, None] + r[None, :] + 50
        push = np.where(dist < minsep, (minsep - dist) * 2.0, 0)
        np.fill_diagonal(push, 0)
        force += (unit * push[..., None]).sum(1)
        # weak pull to the centre so islands don't drift away
        force -= pos * 0.002
        # clamp each move so the simulation can't blow up with many stars
        disp = np.nan_to_num(force) * step
        lim = 20 + 180 * (1 - it / iters)
        norm = np.linalg.norm(disp, axis=1, keepdims=True)
        pos += np.where(norm > lim, disp / np.maximum(norm, 1e-9) * lim, disp)
    # finally remove any remaining overlaps
    for _ in range(300):
        moved = False
        for i in range(n):
            for k in range(i + 1, n):
                dv = pos[i] - pos[k]
                dd = np.linalg.norm(dv) or 1e-6
                need = r[i] + r[k] + 40
                if dd < need:
                    m = dv / dd * (need - dd) / 2
                    pos[i] += m
                    pos[k] -= m
                    moved = True
        if not moved:
            break
    return pos - pos.mean(0)


def place_planets(planets, star_r, prefs, gap=12, seed=0):
    """Planets scattered through wide bands around the star (big labels nearer the core).
    Inside a band each planet gets a random distance and a random spot near the angle that faces
    its 'second' style, so there are no visible rings. A whole band turns at one speed, and bands
    are separated by the planets' satellite swarms, so planets never collide.
    Returns [(x, y, orbit radius, angle, band radius)], outer edge, band radii."""
    rng = random.Random(seed)
    out, bands = [], []
    edge = star_r + 34
    i, n = 0, len(planets)
    while i < n:
        hmax = planets[i]["halo"]
        width = hmax * 2 * 2.1 + gap
        mid = edge + width / 2
        here = []  # (x, y, halo) of planets already in this band
        j = i
        while j < n:
            h = planets[j]["halo"]
            spot = None
            for k in range(160):
                ang = prefs[j] + rng.gauss(0, 0.7 + k * 0.03) if k < 80 else rng.uniform(0, 2 * math.pi)
                rr = mid + rng.uniform(-1, 1) * max(0.0, width / 2 - h - gap / 2)
                x, y = rr * math.cos(ang), rr * math.sin(ang)
                if all((x - px) ** 2 + (y - py) ** 2 >= (h + ph + gap) ** 2 for px, py, ph in here):
                    spot = (x, y, rr, ang % (2 * math.pi))
                    break
            if spot is None:
                break
            here.append((spot[0], spot[1], h))
            out.append(spot + (mid,))
            j += 1
        if j == i:  # safety: a single planet always fits an empty band
            raise RuntimeError("could not place planet")
        bands.append(round(mid, 1))
        edge += width
        i = j
    return out, edge, bands


def hull_at(hull, a):
    """Interpolated hull radius in direction a."""
    f = (a % (2 * math.pi)) / (2 * math.pi) * HULL_N
    i = int(f) % HULL_N
    t = f - int(f)
    return hull[i] * (1 - t) + hull[(i + 1) % HULL_N] * t


def planet_prefs(s, ps, spos, weight):
    """For each planet, the angle facing the styles it also releases (weighted by link strength)."""
    rnd = random.Random(seed_of(s))
    prefs = []
    for p in ps:
        v = np.zeros(2)
        for other, c in p["side"].items():
            d = spos[other] - spos[s]
            v += d / (np.linalg.norm(d) or 1) * c * weight.get((s, other), 0.1)
        prefs.append(math.atan2(v[1], v[0]) if np.linalg.norm(v) > 1e-9 else rnd.uniform(0, 2 * math.pi))
    return prefs


def place_belt(belt_releases, hull):
    """Belt tracks scattered in a ring just outside the system's outline.
    Returns [(release, video, x, y)] relative to the star, and the belt's width."""
    bel = sorted(belt_releases, key=lambda r: r["year"] or 9999)
    bt = even_sample([(r, v) for r in bel for v in r["videos"]], C.MAX_BELT_TRACKS)
    perim = sum(hull) / len(hull) * 2 * math.pi
    width = max(16, len(bt) * 9 / perim)
    out = []
    for r, v in bt:
        h = int(v["yt"].encode().hex()[:8], 16)
        a = (h % 100000) / 100000 * 2 * math.pi
        rr = hull_at(hull, a) + 10 + ((h >> 5) % 1000) / 1000 * width
        out.append((r, v, rr * math.cos(a), rr * math.sin(a)))
    return out, width


def layout_system(s, planets, belt_releases, core, spos, weight):
    """Lays out one star system: planets in bands, the belt outside. Mutates the planets
    (lx, ly, o, a, b) and returns (planets by halo, belt points, hull, radius, band radii)."""
    ps = sorted(planets, key=lambda p: -p["halo"])
    xy, outer, bands = place_planets(ps, core, planet_prefs(s, ps, spos, weight), seed=seed_of(s))
    hull = [round(max(outer, core + 45) + 12, 1)] * HULL_N
    for p, (x, y, o, a, band) in zip(ps, xy, strict=True):
        p["lx"], p["ly"], p["o"], p["a"], p["b"] = x, y, o, a, band
    belt_pts, width = place_belt(belt_releases, hull)
    if belt_pts:
        hull = [round(x + 10 + width, 1) for x in hull]
    return ps, belt_pts, hull, max(hull), bands


def hsl_hex(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h % 1, l, s)
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))


# ---------- output ----------
def assemble(stars, pos, systems, style_n, star_core, year_hist, weight):
    """Builds map.json content, per-star track chunks and the artist search index.
    Tracks of a planet sit on a spiral around it (oldest nearest); then the belt."""
    cen = pos.mean(0)
    sidx = {s: i for i, s in enumerate(stars)}
    stars_out, planets_out, chunks, search_artists = [], [], [], {}
    for si, s in enumerate(stars):
        sys = systems[s]
        sx, sy = pos[si]
        hue = (math.atan2(sy - cen[1], sx - cen[0]) / (2 * math.pi)) + 0.08
        ch = {"yt": [], "t": [], "a": [], "yr": [], "p": [], "x": [], "y": []}
        artists, a_idx = [], {}

        def add(r, v, x, y, pidx):
            if r["artist"] not in a_idx:
                a_idx[r["artist"]] = len(artists)
                artists.append(r["artist"])
                search_artists.setdefault(r["artist"].lower(), (r["artist"], si, len(ch["yt"])))
            ch["yt"].append(v["yt"]); ch["t"].append(v["title"]); ch["a"].append(a_idx[r["artist"]])
            ch["yr"].append(r["year"]); ch["p"].append(pidx); ch["x"].append(round(x, 1)); ch["y"].append(round(y, 1))

        for p in sys["planets"]:
            px, py = sx + p["lx"], sy + p["ly"]
            pidx, t0 = len(planets_out), len(ch["yt"])
            for i, (r, v) in enumerate(p["tracks"]):
                rr, a = p["r"] + 4 + 1.5 * math.sqrt(i + 0.5), i * GOLDEN
                add(r, v, px + rr * math.cos(a), py + rr * math.sin(a), pidx)
            planets_out.append({"name": p["name"], "s": si, "x": round(px, 1), "y": round(py, 1), "r": round(p["r"], 1),
                                "n": p["n"], "yr": p["years"], "ay": p["active_years"], "o": round(p["o"], 1), "a": round(p["a"], 4), "b": round(p["b"], 1),
                                "xs": [[sidx[st], round(c / p["n"], 3)] for st, c in p["side"].most_common(3) if st in sidx], "t0": t0, "t1": len(ch["yt"])})
        for r, v, x, y in sys["belt"]:
            add(r, v, sx + x, sy + y, -1)
        ch["an"] = artists
        chunks.append(ch)
        stars_out.append({"name": s, "x": round(float(sx), 1), "y": round(float(sy), 1), "core": round(star_core[s], 1),
                          "R": round(sys["radius"], 1), "n": style_n[s], "tracks": len(ch["yt"]), "color": hsl_hex(hue, 0.9, 0.66),
                          "yh": year_hist[s], "hull": sys["hull"], "orb": sys["bands"]})
    links = [[sidx[a], sidx[b], round(w, 4)] for (a, b), w in weight.items() if a < b and w >= LINK_MIN]
    return stars_out, planets_out, links, chunks, sorted(search_artists.values())


def write_outputs(out_dir, map_json, chunks, artists):
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "tracks").mkdir(exist_ok=True)
    for f in (out_dir / "tracks").glob("*.json"):
        f.unlink()
    dump = lambda obj, path: json.dump(obj, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    dump(map_json, out_dir / "map.json")
    for i, ch in enumerate(chunks):
        dump(ch, out_dir / "tracks" / f"{i}.json")
    dump(artists, out_dir / "artists.json")


# ---------- the whole build ----------
def build(rel, min_style, min_label, sample=False, sector="House", sector_id="house"):
    """Catalogue releases → (map.json content, track chunks, artist index)."""
    style_n, stars = style_counts(rel, min_style)
    weight = style_links(rel, stars, style_n)
    y0, y1, year_hist = year_histograms(rel, stars)
    rel = assign_homes(rel, stars, style_n)
    planets, belt = group_labels(rel, stars, min_label)
    sys_by_star = cap_planets(planets, belt)

    # first star layout from estimated system sizes, so planets know where their other styles are
    star_core = {s: 10 + 3.2 * math.log1p(style_n[s]) for s in stars}
    est = np.array([math.sqrt(sum((p["halo"] + 7) ** 2 * 3.6 for p in sys_by_star[s]) + star_core[s] ** 2 * 6) + 30 + math.sqrt(len(belt[s])) * 2 for s in stars])
    pos = layout_stars(stars, est, weight)
    spos = {s: pos[i] for i, s in enumerate(stars)}

    systems = {}
    for s in stars:
        ps, belt_pts, hull, radius, bands = layout_system(s, sys_by_star[s], belt[s], star_core[s], spos, weight)
        systems[s] = {"planets": ps, "belt": belt_pts, "hull": hull, "radius": radius, "bands": bands}

    # final star layout with the real system sizes
    pos = layout_stars(stars, np.array([systems[s]["radius"] for s in stars]), weight, iters=400)
    stars_out, planets_out, links, chunks, artists = assemble(stars, pos, systems, style_n, star_core, year_hist, weight)
    meta = {"sector": sector, "id": sector_id, "sample": sample, "releases": len(rel), "tracks": sum(len(c["yt"]) for c in chunks), "years": [y0, y1]}
    return {"meta": meta, "stars": stars_out, "links": links, "planets": planets_out}, chunks, artists


def min_style_for(sector, n_releases):
    return sector.get("min_style") or max(C.MIN_STYLE_FLOOR, round(C.MIN_STYLE_SHARE * n_releases))


def build_sector(rel, sector, out_root, min_label, sample=False):
    """One sector's catalogue → its files in out_root/<id>/; returns its entry for sectors.json."""
    min_style = min_style_for(sector, len(rel))
    map_json, chunks, artists = build(rel, min_style, min_label, sample, sector["name"], sector["id"])
    write_outputs(out_root / sector["id"], map_json, chunks, artists)
    m = map_json["meta"]
    print(f"{sector['name']}: {len(rel):,} releases → {len(map_json['stars'])} stars (≥ {min_style} releases), "
          f"{len(map_json['planets']):,} planets, {m['tracks']:,} tracks")
    return {"id": sector["id"], "name": sector["name"], "releases": m["releases"], "tracks": m["tracks"],
            "stars": len(map_json["stars"]), "planets": len(map_json["planets"])}


def write_index(out_root, entries, sectors, sample=False):
    """sectors.json: the sectors the site offers, in sectors.json order; keeps ones built earlier."""
    path = out_root / "sectors.json"
    old = {e["id"]: e for e in json.loads(path.read_text(encoding="utf-8"))["sectors"]} if path.exists() else {}
    old.update({e["id"]: e for e in entries})
    order = [s["id"] for s in sectors]
    keep = [old[i] for i in order if i in old and (out_root / i / "map.json").exists()]
    path.write_text(json.dumps({"sample": sample, "sectors": keep}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main(src, out_root, only, min_label, sample):
    sectors = load_sectors()
    todo = [s for s in sectors if not only or s["id"] in only]
    entries = [build_sector(sector_catalogue(src, s), s, out_root, min_label, sample) for s in todo]
    write_index(out_root, entries, sectors, sample)
    print(f"Sectors ready → {out_root}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(C.DATA_DIR / "sectors.jsonl.gz"), help="raw releases from parse.py / browser_parse.js")
    ap.add_argument("--out", default=str(C.WEB_DATA_DIR))
    ap.add_argument("--sectors", default="", help="comma-separated sector ids (default: all in sectors.json)")
    ap.add_argument("--min-label", type=int, default=C.MIN_LABEL_RELEASES)
    ap.add_argument("--sample", action="store_true", help="mark the data as a test sample")
    a = ap.parse_args()
    main(a.src, Path(a.out), {x for x in a.sectors.split(",") if x}, a.min_label, a.sample)
