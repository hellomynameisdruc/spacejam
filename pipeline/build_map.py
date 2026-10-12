"""Крок 3. Перетворює каталог на космос.

  зоря     = стиль Discogs (Deep House, Garage House…)
  планета  = лейбл, на орбіті того стилю, який у нього найчастіший
  супутник = трек (YouTube-відео), довкола планети; старіші ближче до центру
  пояс     = релізи без лейбла або з дрібних лейблів

Відстані між зорями залежать від того, як часто стилі трапляються разом в одних релізах.
Повертає файли для сайту у web/public/data/.
"""
import argparse
import colorsys
import gzip
import json
import math
import random
from collections import Counter, defaultdict

import numpy as np

import config as C

GOLDEN = math.pi * (3 - math.sqrt(5))


def load(path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return [json.loads(line) for line in f]


def mds(dist: np.ndarray) -> np.ndarray:
    n = len(dist)
    if n == 1:
        return np.zeros((1, 2))
    j = np.eye(n) - np.ones((n, n)) / n
    b = -0.5 * j @ (dist ** 2) @ j
    vals, vecs = np.linalg.eigh(b)
    idx = np.argsort(vals)[::-1][:2]
    return vecs[:, idx] * np.sqrt(np.maximum(vals[idx], 1e-9))


def layout_stars(names, radius, weight, iters=900):
    """Сильно пов'язані стилі притягуються, усі системи відштовхуються, щоб не накладатися."""
    n = len(names)
    w = np.array([[weight.get((a, b), 0.0) for b in names] for a in names])
    pos = mds(1 - np.clip(w * 3, 0, 1) + np.eye(n) * 0)
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
        # пружини між пов'язаними стилями
        linked = w > 0
        pull = np.where(linked, (dist - want) * np.clip(w * 3, 0.05, 1), 0)
        force -= (unit * pull[..., None]).sum(1)
        # відштовхування, якщо системи налазять одна на одну
        minsep = r[:, None] + r[None, :] + 50
        push = np.where(dist < minsep, (minsep - dist) * 2.0, 0) - np.eye(n) * 0
        np.fill_diagonal(push, 0)
        force += (unit * push[..., None]).sum(1)
        # слабка гравітація до центру, щоб острови не розліталися
        force -= pos * 0.002
        # clamp each move so the simulation can't blow up with many stars
        disp = np.nan_to_num(force) * step
        lim = 20 + 180 * (1 - it / iters)
        norm = np.linalg.norm(disp, axis=1, keepdims=True)
        pos += np.where(norm > lim, disp / np.maximum(norm, 1e-9) * lim, disp)
    # остаточно прибираємо перекриття
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


def place_planets(planets, star_r, prefs, seed=0):
    """Bubbly, chaotic systems: planets form 3–6 clusters ("bubbles") around the star.
    Bubble directions follow the most related neighbour styles (plus some randomness); each label
    joins the bubble closest to its own affinity; overlapping halos push apart."""
    n = len(planets)
    if n == 0:
        return [], star_r, [star_r + 40] * HULL_N, []
    rng = np.random.default_rng(seed)
    halo = np.array([p["halo"] for p in planets]) + 5
    pref = np.array(prefs)
    # bubble directions: strongest affinity directions + random ones
    k = int(min(n, 3 + rng.integers(0, 4)))
    hist = np.histogram(pref % (2 * math.pi), bins=12, range=(0, 2 * math.pi))[0]
    top = list(np.argsort(-hist)[: max(1, k // 2)])
    angles = [(t + 0.5) / 12 * 2 * math.pi + rng.normal(0, 0.25) for t in top]
    while len(angles) < k:
        angles.append(rng.uniform(0, 2 * math.pi))
    angles = np.array(angles)
    # spread bubbles apart so they read as separate clusters
    for _ in range(60):
        dd = (angles[:, None] - angles[None, :] + math.pi) % (2 * math.pi) - math.pi
        np.fill_diagonal(dd, 9)
        close = np.abs(dd) < 2 * math.pi / (k * 1.35)
        angles += np.where(close, -np.sign(dd) * 0.04, 0).sum(1)
    diff = np.abs((pref[:, None] - angles[None, :] + math.pi) % (2 * math.pi) - math.pi) + rng.random((n, k)) * 0.9
    group = diff.argmin(1)
    # each bubble is a circle sized for its planets; bubbles are relaxed so they touch but don't merge
    br = np.zeros(k)
    for g in range(k):
        m = group == g
        br[g] = math.sqrt(((2 * halo[m]) ** 2).sum() / math.pi) * 0.6 + 12 if m.any() else 0
    centres = np.stack([np.cos(angles), np.sin(angles)], 1) * (star_r + 30 + br)[:, None]
    for _ in range(400):
        for g in range(k):
            if br[g] == 0:
                continue
            for h in range(k):
                if h == g or br[h] == 0:
                    continue
                dv = centres[g] - centres[h]
                dd = np.linalg.norm(dv) or 1e-6
                need = br[g] + br[h] + 34
                if dd < need:
                    centres[g] += dv / dd * (need - dd) * 0.5
            r = np.linalg.norm(centres[g]) or 1e-6
            need = star_r + 26 + br[g]
            centres[g] *= max(need, r * 0.985) / r  # gently fall toward the star, never into it
    pos = centres[group] + rng.normal(0, 1, (n, 2)) * halo[:, None]
    # planets from different bubbles keep a visible gap between them
    minsep = halo[:, None] + halo[None, :] + np.where(group[:, None] != group[None, :], 26.0, 0.0)
    for it in range(360):
        d = pos[:, None, :] - pos[None, :, :]
        dist = np.maximum(np.linalg.norm(d, axis=2), 1e-3)
        np.fill_diagonal(dist, 1e9)
        overlap = np.clip(minsep - dist, 0, None)
        push = (d / dist[..., None] * overlap[..., None]).sum(1) * 0.5
        cool = 1 - it / 360
        pos += push + (centres[group] - pos) * 0.035 * (0.3 + cool)
        r = np.linalg.norm(pos, axis=1)
        minr = star_r + 16 + halo
        inside = r < minr
        if inside.any():
            pos[inside] *= (minr[inside] / np.maximum(r[inside], 1e-6))[:, None]
    hull = hull_radii(pos, halo, star_r)
    # actual bubble outlines: centre and radius of each cluster as it settled
    bubbles = []
    for g in range(k):
        m = group == g
        if m.any():
            c = pos[m].mean(0)
            r = float((np.linalg.norm(pos[m] - c, axis=1) + halo[m]).max()) + 8
            bubbles.append([round(float(c[0]), 1), round(float(c[1]), 1), round(r, 1)])
    return [tuple(map(float, q)) for q in pos], float(max(hull)), hull, bubbles


HULL_N = 48


def hull_radii(pos, halo, star_r):
    """Wobbly outline of a system: for each direction, how far its planets reach (smoothed)."""
    pa = np.arctan2(pos[:, 1], pos[:, 0])
    pr = np.linalg.norm(pos, axis=1)
    out = []
    for a in np.linspace(0, 2 * math.pi, HULL_N, endpoint=False):
        diff = np.abs((pa - a + math.pi) % (2 * math.pi) - math.pi)
        m = diff < 0.45
        val = float(((pr[m] + halo[m]) * np.cos(diff[m])).max()) if m.any() else 0.0
        out.append(max(star_r + 45, val + 22))
    h = np.array(out)
    for _ in range(2):
        h = (np.roll(h, 1) + h * 2 + np.roll(h, -1)) / 4
    return [round(float(x), 1) for x in h]


def hull_at(hull, a):
    """Interpolated hull radius in direction a."""
    f = (a % (2 * math.pi)) / (2 * math.pi) * HULL_N
    i = int(f) % HULL_N
    t = f - int(f)
    return hull[i] * (1 - t) + hull[(i + 1) % HULL_N] * t


def hsl_hex(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h % 1, l, s)
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))


def main(src, out_dir, min_style, min_label, sample):
    rel = load(src)
    print(f"Каталог: {len(rel):,} релізів")

    style_n = Counter(s for r in rel for s in set(r["styles"]))
    stars = [s for s, n in style_n.most_common() if n >= min_style]
    star_set = set(stars)
    print(f"Зорі (стилі ≥ {min_style} релізів): {len(stars)}")

    # Сила зв'язку між стилями: косинус спільних релізів
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

    # Скільки релізів зі стилем виходило щороку (для «корони» зорі)
    years_all = [r["year"] for r in rel if r["year"]]
    Y1 = max(years_all) if years_all else 2025
    Y0 = min(1980, Y1 - 1)
    year_hist = {s: [0] * (Y1 - Y0 + 1) for s in stars}
    for r in rel:
        y = r["year"]
        if Y0 <= y <= Y1:
            for st in star_set.intersection(r["styles"]):
                year_hist[st][y - Y0] += 1

    # «Дім» релізу — найвужчий (найрідкісніший) з його стилів-зір
    def home(r):
        ss = [s for s in r["styles"] if s in star_set]
        return min(ss, key=lambda s: style_n[s]) if ss else None

    for r in rel:
        r["home"] = home(r)
    rel = [r for r in rel if r["home"]]

    by_label = defaultdict(list)
    for r in rel:
        if r["label"]:
            by_label[r["label"]].append(r)

    planets = []
    belt = defaultdict(list)
    for name, rs in by_label.items():
        if len(rs) < min_label:
            for r in rs:
                belt[r["home"]].append(r)
            continue
        hs = Counter(r["home"] for r in rs)
        star = hs.most_common(1)[0][0]
        side = Counter(s for r in rs for s in r["styles"] if s in star_set and s != star)
        tracks = sorted(((r, v) for r in rs for v in r["videos"]), key=lambda rv: (rv[0]["year"] or 9999))
        if len(tracks) > C.MAX_TRACKS_PER_PLANET:  # even sample across the label's whole history
            step = len(tracks) / C.MAX_TRACKS_PER_PLANET
            tracks = [tracks[int(k * step)] for k in range(C.MAX_TRACKS_PER_PLANET)]
        n_tr = len(tracks)
        r_pl = min(26, 3 + 1.25 * math.sqrt(len(rs)))
        planets.append({
            "name": name, "star": star, "n": len(rs), "side": side, "tracks": tracks,
            "r": r_pl, "halo": r_pl + 4 + 1.5 * math.sqrt(n_tr),
            "years": [min((r["year"] for r in rs if r["year"]), default=0), max(r["year"] for r in rs)],
            "active_years": len({r["year"] for r in rs if r["year"]}),
            "rs": rs,
        })
    for r in rel:
        if not r["label"]:
            belt[r["home"]].append(r)

    # Попередня оцінка розміру систем (для розкладки зір)
    sys_by_star = defaultdict(list)
    for p in planets:
        sys_by_star[p["star"]].append(p)
    # Only the biggest labels become planets; the rest join the asteroid belt (keeps the map readable and fast)
    for s in list(sys_by_star):
        ps = sorted(sys_by_star[s], key=lambda p: -p["n"])
        for p in ps[C.MAX_PLANETS_PER_STAR:]:
            belt[s].extend(p["rs"])
        sys_by_star[s] = ps[:C.MAX_PLANETS_PER_STAR]
    star_core = {s: 10 + 3.2 * math.log1p(style_n[s]) for s in stars}
    est = np.array([math.sqrt(sum((p["halo"] + 7) ** 2 * 3.6 for p in sys_by_star[s]) + star_core[s] ** 2 * 6) + 30 + math.sqrt(len(belt[s])) * 2 for s in stars])
    pos = layout_stars(stars, est, weight)
    spos = {s: pos[i] for i, s in enumerate(stars)}

    # Розміщення планет з урахуванням напрямку до «другого» стилю
    star_radius, star_hull, star_bub = {}, {}, {}
    for s in stars:
        ps = sorted(sys_by_star[s], key=lambda p: -p["halo"])
        prefs = []
        rnd = random.Random(hash(s) & 0xFFFF)
        for p in ps:
            v = np.zeros(2)
            for other, c in p["side"].items():
                d = spos[other] - spos[s]
                v += d / (np.linalg.norm(d) or 1) * c * weight.get((s, other), 0.1)
            prefs.append(math.atan2(v[1], v[0]) if np.linalg.norm(v) > 1e-9 else rnd.uniform(0, 2 * math.pi))
        xy, outer, hull, bubbles = place_planets(ps, star_core[s], prefs, seed=hash(s) & 0xFFFF)
        star_bub[s] = bubbles
        for p, (x, y) in zip(ps, xy):
            p["lx"], p["ly"] = x, y
        # пояс астероїдів
        bel = sorted(belt[s], key=lambda r: r["year"] or 9999)
        bt = [(r, v) for r in bel for v in r["videos"]]
        if len(bt) > C.MAX_BELT_TRACKS:  # even sample across the years instead of only the oldest
            step = len(bt) / C.MAX_BELT_TRACKS
            bt = [bt[int(k * step)] for k in range(C.MAX_BELT_TRACKS)]
        # the asteroid belt follows the system's wobbly outline
        perim = sum(hull) / len(hull) * 2 * math.pi
        width = max(16, len(bt) * 9 / perim)
        p_belt = []
        for i, (r, v) in enumerate(bt):
            h = int(v["yt"].encode().hex()[:8], 16)
            a = (h % 100000) / 100000 * 2 * math.pi
            rr = hull_at(hull, a) + 10 + ((h >> 5) % 1000) / 1000 * width
            p_belt.append((r, v, rr * math.cos(a), rr * math.sin(a)))
        if bt:
            hull = [round(x + 10 + width, 1) for x in hull]
        star_hull[s] = hull
        star_radius[s] = max(hull)
        sys_by_star[s] = ps
        belt[s] = p_belt

    # Остаточна розкладка з реальними радіусами
    pos = layout_stars(stars, np.array([star_radius[s] for s in stars]), weight, iters=400)
    cen = pos.mean(0)
    stars_out, planets_out, chunks, search_artists = [], [], [], {}
    for si, s in enumerate(stars):
        sx, sy = pos[si]
        hue = (math.atan2(sy - cen[1], sx - cen[0]) / (2 * math.pi)) + 0.08
        color = hsl_hex(hue, 0.9, 0.66)
        ch = {"yt": [], "t": [], "a": [], "yr": [], "p": [], "x": [], "y": []}
        artists, a_idx = [], {}

        def add(r, v, x, y, pidx):
            if r["artist"] not in a_idx:
                a_idx[r["artist"]] = len(artists)
                artists.append(r["artist"])
                search_artists.setdefault(r["artist"].lower(), (r["artist"], si, len(ch["yt"])))
            ch["yt"].append(v["yt"]); ch["t"].append(v["title"]); ch["a"].append(a_idx[r["artist"]])
            ch["yr"].append(r["year"]); ch["p"].append(pidx); ch["x"].append(round(x, 1)); ch["y"].append(round(y, 1))

        n_tracks_star = 0
        for p in sys_by_star[s]:
            px, py = sx + p["lx"], sy + p["ly"]
            pidx = len(planets_out)
            t0 = len(ch["yt"])
            for i, (r, v) in enumerate(p["tracks"]):
                rr = p["r"] + 4 + 1.5 * math.sqrt(i + 0.5)
                a = i * GOLDEN
                add(r, v, px + rr * math.cos(a), py + rr * math.sin(a), pidx)
            planets_out.append({"name": p["name"], "s": si, "x": round(px, 1), "y": round(py, 1), "r": round(p["r"], 1),
                                "n": p["n"], "yr": p["years"], "ay": p["active_years"], "t0": t0, "t1": len(ch["yt"])})
        for r, v, x, y in belt[s]:
            add(r, v, sx + x, sy + y, -1)
        n_tracks_star = len(ch["yt"])
        ch["an"] = artists
        chunks.append(ch)
        stars_out.append({"name": s, "x": round(float(sx), 1), "y": round(float(sy), 1), "core": round(star_core[s], 1),
                          "R": round(star_radius[s], 1), "n": style_n[s], "tracks": n_tracks_star, "color": color,
                          "yh": year_hist[s], "hull": star_hull[s], "bub": star_bub[s]})

    links = [[stars.index(a), stars.index(b), round(w, 4)] for (a, b), w in weight.items() if a < b and w >= 0.03]
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "tracks").mkdir(exist_ok=True)
    for f in (out_dir / "tracks").glob("*.json"):
        f.unlink()
    meta = {"sector": "House", "sample": sample, "releases": len(rel), "tracks": sum(len(c["yt"]) for c in chunks), "years": [Y0, Y1]}
    json.dump({"meta": meta, "stars": stars_out, "links": links, "planets": planets_out},
              open(out_dir / "map.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    for i, ch in enumerate(chunks):
        json.dump(ch, open(out_dir / "tracks" / f"{i}.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(sorted(search_artists.values()), open(out_dir / "artists.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"Мапа готова: {len(stars_out)} зір, {len(planets_out):,} планет, {meta['tracks']:,} треків → {out_dir}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(C.DATA_DIR / "catalog.jsonl.gz"))
    ap.add_argument("--out", default=str(C.WEB_DATA_DIR))
    ap.add_argument("--min-style", type=int, default=C.MIN_STYLE_RELEASES)
    ap.add_argument("--min-label", type=int, default=C.MIN_LABEL_RELEASES)
    ap.add_argument("--sample", action="store_true", help="позначити дані як тестові")
    a = ap.parse_args()
    from pathlib import Path
    main(a.src, Path(a.out), a.min_style, a.min_label, a.sample)
