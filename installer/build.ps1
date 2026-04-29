<#
.SYNOPSIS
  Gridge Billing Fill Helper 인스톨러 End-to-End 빌드 (Windows).

.DESCRIPTION
  1. extension 빌드 (vite)
  2. crx 패키징 + Extension ID 추출
  3. update.xml 플레이스홀더 치환
  4. Inno Setup ISCC.exe 컴파일 → installer/output/*.exe

.PARAMETER InnoSetupPath
  ISCC.exe 경로 (기본: "C:\Program Files (x86)\Inno Setup 6\ISCC.exe")

.EXAMPLE
  .\build.ps1
  .\build.ps1 -InnoSetupPath "D:\Tools\InnoSetup6\ISCC.exe"
#>

param(
  [string]$InnoSetupPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\..\"
$extDir = Join-Path $root "extension"
$insDir = Join-Path $root "installer"

function Step($msg) {
  Write-Host ""
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
  Write-Host "  $msg" -ForegroundColor Cyan
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

# ── 0. 사전 조건 확인 ──
Step "0. 사전 조건"

if (-not (Test-Path (Join-Path $extDir "key.pem"))) {
  Write-Host "[!] extension/key.pem 없음. 생성 중..." -ForegroundColor Yellow
  Push-Location $extDir
  node scripts/generate-key.mjs
  Pop-Location
}

if (-not (Test-Path $InnoSetupPath)) {
  Write-Host "[!] Inno Setup 6 을 찾을 수 없습니다." -ForegroundColor Red
  Write-Host "    설치: https://jrsoftware.org/isdl.php"
  Write-Host "    또는 경로를 직접 지정: -InnoSetupPath <path>"
  exit 1
}

# ── 1. Extension 빌드 ──
Step "1. Extension 빌드 (vite)"
Push-Location $extDir
if (-not (Test-Path "node_modules")) { npm install }
npm run build
Pop-Location

# ── 2. CRX 패키징 ──
Step "2. CRX 서명·패키징"
Push-Location $extDir
node scripts/pack-crx.mjs
Pop-Location

$extensionId = (Get-Content (Join-Path $extDir "artifacts\extension-id.txt")).Trim()
if ($extensionId.Length -ne 32) {
  Write-Host "[!] Extension ID 가 유효하지 않음: '$extensionId'" -ForegroundColor Red
  exit 1
}
Write-Host "    Extension ID: $extensionId" -ForegroundColor Green

# ── 3. update.xml 치환 (임시 파일 생성) ──
Step "3. update.xml 플레이스홀더 치환"
$tmpUpdate = Join-Path $insDir "assets\update.xml"
$template = Get-Content $tmpUpdate -Raw
$codebase = "file:///{app}/gridge-billing-helper.crx"
$filled = $template -replace '\{EXTENSION_ID\}', $extensionId -replace '\{CODEBASE\}', [regex]::Escape($codebase).Replace('\\', '/')
# 단순화: {CODEBASE} 는 Inno Setup 의 {app} 은 실제 설치 시 절대경로로 치환됨.
# 여기선 그대로 두고 install-policy.ps1 이 UpdateUrl 을 직접 전달.
Write-Host "    (update.xml 플레이스홀더는 install-policy.ps1 에서 동적 치환됨)"

# ── 4. .iss 플레이스홀더 치환 (임시 복사본) ──
Step "4. Inno Setup 스크립트 준비"
$issTemplate = Join-Path $insDir "gridge-billing-helper.iss"
$issTmp = Join-Path $insDir "gridge-billing-helper.gen.iss"
(Get-Content $issTemplate -Raw) -replace 'PLACEHOLDER_EXTENSION_ID_32CHARS', $extensionId | Set-Content $issTmp -Encoding UTF8
Write-Host "    생성: $issTmp"

# ── 5. Inno Setup 컴파일 ──
Step "5. Inno Setup 컴파일 (ISCC.exe)"
& $InnoSetupPath $issTmp
if ($LASTEXITCODE -ne 0) {
  Write-Host "[!] Inno Setup 컴파일 실패" -ForegroundColor Red
  exit 1
}

# ── 6. 결과 요약 ──
Step "6. 빌드 완료"
$output = Get-ChildItem (Join-Path $insDir "output\*.exe") | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($output) {
  Write-Host "    출력: $($output.FullName)" -ForegroundColor Green
  Write-Host "    크기: $([math]::Round($output.Length / 1MB, 2)) MB"
  Write-Host "    Extension ID: $extensionId"
}

# 임시 파일 정리
Remove-Item $issTmp -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "  [✓] 배포 가능. 관리자 권한으로 exe 실행 → Chrome/Edge 재시작 → 확장 자동 설치" -ForegroundColor Green
