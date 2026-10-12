#!/bin/bash
# Необов'язково: збирає справжню мапу на цьому Маці. Зазвичай це робить GitHub сам.
# Дамп Discogs читається потоком з інтернету, на диск не зберігається (займе ~100 МБ).
cd "$(dirname "$0")" || exit 1
[ -d .venv ] || { echo "Спершу запусти «1 Встановити»."; read -r; exit 1; }
. .venv/bin/activate
cd pipeline || exit 1
echo "== Крок 1/2: читаю найсвіжіший дамп Discogs і відбираю хаус-релізи (≈1–2 год) =="
python -u parse.py --src latest || { read -r; exit 1; }
echo "== Крок 2/2: розрахунок мапи =="
python -u build_map.py || { read -r; exit 1; }
echo
echo "Готово! Запусти «3 Запустити», щоб відкрити мапу."
read -r -p "Натисни Enter, щоб закрити…"
