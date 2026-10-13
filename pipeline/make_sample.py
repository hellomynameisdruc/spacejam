"""Makes a small MADE-UP dump in the Discogs format, to test the whole chain without the 10 GB file.
Labels, artists and YouTube IDs are fake: the videos won't play.
"""
import gzip
import random
from xml.sax.saxutils import escape

from config import DATA_DIR

random.seed(42)
# style → neighbours it often shares a release with; several sectors, so the test map has galaxies
GRAPH = {
    "House": ["Deep House", "Tech House", "Garage House", "Disco", "Acid House"],
    "Deep House": ["House", "Garage House", "Minimal", "Downtempo"],
    "Tech House": ["House", "Minimal", "Techno"],
    "Garage House": ["House", "Deep House", "UK Garage", "Disco"],
    "Acid House": ["House", "Techno", "Acid"],
    "Ghetto House": ["House", "Ghettotech"],
    "UK Garage": ["Speed Garage", "Garage House", "Breakbeat"],
    "Speed Garage": ["UK Garage", "House"],
    "Italo House": ["House", "Italo-Disco", "Euro House"],
    "Euro House": ["Italo House", "Hip-House", "Trance"],
    "Hip-House": ["Euro House", "House"],
    "Progressive House": ["Tech House", "Progressive Trance"],
    "Techno": ["Minimal", "Dub Techno", "Acid", "Tech House"],
    "Minimal": ["Techno", "Tech House", "Deep House"],
    "Dub Techno": ["Techno", "Ambient"],
    "Acid": ["Techno", "Acid House"],
    "Hard Techno": ["Techno", "Hard Trance"],
    "Disco": ["Nu-Disco", "Italo-Disco", "Boogie", "House"],
    "Nu-Disco": ["Disco", "Deep House"],
    "Italo-Disco": ["Disco", "Hi NRG", "Italo House"],
    "Hi NRG": ["Italo-Disco", "Disco"],
    "Boogie": ["Disco"],
    "Trance": ["Progressive Trance", "Hard Trance", "Euro House"],
    "Progressive Trance": ["Trance", "Progressive House"],
    "Psy-Trance": ["Goa Trance", "Trance"],
    "Goa Trance": ["Psy-Trance"],
    "Hard Trance": ["Trance", "Hard Techno"],
    "Drum n Bass": ["Jungle", "Breakbeat"],
    "Jungle": ["Drum n Bass", "Breakbeat"],
    "Breakbeat": ["Breaks", "Drum n Bass", "UK Garage"],
    "Breaks": ["Breakbeat", "Big Beat"],
    "Big Beat": ["Breaks"],
    "Ambient": ["Downtempo", "IDM", "Dub Techno"],
    "Downtempo": ["Ambient", "Trip Hop", "Deep House"],
    "IDM": ["Ambient", "Techno"],
    "Trip Hop": ["Downtempo"],
}
# a rough "era" for each style, so the test map looks believable
ERA = {"House": 1990, "Deep House": 1996, "Tech House": 2006, "Garage House": 1993, "Acid House": 1988,
       "Ghetto House": 1997, "UK Garage": 1999, "Speed Garage": 1997, "Italo House": 1990, "Euro House": 1993,
       "Hip-House": 1989, "Progressive House": 2001, "Minimal": 2007, "Techno": 1995, "Disco": 1979,
       "Nu-Disco": 2010, "Italo-Disco": 1984, "Hi NRG": 1984, "Boogie": 1982, "Trance": 1998, "Progressive Trance": 2001,
       "Psy-Trance": 2003, "Goa Trance": 1996, "Hard Trance": 2000, "Drum n Bass": 2000, "Jungle": 1994,
       "Breakbeat": 1998, "Breaks": 2002, "Big Beat": 1998, "Ambient": 1995, "Downtempo": 2000, "IDM": 2001,
       "Trip Hop": 1997, "Dub Techno": 2004, "Acid": 1991, "Hard Techno": 2003}
# how often each style is a release's main style (house stays the biggest)
WEIGHT = {s: (6 if s in ("House", "Deep House", "Tech House") else 3 if s in ("Techno", "Disco", "Trance", "Drum n Bass", "Ambient") else 1) for s in GRAPH}
CORE = list(GRAPH)
SYL = ["ka", "lo", "mi", "ra", "ven", "tor", "sun", "deep", "jax", "ol", "ne", "bri", "cas", "dor", "phi", "zu", "mo", "trax"]


def name(n=2):
    return "".join(random.choice(SYL) for _ in range(n)).capitalize()


labels = {s: [f"{name()} {random.choice(['Records', 'Recordings', 'Music', 'Traxx', 'Sounds'])}" for _ in range(random.randint(6, 30))] for s in GRAPH}
ytchars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"


def release(i):
    if random.random() < 0.15:  # чужий жанр — має відсіятися
        return f'<release id="{i}"><genres><genre>Rock</genre></genres><styles><style>Punk</style></styles><videos><video src="https://www.youtube.com/watch?v=XXXXXXXXXXX" duration="100"><title>x</title></video></videos></release>'
    s = random.choices(CORE, weights=[WEIGHT[c] for c in CORE])[0]
    styles = {s, *random.sample(GRAPH[s], k=random.randint(0, min(2, len(GRAPH[s]))))}
    pool = labels[s]
    lab = pool[min(len(pool) - 1, int(random.paretovariate(1.3)) - 1)] if random.random() > 0.12 else "Not On Label (Self-released)"
    artist = f"{name()} {name(1)}" if random.random() < .7 else f"DJ {name()}"
    peak = ERA.get(s, 2005)
    year = int(random.gauss(peak, 4.5 if random.random() < .8 else 10))
    year = 1984 + abs(year - 1984) if year < 1984 else 2025 - abs(2025 - year) if year > 2025 else year
    tracks = [f"{name()} {random.choice(['Dub', 'Mix', 'Groove', 'Jam', 'Vision', 'Night'])}" for _ in range(random.randint(1, 4))]
    vids = "".join(
        f'<video src="https://www.youtube.com/watch?v={"".join(random.choice(ytchars) for _ in range(11))}" duration="{random.randint(200, 600)}" embed="true"><title>{escape(artist)} - {escape(t)}</title></video>'
        for t in tracks if random.random() < .8)
    return (f'<release id="{i}" status="Accepted"><artists><artist><id>1</id><name>{escape(artist)}</name></artist></artists>'
            f'<title>{escape(tracks[0])} EP</title><labels><label name="{escape(lab)}" catno="X{i}" id="{i}"/></labels>'
            f'<genres><genre>Electronic</genre>{"<genre>Funk / Soul</genre>" if s in ("Disco", "Boogie") else ""}</genres><styles>{"".join(f"<style>{x}</style>" for x in styles)}</styles>'
            f'<country>US</country><released>{year}-01-01</released><master_id>{i}</master_id>'
            f'<tracklist>{"".join(f"<track><position>A{k}</position><title>{escape(t)}</title></track>" for k, t in enumerate(tracks))}</tracklist>'
            f'<videos>{vids}</videos></release>')


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out = DATA_DIR / "sample_releases.xml.gz"
    with gzip.open(out, "wt", encoding="utf-8") as f:
        f.write("<releases>")
        for i in range(1, 20001):
            f.write(release(i))
        f.write("</releases>")
    print(f"Test dump: {out}")
