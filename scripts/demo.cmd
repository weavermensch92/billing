@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Gridge Billing MSP - Demo Launcher

set "PROJECT_ROOT=%~dp0.."
set "BASE_URL=http://localhost:3000"

:menu
cls
echo.
echo  ========================================================
echo   Gridge Billing MSP  -  Demo Launcher (Mock Mode)
echo  ========================================================
echo.
echo   [ Server ]
echo    1. dev server start + 첫 브라우저 열기 (백그라운드)
echo    2. dev server stop (모든 node dev 종료)
echo    3. dev server status (포트 3000 확인)
echo.
echo   [ Customer Portal ]
echo    4. Alice (Owner)   - 전 기능
echo    5. Bob (Admin)     - 멤버/요청 관리
echo    6. Charlie (Member) - 본인 계정 조회
echo.
echo   [ Ops Console ]
echo    7. Luna (AM)       - 요청 처리/CSM
echo    8. Weber (Super)   - 조직 등록/VCN reveal
echo.
echo   [ Quick Paths ]
echo    9. Alice -> /billing          (청구서 3단계 breakdown)
echo   10. Alice -> /billing/creditback (6개월 진행바)
echo   11. Weber -> /console/orgs/new (신규 조직 등록)
echo   12. Weber -> /console/invoices  (Super 승인 대기)
echo   13. Luna  -> /console/requests  (요청 처리 큐)
echo.
echo    0. Exit
echo  ========================================================
set /p "choice=선택: "

if "%choice%"=="1"  goto server_start
if "%choice%"=="2"  goto server_stop
if "%choice%"=="3"  goto server_status
if "%choice%"=="4"  call :open_login "alice@acme.com"   "/home"             & goto menu
if "%choice%"=="5"  call :open_login "bob@acme.com"     "/services"         & goto menu
if "%choice%"=="6"  call :open_login "charlie@acme.com" "/services"         & goto menu
if "%choice%"=="7"  call :open_login "luna@gridge.ai"   "/console/home"     & goto menu
if "%choice%"=="8"  call :open_login "weber@gridge.ai"  "/console/home"     & goto menu
if "%choice%"=="9"  call :open_login "alice@acme.com"   "/billing"          & goto menu
if "%choice%"=="10" call :open_login "alice@acme.com"   "/billing/creditback" & goto menu
if "%choice%"=="11" call :open_login "weber@gridge.ai"  "/console/orgs/new" & goto menu
if "%choice%"=="12" call :open_login "weber@gridge.ai"  "/console/invoices" & goto menu
if "%choice%"=="13" call :open_login "luna@gridge.ai"   "/console/requests" & goto menu
if "%choice%"=="0"  goto end

echo.
echo  [!] 잘못된 선택입니다.
timeout /t 1 >nul
goto menu

:server_start
echo.
echo  [+] dev 서버를 시작합니다...
pushd "%PROJECT_ROOT%"
start "Gridge dev server" cmd /c "npm run dev"
popd
echo  [+] 서버 부팅 대기 (8초)...
timeout /t 8 >nul
echo  [+] 브라우저에서 로그인 화면 열기
start "" "%BASE_URL%/login"
timeout /t 2 >nul
goto menu

:server_stop
echo.
echo  [-] 모든 node.exe dev 서버를 종료합니다...
taskkill /F /IM node.exe >nul 2>&1
echo  [-] 완료.
timeout /t 1 >nul
goto menu

:server_status
echo.
netstat -ano | findstr /C:":3000 " | findstr /C:"LISTENING"
if errorlevel 1 (
  echo  [ ] 3000 포트 사용 안 됨 (서버 중지 상태)
) else (
  echo  [+] 3000 포트 LISTENING - 서버 가동 중
)
echo.
pause
goto menu

:open_login
set "email=%~1"
set "redirect=%~2"
echo.
echo  [+] %email% -> %redirect% 로그인
start "" "%BASE_URL%/api/dev-login?email=%email%&redirect=%redirect%"
timeout /t 1 >nul
exit /b

:end
echo.
echo  종료합니다.
timeout /t 1 >nul
endlocal
exit /b 0
