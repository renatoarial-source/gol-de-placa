#!/usr/bin/env bash
# Baixa os jogadores realistas (versão adulta) para public/models/ antes de montar o app.
# Os modelos do Mixamo não podem ficar num repositório público: ficam no repositório privado
# Arial (branch mixamo-assets, pasta mixamo/glb). O secret ARIAL_TOKEN é uma chave do GitHub
# que só lê o Arial (ver PUBLICAR.md).
# Uso: ARIAL_TOKEN=... scripts/modelos.sh [--obrigatorio]
set -euo pipefail
cd "$(dirname "$0")/.."
must=${1:-}
fail() { if [ "$must" = "--obrigatorio" ]; then echo "::error::$1"; exit 1; else echo "::warning::$1 (o app sai só com a versão infantil)"; exit 0; fi; }
[ -n "${ARIAL_TOKEN:-}" ] || fail "Falta o secret ARIAL_TOKEN para baixar os jogadores realistas"
mkdir -p public/models
for f in jogador jogadora; do
  out="public/models/$f.glb"
  curl -fsSL --retry 3 -H "Authorization: Bearer $ARIAL_TOKEN" -H "Accept: application/vnd.github.raw" \
    "https://api.github.com/repos/renatoarial-source/Arial/contents/mixamo/glb/$f.glb?ref=mixamo-assets" -o "$out" \
    || fail "Não deu para baixar $f.glb do Arial (a chave ARIAL_TOKEN venceu ou não tem acesso?)"
  [ "$(head -c 4 "$out")" = "glTF" ] || fail "O arquivo $f.glb baixado não é um modelo válido"
done
ls -la public/models
