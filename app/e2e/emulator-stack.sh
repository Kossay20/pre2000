#!/usr/bin/env bash
# Signed-in E2E stack: Firebase Auth + Firestore emulators (real rules), seeded
# static content, and a web export wired to them, served on :8090.
#
#   bash e2e/emulator-stack.sh up       # idempotent; rebuilds the export only if missing
#   bash e2e/emulator-stack.sh rebuild  # re-export after source changes
#   bash e2e/emulator-stack.sh status
#   bash e2e/emulator-stack.sh down
#
# Then: E2E_BASE_URL=http://localhost:8090 npx playwright test <spec>
set -uo pipefail
cd "$(dirname "$0")/.."
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && nvm use >/dev/null 2>&1

STATE=e2e/.stack
mkdir -p "$STATE"
PROJECT_ID=$(grep '^EXPO_PUBLIC_FIREBASE_PROJECT_ID=' .env | cut -d= -f2)

listening() { lsof -iTCP:"$1" -sTCP:LISTEN -P >/dev/null 2>&1; }

export_web() {
  EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 \
    npx expo export --platform web --output-dir dist-e2e --clear >"$STATE/export.log" 2>&1 \
    || { echo "export failed — see $STATE/export.log"; exit 1; }
}

up() {
  if ! listening 9099 || ! listening 8080; then
    nohup npx --yes firebase-tools@13 emulators:start --only auth,firestore --project "$PROJECT_ID" \
      >"$STATE/emulators.log" 2>&1 &
    for _ in $(seq 1 60); do grep -q "All emulators ready" "$STATE/emulators.log" 2>/dev/null && break; sleep 2; done
    listening 9099 && listening 8080 || { echo "emulators failed — see $STATE/emulators.log"; exit 1; }
    node e2e/helpers/seed-emulator.mjs "$PROJECT_ID" >"$STATE/seed.log" 2>&1 \
      || { echo "seed failed — see $STATE/seed.log"; exit 1; }
  fi
  [ -f dist-e2e/index.html ] || export_web
  if ! listening 8090; then
    nohup npx serve dist-e2e -l 8090 --single >"$STATE/serve.log" 2>&1 &
    for _ in $(seq 1 30); do listening 8090 && break; sleep 1; done
  fi
  status
}

status() {
  for p in 9099 8080 8090; do
    if listening "$p"; then echo "  :$p up"; else echo "  :$p DOWN"; fi
  done
}

down() {
  pkill -f "firebase-tools@13 emulators:start" 2>/dev/null
  pkill -f cloud-firestore-emulator 2>/dev/null
  pkill -f "serve dist-e2e" 2>/dev/null
  status
}

case "${1:-up}" in
  up) up ;;
  rebuild) export_web; status ;;
  status) status ;;
  down) down ;;
  *) echo "usage: $0 up|rebuild|status|down"; exit 2 ;;
esac
