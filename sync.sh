#!/bin/bash
cd ~/letters-app

# Copie automatique du dernier index*.html téléchargé
LATEST=$(ls -t ~/Downloads/index*.html 2>/dev/null | head -1)
if [ -n "$LATEST" ]; then
  echo "📄 Fichier détecté : $LATEST"
  cp "$LATEST" ~/letters-app/index.html
  cp "$LATEST" ~/letters-app/www/index.html
  echo "✅ Copié dans letters-app"
else
  echo "⚠️  Aucun index*.html dans Downloads — on utilise le fichier existant"
fi

git pull
cp index.html www/index.html
git add .
git commit -m "update $(date '+%H:%M')"
git push
npx cap sync ios
npx cap open ios
