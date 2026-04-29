# Gridge Billing Fill Helper — Windows Installer

> Chrome / Edge 에 Gridge Billing Fill Helper 확장을 **한 번의 실행으로 자동 설치**하는 Windows 인스톨러.
>
> Chrome Enterprise Policy (`ExtensionInstallForcelist`) 메커니즘 사용 → 관리자 권한 1회로 Gridge 계약 고객 전 직원 PC 배포 가능.

## 동작 원리

```
gridge-billing-helper-setup.exe
  ↓ 더블클릭 + UAC 수락
[Inno Setup Wizard]
  ↓ Chrome / Edge 체크박스
[설치 단계]
  1. Files copy → C:\Program Files\Gridge\BillingHelper\
       - gridge-billing-helper.crx (서명된 Extension 패키지)
       - update.xml (update manifest)
       - scripts\install-policy.ps1
  2. install-policy.ps1 자동 실행 (관리자 권한)
       → HKLM\Software\Policies\Google\Chrome\ExtensionInstallForcelist
         "1" = "{ExtensionId};file:///C:/Program Files/Gridge/BillingHelper/update.xml"
  3. Edge 선택 시 Microsoft\Edge 경로에도 동일 등록
[Chrome/Edge 재시작]
  → Chromium 이 정책 읽음 → update.xml 에서 crx 위치 확인 → 자동 설치
  → "귀하의 조직에서 관리합니다" 표시 (제거 불가, 정책 강제)
```

## 빌드 방법

### 사전 준비 (1회)

1. **Windows / WSL 환경** (macOS/Linux 는 .exe 생성 불가)
2. **Node.js 20+** + **npm**
3. **Inno Setup 6** — https://jrsoftware.org/isdl.php (무료)
4. **Extension 서명 키** — `extension/key.pem` (최초 1회 생성, 1Password 에 백업)

### 빌드 (Windows PowerShell)

```powershell
cd installer
.\build.ps1
```

옵션:
```powershell
.\build.ps1 -InnoSetupPath "D:\Tools\InnoSetup6\ISCC.exe"
```

### 빌드 (WSL / macOS)

```bash
cd installer
./build.sh
# Windows Inno Setup 호출 필요 (WSL 에서 /mnt/c/.../ISCC.exe)
ISCC_PATH='/mnt/c/Program Files (x86)/Inno Setup 6/ISCC.exe' ./build.sh
```

비-Windows 환경에서는 CRX 패키징까지만 수행하고 .exe 는 생성되지 않음.

### 빌드 산출물

```
installer/output/GridgeBillingHelperSetup-0.1.0.exe    ← 배포 대상
extension/artifacts/gridge-billing-helper.crx         ← crx 자체
extension/artifacts/extension-id.txt                  ← ID (update.xml/정책 등록에 사용)
```

## Extension 서명 키 관리 (CRITICAL)

`extension/key.pem` 은 **Extension ID 를 결정짓는 RSA private key**.

- **한 번 생성 후 절대 분실·교체 금지**.
- 교체 시 기존 사용자의 Chrome 은 새 확장을 "다른 프로그램" 으로 인식 → 자동 업데이트 실패.
- 저장 위치:
  - 로컬: `extension/key.pem` (gitignored, 600 권한)
  - 백업: 1Password 팀 vault "Gridge Extension Signing Key"
  - CI: GitHub Actions Secret `EXTENSION_SIGNING_KEY` (base64 encoded)

### 최초 생성

```bash
cd extension
node scripts/generate-key.mjs
# → extension/key.pem 생성 (600)
# → 즉시 1Password 에 업로드
```

## 사용자 배포 시나리오

### Alpha 고객 배포 (Phase 0)

1. Gridge 측 담당자(Luna)가 `GridgeBillingHelperSetup-0.1.0.exe` 를 Slack Connect / 이메일로 전달
2. 고객 IT 담당자 또는 Owner 가 관리자 권한으로 실행
3. Chrome/Edge 체크박스 선택 → 설치
4. 재시작 후 확장 동작 확인

### 대규모 배포 (Phase 1+)

Windows GPO (Group Policy Object) 또는 Intune 으로 .exe 조용한 설치:

```
GridgeBillingHelperSetup-0.1.0.exe /SILENT /TASKS="installForChrome,installForEdge"
```

