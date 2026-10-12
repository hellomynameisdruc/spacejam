"""Налаштування сектору. Змінюй тут, щоб розширити або звузити мапу."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"                      # великі файли (дамп, каталог) — не йдуть на сайт
WEB_DATA_DIR = ROOT / "web" / "public" / "data"  # те, що читає сайт

# Сектор «House»: реліз потрапляє на мапу, якщо в нього жанр Electronic
# і хоча б один із цих стилів. Сусідні стилі (Techno, Disco…) з'являться
# на мапі самі, якщо часто трапляються разом із хаусом.
GENRE = "Electronic"
CORE_STYLES = {
    "House", "Deep House", "Tech House", "Acid House", "Garage House",
    "Progressive House", "Hard House", "Ghetto House", "Hip-House",
    "Italo House", "Electro House", "Speed Garage", "UK Garage",
    "Euro House", "Latin House", "Afro House", "Jackin House", "Funky House",
    "Ghettotech",
}

# Скільки релізів має бути в стилю, щоб він став зорею
MIN_STYLE_RELEASES = 1500
# Скільки релізів має бути в лейбла, щоб він став планетою (менші йдуть у пояс астероїдів)
MIN_LABEL_RELEASES = 6
# Максимум треків довкола однієї планети (щоб гіганти не з'їли простір)
MAX_TRACKS_PER_PLANET = 250
# Максимум треків у поясі астероїдів однієї зорі
MAX_BELT_TRACKS = 3000
# Максимум планет-лейблів довкола однієї зорі (решта йде в пояс)
MAX_PLANETS_PER_STAR = 300
