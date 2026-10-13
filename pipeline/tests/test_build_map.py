"""Tests for the map build, on a handful of fake releases."""
import json
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_map as B  # noqa: E402


_ids = iter(range(10**9))


def rel(styles, label, year, artist="A", n_videos=2, ids=None):
    ids = ids or _ids
    vids = []
    for _ in range(n_videos):
        k = next(ids)
        vids.append({"yt": f"v{k:010d}", "title": f"T{k}"})
    return {"styles": styles, "label": label, "year": year, "artist": artist, "videos": vids}


def catalogue(seed=3):
    """Three styles that overlap like real ones, a few labels of different sizes, some label-less releases."""
    rnd = random.Random(seed)
    ids = iter(range(10**9))  # same ids every time, so two builds can be compared
    out = []
    styles = ["House", "Deep House", "Tech House"]
    for k in range(240):
        main = styles[k % 3]
        extra = [rnd.choice(styles)] if rnd.random() < 0.4 else []
        label = f"Label {k % 17}" if k % 9 else ""
        out.append(rel(sorted({main, *extra}), label, 1990 + k % 30, artist=f"Artist {k % 23}", ids=ids))
    out.append(rel(["Disco"], "Tiny", 1999, ids=ids))  # a style too small to be a star
    return out


def test_style_counts_and_links():
    r = [rel(["A", "B"], "x", 2000), rel(["A"], "x", 2000), rel(["B"], "y", 2001), rel(["C"], "z", 2002)]
    style_n, stars = B.style_counts(r, 2)
    assert stars == ["A", "B"] and style_n["C"] == 1
    w = B.style_links(r, stars, style_n)
    assert math.isclose(w[("A", "B")], 1 / math.sqrt(2 * 2)) and w[("A", "B")] == w[("B", "A")]


def test_home_is_the_rarest_star_style():
    r = [rel(["A", "B"], "x", 2000), rel(["A"], "x", 2000), rel(["A"], "x", 2000), rel(["Z"], "x", 2000)]
    style_n, stars = B.style_counts(r, 1)
    kept = B.assign_homes(r, ["A", "B"], style_n)
    assert [x["home"] for x in kept] == ["B", "A", "A"]


def test_small_labels_and_unlabelled_releases_go_to_the_belt():
    r = [rel(["A"], "Big", 2000) for _ in range(5)] + [rel(["A"], "Small", 2000), rel(["A"], "", 2001)]
    for x in r:
        x["home"] = "A"
    planets, belt = B.group_labels(r, ["A"], min_label=3)
    assert [p["name"] for p in planets] == ["Big"] and planets[0]["n"] == 5
    assert len(belt["A"]) == 2


def test_even_sample_spans_the_whole_list():
    xs = list(range(100))
    s = B.even_sample(xs, 10)
    assert len(s) == 10 and s[0] == 0 and s[-1] >= 90
    assert B.even_sample(xs[:5], 10) == xs[:5]


def test_planets_in_a_band_never_overlap():
    rnd = random.Random(1)
    ps = sorted([{"halo": rnd.uniform(8, 30)} for _ in range(60)], key=lambda p: -p["halo"])
    xy, outer, bands = B.place_planets(ps, 30, [rnd.uniform(0, 6.28) for _ in ps], gap=12, seed=5)
    assert len(xy) == len(ps) and bands == sorted(bands)
    by_band = {}
    for p, (x, y, o, a, band) in zip(ps, xy, strict=True):
        by_band.setdefault(band, []).append((x, y, p["halo"]))
        assert math.isclose(math.hypot(x, y), o, rel_tol=1e-9) and o < outer
    for pts in by_band.values():
        for i in range(len(pts)):
            for k in range(i + 1, len(pts)):
                (x1, y1, h1), (x2, y2, h2) = pts[i], pts[k]
                assert math.hypot(x1 - x2, y1 - y2) >= h1 + h2 + 12 - 1e-9


def test_seed_is_stable():
    import zlib
    assert B.seed_of("Deep House") == zlib.crc32(b"Deep House") & 0xFFFF