Inno Setup 표준 옵션:
- `/SILENT` — UI 없이 백그라운드 설치 (UAC 프롬프트만)
- `/VERYSILENT` — UAC도 생략 (사전 권한 상승 필요)
- `/TASKS="..."` — 체크박스 자동 선택
- `/LOG="C:\install.log"` — 설치 로그
- `/DIR="C:\CustomPath"` — 설치 경로

## 제거

### 사용자 제거

Windows 설정 → 앱 → "Gridge Billing Fill Helper" → 제거 →
- `uninstall-policy.ps1` 자동 실행 → HKLM 레지스트리 항목 정리
- Chrome 재시작 시 확장 자동 언로드

### 강제 수동 제거

```powershell
# HKLM 항목 제거
.\uninstall-policy.ps1 -Target Chrome -ExtensionId "abcdefghijklmnopabcdefghijklmnop"
.\uninstall-policy.ps1 -Target Edge   -ExtensionId "abcdefghijklmnopabcdefghijklmnop"

# 파일 제거
Remove-Item "C:\Program Files\Gridge\BillingHelper\" -Recurse -Force
```

## 한계와 리스크

### Chromium "Managed by your organization" 배지

Forcelist 정책으로 설치된 확장은 **브라우저에 정책 관리 배지가 표시됨**:
- Chrome: `chrome://management`
- Edge: `edge://management`

이는 일부 사용자에게 심리적 저항 요인. 계약 단계에서 **사전 고지 필수**.

### Chrome Web Store 대비

| 항목 | Forcelist (현재) | Chrome Web Store |
|---|---|---|
| 배포 | exe 수동/GPO | 링크 1개 |
| 자동 업데이트 | self-hosted update.xml 필요 | Google 자동 |
| 심사 | 없음 | Google 심사 (며칠) |
| 제거 가능 | 관리자만 (정책 강제) | 사용자 자유 |
| "조직 관리" 배지 | 표시됨 | 표시 안 됨 |
| 커스텀 URL 매칭 | 자유 | 정책 일치 필요 |

**Phase 2 권장**: Chrome Web Store 비공개(unlisted) 게시 + 초대 링크만 고객사에 공유.

### SmartScreen 경고

서명되지 않은 .exe 는 Windows SmartScreen 경고 ("이 앱을 실행하면 PC가 위험할 수 있습니다") 표시.

- **EV Code Signing Certificate** 구매 (연 $300~500, 예: DigiCert, Sectigo) → 경고 즉시 제거
- **일반 Code Signing** → 경고는 있되 "자세히" 버튼으로 실행 가능

Alpha 단계는 Luna 가 사전 설명으로 해결, Phase 1+ EV 인증 구매 권장.

### 보안 감사

- HKLM 쓰기 = 관리자 권한 필요 = UAC 프롬프트
- 정책 등록 후 Chrome/Edge 관리자도 모르게 제거 불가 (정책 우선순위)
- 감사 필요 기업: **`/SILENT` 옵션 금지**, Gridge IT 담당자가 함께 입회

## Phase 1 로드맵

- [ ] EV Code Signing 인증서 구매 + .exe 서명
- [ ] GitHub Actions 에 빌드 파이프라인 (push tag v*.*.* → 자동 .exe 업로드)
- [ ] Chrome Web Store 비공개 게시 (병행) — 일반 고객은 Store 링크, 대기업은 .exe
- [ ] Intune/SCCM 자동 배포 템플릿
- [ ] `update.xml` 자체 서버 호스팅 (extensions.gridge.ai)

## 디렉토리 구조

```
installer/
├── gridge-billing-helper.iss    ← Inno Setup 스크립트
├── build.ps1                    ← Windows 빌드
├── build.sh                     ← WSL / macOS 빌드
├── LICENSE.txt                  ← 라이선스 (설치 중 표시)
├── README.txt                   ← 사용자 안내 (postinstall)
├── README.md                    ← 이 파일
├── assets/
│   ├── icon.ico                 ← 인스톨러 아이콘
│   └── update.xml               ← Chrome update manifest
├── scripts/
│   ├── install-policy.ps1       ← HKLM 등록
│   └── uninstall-policy.ps1     ← HKLM 제거
└── output/                      ← 빌드 산출물 (.exe)
```

## 문의

- 엔지니어링: `engineering@gridge.ai`
- Alpha 배포 지원: Luna (`luna@gridge.ai`)
