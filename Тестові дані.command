#!/bin/bash
# Повертає маленьку вигадану мапу (для перевірки, що все працює).
cd "$(dirname "$0")/pipeline" || exit 1
. ../.venv/bin/activate || { echo "Спершу запусти «1 Встановити»."; read -r; exit 1; }
python make_sample.py && python parse.py --src ../data/sample_releases.xml.gz --dst ../data/sample_catalog.jsonl.gz \
  && python build_map.py --src ../data/sample_catalog.jsonl.gz --min-style 80 --min-label 3 --sample
read -r -p "Готово. Натисни Enter…"
