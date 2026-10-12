#!/bin/bash
# Один раз: ставить усе потрібне для проєкту.
cd "$(dirname "$0")" || exit 1
echo "== Звуковий космос: встановлення =="

if ! python3 -c "import sys; assert sys.version_info >= (3, 10)" 2>/dev/null; then
  echo "Потрібен Python 3.10 або новіший. Встанови його з https://www.python.org/downloads/ і запусти цей файл ще раз."
  read -r -p "Натисни Enter, щоб закрити…"; exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  if command -v nvm >/dev/null 2>&1; then
    nvm install --lts && nvm use --lts
  else
    echo "Потрібен Node.js. Встанови LTS-версію з https://nodejs.org/ і запусти цей файл ще раз."
    read -r -p "Натисни Enter, щоб закрити…"; exit 1
  fi
fi

echo "→ Python-оточення"
python3 -m venv .venv && . .venv/bin/activate && pip install -q --upgrade pip && pip install -q -r pipeline/requirements.txt || { echo "Не вдалося встановити Python-пакети."; read -r; exit 1; }

echo "→ Сайт"
(cd web && npm install --no-fund --no-audit) || { echo "Не вдалося встановити пакети сайту."; read -r; exit 1; }

echo
echo "Готово. Далі: «3 Запустити» — подивитися мапу на тестових даних,"
echo "або «2 Зібрати дані» — зібрати справжню мапу з Discogs."
read -r -p "Натисни Enter, щоб закрити…"
