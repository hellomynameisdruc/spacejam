"""Map build settings. Sectors themselves are defined in sectors.json."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"                      # великі файли (дамп, каталог) — не йдуть на сайт
WEB_DATA_DIR = ROOT / "web" / "public" / "data"  # те, що читає сайт

# Sectors (which genres and styles each map takes) live in sectors.json

# Releases a style needs to become a star: this share of the sector, at least MIN_STYLE_FLOOR
# (a sector can set its own min_style in sectors.json)
MIN_STYLE_SHARE = 0.004
MIN_STYLE_FLOOR = 300
MIN_STYLE_RELEASES = 1500  # house, and the default for a whole catalogue built without sectors
# Скільки релізів має бути в лейбла, щоб він став планетою (менші йдуть у пояс астероїдів)
MIN_LABEL_RELEASES = 6
# Максимум треків довкола однієї планети (щоб гіганти не з'їли простір)
MAX_TRACKS_PER_PLANET = 250
# Максимум треків у поясі астероїдів однієї зорі
MAX_BELT_TRACKS = 3000
# Максимум планет-лейблів довкола однієї зорі (решта йде в пояс)
MAX_PLANETS_PER_STAR = 300
