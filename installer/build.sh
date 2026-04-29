#!/usr/bin/env bash
# Gridge Billing Fill Helper 인스톨러 빌드 (WSL / macOS / Linux)
# Inno Setup 은 Windows 전용이므로 WSL 의 경우 Windows 측 ISCC.exe 를 호출.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXT_DIR="$ROOT_DIR/extension"
INS_DIR="$ROOT_DIR/installer"

# Inno Setup 경로 (WSL에서 Windows 호출)
ISCC_DEFAULT='/mnt/c/Program Files (x86)/Inno Setup 6/ISCC.exe'
ISCC="${ISCC_PATH:-$ISCC_DEFAULT}"

c() { echo -e "\n\e[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n  $1\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\e[0m"; }

# ── 0. 사전 조건 ──
c "0. 사전 조건"
if [ ! -f "$EXT_DIR/key.pem" ]; then
  echo "[!] extension/key.pem 없음. 생성 중..."
  (cd "$EXT_DIR" && node scripts/generate-key.mjs)
fi

# WSL 환경 감지
if grep -qi microsoft /proc/version 2>/dev/null; then
  IS_WSL=1
else
  IS_WSL=0
fi

if [ ! -f "$ISCC" ] && [ "$IS_WSL" -eq 1 ]; then
  echo "[!] ISCC.exe 를 찾을 수 없습니다: $ISCC"
  echo "    1. Windows 에 Inno Setup 6 설치: https://jrsoftware.org/isdl.php"
  echo "    2. ISCC_PATH 환경변수로 경로 지정 가능"
  exit 1
fi

if [ "$IS_WSL" -eq 0 ]; then
  echo "[i] 비-Windows 환경에서는 Inno Setup 컴파일을 스킵합니다."
  echo "    extension + CRX 는 빌드하되 .exe 는 생성되지 않습니다."
  SKIP_ISCC=1
else
  SKIP_ISCC=0
fi

# ── 1. Extension 빌드 ──
c "1. Extension 빌드"
cd "$EXT_DIR"
[ -d node_modules ] || npm install
npm run build

# ── 2. CRX 패키징 ──
c "2. CRX 서명·패키징"
node scripts/pack-crx.mjs

EXT_ID=$(cat "$EXT_DIR/artifacts/extension-id.txt" | tr -d '[:space:]')
if [ "${#EXT_ID}" -ne 32 ]; then
  echo "[!] Extension ID 비정상: '$EXT_ID'"; exit 1
fi
echo "    Extension ID: $EXT_ID"

# ── 3. .iss 플레이스홀더 치환 ──
c "3. Inno Setup 스크립트 준비"
cd "$INS_DIR"
sed "s/PLACEHOLDER_EXTENSION_ID_32CHARS/$EXT_ID/g" \
  gridge-billing-helper.iss > gridge-billing-helper.gen.iss
echo "    생성: $INS_DIR/gridge-billing-helper.gen.iss"

# ── 4. ISCC 컴파일 ──
if [ "$SKIP_ISCC" -eq 1 ]; then
  c "4. ISCC 스킵 (Windows 환경 아님)"
  echo "    .iss 스크립트만 준비됨. Windows 에서 수동 컴파일 필요."
else
  c "4. Inno Setup 컴파일"
  # WSL → Windows path 변환
  WIN_ISS=$(wslpath -w "$INS_DIR/gridge-billing-helper.gen.iss")
  "$ISCC" "$WIN_ISS"
fi

# ── 5. 결과 ──
c "5. 빌드 완료"
if [ -d "$INS_DIR/output" ]; then
  ls -lh "$INS_DIR/output/"*.exe 2>/dev/null || echo "  (.exe 없음 — Windows 에서 빌드 필요)"
fi
echo "    Extension ID: $EXT_ID"
rm -f "$INS_DIR/gridge-billing-helper.gen.iss"
echo ""
echo "  [✓] 완료"
