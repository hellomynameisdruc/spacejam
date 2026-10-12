"""Генерує невеликий ВИГАДАНИЙ дамп у форматі Discogs, щоб перевірити весь ланцюжок
без завантаження 10 ГБ. Лейбли, артисти й YouTube ID тут несправжні — відео не гратимуть.
"""
import gzip
import random
from xml.sax.saxutils import escape

from config import DATA_DIR

random.seed(42)
# стиль → сусіди, з якими він часто трапляється разом
GRAPH = {
    "House": ["Deep House", "Tech House", "Garage House", "Disco", "Acid House"],
    "Deep House": ["House", "Garage House", "Soulful", "Minimal"],
    "Tech House": ["House", "Minimal", "Techno"],
    "Garage House": ["House", "Deep House", "UK Garage", "Disco"],
    "Acid House": ["House", "Techno", "Acid"],
    "Ghetto House": ["House", "Ghettotech", "Juke"],
    "UK Garage": ["Speed Garage", "Garage House", "Breakbeat"],
    "Speed Garage": ["UK Garage", "House"],
    "Italo House": ["House", "Italo-Disco", "Euro House"],
    "Euro House": ["Italo House", "Hip-House", "Eurodance"],
    "Hip-House": ["Euro House", "House"],
    "Progressive House": ["Tech House", "Trance"],
    "Minimal": ["Tech House", "Deep House", "Techno"],
    "Techno": ["Tech House", "Minimal", "Acid House"],
    "Disco": ["House", "Garage House", "Italo-Disco"],
}
CORE = [s for s in GRAPH if s not in ("Minimal", "Techno", "Disco")]
SYL = ["ka", "lo", "mi", "ra", "ven", "tor", "sun", "deep", "jax", "ol", "ne", "bri", "cas", "dor", "phi", "zu", "mo", "trax"]


def name(n=2):
    return "".join(random.choice(SYL) for _ in range(n)).capitalize()


labels = {s: [f"{name()} {random.choice(['Records', 'Recordings', 'Music', 'Traxx', 'Sounds'])}" for _ in range(random.randint(6, 30))] for s in GRAPH}
ytchars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"


def release(i):
    if random.random() < 0.15:  # чужий жанр — має відсіятися
        return f'<release id="{i}"><genres><genre>Rock</genre></genres><styles><style>Punk</style></styles><videos><video src="https://www.youtube.com/watch?v=XXXXXXXXXXX" duration="100"><title>x</title></video></videos></release>'
    s = random.choice(CORE)
    styles = {s, *random.sample(GRAPH[s], k=random.randint(0, min(2, len(GRAPH[s]))))}
    pool = labels[s]
    lab = pool[min(len(pool) - 1, int(random.paretovariate(1.3)) - 1)] if random.random() > 0.12 else "Not On Label (Self-released)"
    artist = f"{name()} {name(1)}" if random.random() < .7 else f"DJ {name()}"
    year = random.randint(1986, 2025)
    tracks = [f"{name()} {random.choice(['Dub', 'Mix', 'Groove', 'Jam', 'Vision', 'Night'])}" for _ in range(random.randint(1, 4))]
    vids = "".join(
        f'<video src="https://www.youtube.com/watch?v={"".join(random.choice(ytchars) for _ in range(11))}" duration="{random.randint(200, 600)}" embed="true"><title>{escape(artist)} - {escape(t)}</title></video>'
        for t in tracks if random.random() < .8)
    return (f'<release id="{i}" status="Accepted"><artists><artist><id>1</id><name>{escape(artist)}</name></artist></artists>'
            f'<title>{escape(tracks[0])} EP</title><labels><label name="{escape(lab)}" catno="X{i}" id="{i}"/></labels>'
            f'<genres><genre>Electronic</genre></genres><styles>{"".join(f"<style>{x}</style>" for x in styles)}</styles>'
            f'<country>US</country><released>{year}-01-01</released><master_id>{i}</master_id>'
            f'<tracklist>{"".join(f"<track><position>A{k}</position><title>{escape(t)}</title></track>" for k, t in enumerate(tracks))}</tracklist>'
            f'<videos>{vids}</videos></release>')


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out = DATA_DIR / "sample_releases.xml.gz"
    with gzip.open(out, "wt", encoding="utf-8") as f:
        f.write("<releases>")
        for i in range(1, 12001):
            f.write(release(i))
        f.write("</releases>")
    print(f"Тестовий дамп: {out}")
