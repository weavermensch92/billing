; ========================================================================
;  Gridge Billing Fill Helper — Windows Installer (Inno Setup 6)
;  빌드: ISCC.exe gridge-billing-helper.iss
;  출력: installer/output/GridgeBillingHelperSetup-{version}.exe
; ========================================================================

#define MyAppName        "Gridge Billing Fill Helper"
#define MyAppVersion     "0.1.0"
#define MyAppPublisher   "SoftSquared Inc. (Gridge)"
#define MyAppURL         "https://app.gridge.ai"
#define MyAppExeName     "GridgeBillingHelperSetup.exe"
#define ExtensionId      "PLACEHOLDER_EXTENSION_ID_32CHARS"

[Setup]
AppId={{A8F3E5D1-9C7B-4E6A-B0F2-1D5A8C3E9B4F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/support
AppUpdatesURL={#MyAppURL}/downloads
DefaultDirName={autopf}\Gridge\BillingHelper
DefaultGroupName=Gridge Billing Helper
AllowNoIcons=yes
LicenseFile=.\LICENSE.txt
OutputDir=.\output
OutputBaseFilename=GridgeBillingHelperSetup-{#MyAppVersion}
SetupIconFile=.\assets\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\assets\icon.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "korean";  MessagesFile: "compiler:Languages\Korean.isl"

[Tasks]
Name: "installForChrome"; Description: "Google Chrome에 자동 설치 (권장)"; GroupDescription: "대상 브라우저:"; Flags: checkedonce
Name: "installForEdge";   Description: "Microsoft Edge에 자동 설치"; GroupDescription: "대상 브라우저:"

[Files]
Source: "..\extension\artifacts\gridge-billing-helper.crx"; DestDir: "{app}"; Flags: ignoreversion
Source: ".\assets\update.xml";    DestDir: "{app}";        Flags: ignoreversion
Source: ".\assets\icon.ico";      DestDir: "{app}\assets"; Flags: ignoreversion
Source: ".\scripts\install-policy.ps1";   DestDir: "{app}\scripts"; Flags: ignoreversion
Source: ".\scripts\uninstall-policy.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: ".\LICENSE.txt";          DestDir: "{app}";        Flags: ignoreversion
Source: ".\README.txt";           DestDir: "{app}";        Flags: ignoreversion isreadme

[Icons]
Name: "{group}\Gridge 포털 열기"; Filename: "{#MyAppURL}"; IconFilename: "{app}\assets\icon.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

[Run]
; Chrome 선택 시 레지스트리 등록
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\install-policy.ps1"" -Target Chrome -ExtensionId ""{#ExtensionId}"" -UpdateUrl ""file:///{app}\update.xml"""; \
  StatusMsg: "Chrome 정책 등록 중..."; \
  Flags: runhidden waituntilterminated; \
  Tasks: installForChrome

; Edge 선택 시
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\install-policy.ps1"" -Target Edge -ExtensionId ""{#ExtensionId}"" -UpdateUrl ""file:///{app}\update.xml"""; \
  StatusMsg: "Edge 정책 등록 중..."; \
  Flags: runhidden waituntilterminated; \
  Tasks: installForEdge

; 완료 후 안내 페이지 (README)
Filename: "{app}\README.txt"; \
  Description: "설치 완료 안내 보기"; \
  Flags: postinstall shellexec skipifsilent

[UninstallRun]
; 제거 시 레지스트리 정리
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\uninstall-policy.ps1"" -Target Chrome -ExtensionId ""{#ExtensionId}"""; \
  Flags: runhidden waituntilterminated; \
  RunOnceId: "RemoveChromePolicy"

Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\uninstall-policy.ps1"" -Target Edge -ExtensionId ""{#ExtensionId}"""; \
  Flags: runhidden waituntilterminated; \
  RunOnceId: "RemoveEdgePolicy"

[Messages]
korean.WelcomeLabel2=%n%nGridge Billing MSP 의 AI 서비스 결제 페이지 자동화 확장을 설치합니다.%n%n설치 후 Chrome/Edge 를 재시작하면 자동으로 확장이 적용됩니다.
english.WelcomeLabel2=%n%nInstalls the Gridge Billing Fill Helper browser extension for AI service billing pages.%n%nRestart Chrome/Edge after installation to activate.

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
