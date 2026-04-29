<#
.SYNOPSIS
  Gridge Billing Fill Helper 를 Chrome/Edge 의 ExtensionInstallForcelist 정책에 등록.

.DESCRIPTION
  HKLM 레지스트리에 정책 키를 쓴다. Chrome/Edge 다음 시작 시 자동 설치.
  관리자 권한 필요.

.PARAMETER Target
  "Chrome" 또는 "Edge".

.PARAMETER ExtensionId
  32자 Extension ID (a-p). extension/scripts/pack-crx.mjs 출력값.

.PARAMETER UpdateUrl
  update manifest URL. 로컬 파일(file:///) 또는 https://.

.EXAMPLE
  .\install-policy.ps1 -Target Chrome `
    -ExtensionId "abcdefghijklmnopabcdefghijklmnop" `
    -UpdateUrl "file:///C:/Program Files/Gridge/BillingHelper/update.xml"
#>

param(
  [Parameter(Mandatory=$true)][ValidateSet('Chrome','Edge')][string]$Target,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [Parameter(Mandatory=$true)][string]$UpdateUrl
)

$ErrorActionPreference = 'Stop'

# 타겟별 정책 경로
$policyRoot = if ($Target -eq 'Chrome') {
  'HKLM:\Software\Policies\Google\Chrome'
} else {
  'HKLM:\Software\Policies\Microsoft\Edge'
}
$forcelistPath = "$policyRoot\ExtensionInstallForcelist"

# 키 없으면 생성
if (-not (Test-Path $policyRoot))    { New-Item -Path $policyRoot -Force | Out-Null }
if (-not (Test-Path $forcelistPath)) { New-Item -Path $forcelistPath -Force | Out-Null }

# 기존 값 중 Gridge extension ID 가 있으면 삭제
$existing = Get-Item $forcelistPath
$nextIdx = 1
foreach ($prop in $existing.Property) {
  $val = $existing.GetValue($prop)
  if ($val -like "$ExtensionId;*") {
    Remove-ItemProperty -Path $forcelistPath -Name $prop -Force
    Write-Host "[~] 기존 항목 제거: $prop = $val"
  } else {
    # 다른 기존 정책은 유지, 슬롯 번호만 기록
    $i = [int]::TryParse($prop, [ref]$null)
    if ($i -and [int]$prop -ge $nextIdx) { $nextIdx = [int]$prop + 1 }
  }
}

# Forcelist 항목: "index"=(string) "<ext_id>;<update_url>"
$value = "$ExtensionId;$UpdateUrl"
New-ItemProperty -Path $forcelistPath -Name "$nextIdx" -Value $value -PropertyType String -Force | Out-Null

Write-Host "[+] $Target 정책 등록 완료"
Write-Host "    Path:  $forcelistPath"
Write-Host "    Slot:  $nextIdx"
Write-Host "    Value: $value"
Write-Host ""
Write-Host "[i] $Target 를 재시작하면 자동으로 확장이 설치됩니다."