def test_build_is_consistent_and_deterministic():
    map1, chunks1, artists1 = B.build(catalogue(), min_style=20, min_label=3)
    map2, chunks2, _ = B.build(catalogue(), min_style=20, min_label=3)
    assert json.dumps(map1) == json.dumps(map2) and json.dumps(chunks1) == json.dumps(chunks2)

    stars, planets = map1["stars"], map1["planets"]
    assert len(stars) == 3
    assert "Disco" not in {s["name"] for s in stars}
    assert len(chunks1) == len(stars)
    for si, (s, ch) in enumerate(zip(stars, chunks1, strict=True)):
        n = len(ch["yt"])
        assert s["tracks"] == n and all(len(ch[k]) == n for k in ("t", "a", "yr", "p", "x", "y"))
        mine = [p for p in planets if p["s"] == si]
        # planets own consecutive track ranges at the start of the chunk; the belt follows
        end = 0
        for p in mine:
            assert p["t0"] == end and p["t1"] > p["t0"]
            assert all(ch["p"][i] == planets.index(p) for i in range(p["t0"], p["t1"]))
            end = p["t1"]
        assert all(x == -1 for x in ch["p"][end:])
        assert all(0 <= a < len(ch["an"]) for a in ch["a"])
    for p in planets:
        assert all(0 <= s < len(stars) and s != p["s"] for s, _ in p["xs"])
        star = stars[p["s"]]
        assert math.isclose(math.hypot(p["x"] - star["x"], p["y"] - star["y"]), p["o"], abs_tol=0.2)
    for a, b, w in map1["links"]:
        assert a != b and 0 <= a < len(stars) and 0 <= b < len(stars) and w >= B.LINK_MIN
    for name, si, ti in artists1:
        assert chunks1[si]["an"][chunks1[si]["a"][ti]] == name
    assert map1["meta"]["tracks"] == sum(len(c["yt"]) for c in chunks1)


def test_write_outputs(tmp_path):
    m, chunks, artists = B.build(catalogue(), min_style=20, min_label=3)
    (tmp_path / "tracks").mkdir()
    (tmp_path / "tracks" / "99.json").write_text("{}")  # stale file from an older build
    B.write_outputs(tmp_path, m, chunks, artists)
    assert json.loads((tmp_path / "map.json").read_text())["meta"] == m["meta"]
    assert sorted(p.name for p in (tmp_path / "tracks").iterdir()) == sorted(f"{i}.json" for i in range(len(chunks)))


# ---------- sectors ----------
import catalog as K  # noqa: E402


def raw(id_, master, styles, genres=("Electronic",), year=2000, label="L", vids=("a",)):
    return {"id": id_, "master": master, "title": "t", "artist": "A", "label": label, "year": year, "country": "",
            "genres": list(genres), "styles": list(styles), "videos": [{"yt": v, "title": v, "dur": 0} for v in vids]}


def test_sector_membership_needs_genre_and_style():
    disco = next(s for s in K.load_sectors() if s["id"] == "disco")
    assert K.in_sector(raw(1, 0, ["Disco"], genres=["Funk / Soul"]), disco)
    assert not K.in_sector(raw(1, 0, ["Disco"], genres=["Rock"]), disco)
    assert not K.in_sector(raw(1, 0, ["House"]), disco)


def test_merge_editions_and_videos_once():
    out = K.merge([raw(1, 7, ["House"], year=1995, label="", vids=["a", "b"]),
                   raw(2, 7, ["Deep House"], year=1993, label="X", vids=["b", "c"]),
                   raw(3, 0, ["House"], vids=["a"])])  # only a repeat of a known video → dropped
    assert len(out) == 1
    r = out[0]
    assert r["year"] == 1993 and r["label"] == "X" and r["styles"] == ["Deep House", "House"]
    assert [v["yt"] for v in r["videos"]] == ["a", "b", "c"] and "genres" not in r


def test_browser_script_has_the_same_sectors():
    js = (Path(__file__).resolve().parents[1] / "browser_parse.js").read_text(encoding="utf-8")
    body = js[js.index("/*SECTORS*/"):js.index("/*END*/")]
    for s in K.load_sectors():
        assert f'id: "{s["id"]}"' in body
        assert "genres: " + json.dumps(s["genres"]).replace('","', '", "') in body
        assert "styles: " + json.dumps(s["styles"]).replace('","', '", "') in body


def test_sectors_become_galaxies():
    sectors = [{"id": "house", "name": "House", "genres": ["Electronic"], "styles": ["House", "Deep House"]},
               {"id": "techno", "name": "Techno", "genres": ["Electronic"], "styles": ["Techno", "Minimal"]}]
    ids = iter(range(10**9))
    out = []
    for k in range(400):
        st = [["House"], ["Deep House", "House"], ["Techno"], ["Minimal", "Techno"], ["Tech House", "House"]][k % 5]
        r = rel_(st, f"L{k % 7}", 1995 + k % 20, ids)
        r["secs"] = [s["id"] for s in sectors if set(st) & set(s["styles"])]
        out.append(r)
    m, _, _ = B.build(out, 50, 3, sample=True, sectors=sectors)
    names = {g["id"]: k for k, g in enumerate(m["galaxies"])}
    assert set(names) == {"house", "techno"} and m["meta"]["sector"] == "Electronic"
    by = {s["name"]: s["g"] for s in m["stars"]}
    assert by["House"] == by["Deep House"] == by["Tech House"] == names["house"]  # Tech House: most releases are house
    assert by["Techno"] == by["Minimal"] == names["techno"]
    # each galaxy's stars sit inside its cloud
    for s in m["stars"]:
        g = m["galaxies"][s["g"]]
        assert math.hypot(s["x"] - g["x"], s["y"] - g["y"]) <= g["r"] + 1


def rel_(styles, label, year, ids):
    return rel(styles, label, year, ids=ids)
