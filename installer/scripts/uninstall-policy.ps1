<#
.SYNOPSIS
  Gridge Billing Fill Helper 의 Chrome/Edge Forcelist 정책 항목 제거.

.PARAMETER Target
  "Chrome" 또는 "Edge".

.PARAMETER ExtensionId
  제거할 Extension ID.

.EXAMPLE
  .\uninstall-policy.ps1 -Target Chrome -ExtensionId "abcdefghijklmnopabcdefghijklmnop"
#>

param(
  [Parameter(Mandatory=$true)][ValidateSet('Chrome','Edge')][string]$Target,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId
)

$ErrorActionPreference = 'SilentlyContinue'

$policyRoot = if ($Target -eq 'Chrome') {
  'HKLM:\Software\Policies\Google\Chrome'
} else {
  'HKLM:\Software\Policies\Microsoft\Edge'
}
$forcelistPath = "$policyRoot\ExtensionInstallForcelist"

if (-not (Test-Path $forcelistPath)) {
  Write-Host "[i] $Target Forcelist 정책 없음. 제거할 항목 없음."
  exit 0
}

$item = Get-Item $forcelistPath
$removed = 0
foreach ($prop in $item.Property) {
  $val = $item.GetValue($prop)
  if ($val -like "$ExtensionId;*") {
    Remove-ItemProperty -Path $forcelistPath -Name $prop -Force
    Write-Host "[-] 제거: $prop = $val"
    $removed++
  }
}

# Forcelist 가 완전히 빈 경우에는 유지 (다른 정책이 쓸 수 있음)
Write-Host "[+] $Target 에서 $removed 개 정책 항목 제거"
Write-Host "[i] $Target 를 재시작하면 확장이 제거됩니다."
