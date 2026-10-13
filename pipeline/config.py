"""Map build settings. Sectors themselves are defined in sectors.json."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"                      # великі файли (дамп, каталог) — не йдуть на сайт
WEB_DATA_DIR = ROOT / "web" / "public" / "data"  # те, що читає сайт

# Sectors (which genres and styles each map takes) live in sectors.json

# Releases a style needs to become a star
MIN_STYLE_RELEASES = 1500
# Скільки релізів має бути в лейбла, щоб він став планетою (менші йдуть у пояс астероїдів)
MIN_LABEL_RELEASES = 6
# Максимум треків довкола однієї планети (щоб гіганти не з'їли простір)
MAX_TRACKS_PER_PLANET = 250
# Максимум треків у поясі астероїдів однієї зорі
MAX_BELT_TRACKS = 3000
# Максимум планет-лейблів довкола однієї зорі (решта йде в пояс)
MAX_PLANETS_PER_STAR = 300
