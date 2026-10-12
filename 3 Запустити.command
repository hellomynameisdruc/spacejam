#!/bin/bash
# Відкриває мапу в браузері. Щоб зупинити — закрий це вікно Терміналу.
cd "$(dirname "$0")/web" || exit 1
if ! command -v node >/dev/null 2>&1; then export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; fi
[ -d node_modules ] || { echo "Спершу запусти «1 Встановити»."; read -r; exit 1; }
echo "Мапа відкриється в браузері: http://localhost:5173"
echo "Щоб зупинити, закрий це вікно."
npx vite --open
