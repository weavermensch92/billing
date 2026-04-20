#!/usr/bin/env bash
# Gridge Billing MSP — Demo Launcher (Bash)

set -u
BASE_URL="${DEMO_BASE_URL:-http://localhost:3000}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Open browser helper (Windows / macOS / Linux)
open_url() {
  local url="$1"
  if command -v start >/dev/null 2>&1; then
    start "" "$url"
  elif command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c start "" "$url" 2>/dev/null || true
  elif command -v open >/dev/null 2>&1; then
    open "$url"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1
  else
    echo "  [!] 브라우저를 자동으로 열 수 없습니다. 직접 접속하세요:"
    echo "      $url"
  fi
}

open_login() {
  local email="$1" redirect="$2"
  echo ""
  echo "  [+] $email → $redirect 로그인"
  open_url "$BASE_URL/api/dev-login?email=$email&redirect=$redirect"
  sleep 1
}

server_start() {
  echo ""
  echo "  [+] dev 서버 시작 (백그라운드)..."
  (cd "$PROJECT_ROOT" && nohup npm run dev >/tmp/gridge-dev.log 2>&1 &)
  echo "  [+] 부팅 대기 (8초)..."
  sleep 8
  echo "  [+] 브라우저 열기"
  open_url "$BASE_URL/login"
  sleep 2
}

server_stop() {
  echo ""
  echo "  [-] dev 서버 종료..."
  if command -v taskkill.exe >/dev/null 2>&1; then
    taskkill.exe //F //IM node.exe >/dev/null 2>&1 || true
  else
    pkill -f "next dev" 2>/dev/null || true
  fi
  echo "  [-] 완료."
}

server_status() {
  echo ""
  if command -v netstat >/dev/null 2>&1; then
    if netstat -ano 2>/dev/null | grep -E "LISTENING" | grep -q ":3000 "; then
      echo "  [+] 3000 포트 LISTENING — 서버 가동 중"
    else
      echo "  [ ] 3000 포트 사용 안 됨 (서버 중지 상태)"
    fi
  else
    curl -s -o /dev/null -w "HTTP %{http_code}\n" --max-time 2 "$BASE_URL" || echo "  [ ] 응답 없음"
  fi
  echo ""
  read -rp "Enter 키를 눌러 메뉴로..."
}

show_menu() {
  clear
  cat <<'EOF'

  ========================================================
   Gridge Billing MSP  -  Demo Launcher (Mock Mode)
  ========================================================

   [ Server ]
    1. dev server start + 브라우저 열기
    2. dev server stop
    3. dev server status

   [ Customer Portal ]
    4. Alice (Owner)    - 전 기능
    5. Bob (Admin)      - 멤버/요청 관리
    6. Charlie (Member) - 본인 계정 조회

   [ Ops Console ]
    7. Luna (AM)        - 요청 처리/CSM
    8. Weber (Super)    - 조직 등록/VCN reveal

   [ Quick Paths ]
    9. Alice -> /billing
   10. Alice -> /billing/creditback
   11. Weber -> /console/orgs/new
   12. Weber -> /console/invoices
   13. Luna  -> /console/requests

    0. Exit
  ========================================================
EOF
}

while true; do
  show_menu
  read -rp "선택: " choice
  case "$choice" in
    1)  server_start ;;
    2)  server_stop; sleep 1 ;;
    3)  server_status ;;
    4)  open_login "alice@acme.com"   "/home" ;;
    5)  open_login "bob@acme.com"     "/services" ;;
    6)  open_login "charlie@acme.com" "/services" ;;
    7)  open_login "luna@gridge.ai"   "/console/home" ;;
    8)  open_login "weber@gridge.ai"  "/console/home" ;;
    9)  open_login "alice@acme.com"   "/billing" ;;
    10) open_login "alice@acme.com"   "/billing/creditback" ;;
    11) open_login "weber@gridge.ai"  "/console/orgs/new" ;;
    12) open_login "weber@gridge.ai"  "/console/invoices" ;;
    13) open_login "luna@gridge.ai"   "/console/requests" ;;
    0)  echo ""; echo "  종료합니다."; exit 0 ;;
    *)  echo "  [!] 잘못된 선택입니다."; sleep 1 ;;
  esac
done
