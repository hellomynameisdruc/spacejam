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
        dist = np.linalg.norm(d, axis=2) + np.eye(n)
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
        pos += force * step
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


def place_planets(planets, star_r, prefs, gap=14):
    """Кільця навколо зорі (планети відсортовані від більших до менших). Кожна планета
    стає якомога ближче до кута, що дивиться в бік її «другого» стилю."""
    out = []
    inner_edge = star_r + 30
    cur_r, cur_max, iv = None, 0.0, []
    for pl, pref in zip(planets, prefs):
        halo = pl["halo"]
        while True:
            if cur_r is None:
                cur_r, cur_max, iv = inner_edge + halo + gap, halo, []
            if cur_r - halo < inner_edge + gap - 1e-6:
                inner_edge, cur_r = cur_r + cur_max, None
                continue
            half = (halo + gap / 2) / cur_r
            ang = None
            if not iv:
                ang = pref
            else:
                for k in range(0, 420):
                    cand = pref + (k + 1) // 2 * 0.015 * (1 if k % 2 else -1)
                    if all(abs((cand - a + math.pi) % (2 * math.pi) - math.pi) >= half + h for a, h in iv):
                        ang = cand
                        break
            if ang is None:
                inner_edge, cur_r = cur_r + cur_max, None
                continue
            iv.append((ang, half))
            cur_max = max(cur_max, halo)
            out.append((cur_r * math.cos(ang), cur_r * math.sin(ang)))
            break
    outer = cur_r + cur_max if cur_r is not None else inner_edge
    return out, outer


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
        tracks = sorted(((r, v) for r in rs for v in r["videos"]), key=lambda rv: (rv[0]["year"] or 9999))[:C.MAX_TRACKS_PER_PLANET]
        n_tr = len(tracks)
        r_pl = min(26, 3 + 1.25 * math.sqrt(len(rs)))
        planets.append({
            "name": name, "star": star, "n": len(rs), "side": side, "tracks": tracks,
            "r": r_pl, "halo": r_pl + 4 + 1.5 * math.sqrt(n_tr),
            "years": [min((r["year"] for r in rs if r["year"]), default=0), max(r["year"] for r in rs)],
        })
    for r in rel:
        if not r["label"]:
            belt[r["home"]].append(r)

    # Попередня оцінка розміру систем (для розкладки зір)
    sys_by_star = defaultdict(list)
    for p in planets:
        sys_by_star[p["star"]].append(p)
    star_core = {s: 10 + 3.2 * math.log1p(style_n[s]) for s in stars}
    est = np.array([math.sqrt(sum((p["halo"] + 7) ** 2 * 3.6 for p in sys_by_star[s]) + star_core[s] ** 2 * 6) + 30 + math.sqrt(len(belt[s])) * 2 for s in stars])
    pos = layout_stars(stars, est, weight)
    spos = {s: pos[i] for i, s in enumerate(stars)}

    # Розміщення планет з урахуванням напрямку до «другого» стилю
    star_radius = {}
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
        xy, outer = place_planets(ps, star_core[s], prefs)
        for p, (x, y) in zip(ps, xy):
            p["lx"], p["ly"] = x, y
        # пояс астероїдів
        bel = sorted(belt[s], key=lambda r: r["year"] or 9999)
        bt = [(r, v) for r in bel for v in r["videos"]][:C.MAX_BELT_TRACKS]
        inner = outer + 24
        width = max(16, len(bt) * 9 / (2 * math.pi * inner))
        p_belt = []
        for i, (r, v) in enumerate(bt):
            h = int(v["yt"].encode().hex()[:8], 16)
            a = (h % 100000) / 100000 * 2 * math.pi
            rr = inner + ((h >> 5) % 1000) / 1000 * width
            p_belt.append((r, v, rr * math.cos(a), rr * math.sin(a)))
        star_radius[s] = (inner + width) if bt else outer
        sys_by_star[s] = ps
        belt[s] = p_belt

    # Остаточна розкладка з реальними радіусами
    pos = layout_stars(stars, np.array([star_radius[s] for s in stars]), weight, iters=400)
    cen = pos.mean(0)
    stars_out, planets_out, chunks, search_artists = [], [], [], {}
    for si, s in enumerate(stars):
        sx, sy = pos[si]
        hue = (math.atan2(sy - cen[1], sx - cen[0]) / (2 * math.pi)) + 0.08
        color = hsl_hex(hue, 0.85, 0.68)
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
                                "n": p["n"], "yr": p["years"], "t0": t0, "t1": len(ch["yt"])})
        for r, v, x, y in belt[s]:
            add(r, v, sx + x, sy + y, -1)
        n_tracks_star = len(ch["yt"])
        ch["an"] = artists
        chunks.append(ch)
        stars_out.append({"name": s, "x": round(float(sx), 1), "y": round(float(sy), 1), "core": round(star_core[s], 1),
                          "R": round(star_radius[s], 1), "n": style_n[s], "tracks": n_tracks_star, "color": color})

    links = [[stars.index(a), stars.index(b), round(w, 4)] for (a, b), w in weight.items() if a < b and w >= 0.03]
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "tracks").mkdir(exist_ok=True)
    for f in (out_dir / "tracks").glob("*.json"):
        f.unlink()
    meta = {"sector": "House", "sample": sample, "releases": len(rel), "tracks": sum(len(c["yt"]) for c in chunks)}
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
