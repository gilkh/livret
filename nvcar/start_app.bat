@echo off
echo ========================================
echo   Starting NVCAR Application...
echo ========================================
echo.

:: Kill any existing processes on port 4000 (Server)
echo [1/6] Checking for processes on port 4000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do (
    echo       Killing process %%a on port 4000
    taskkill /F /PID %%a >nul 2>&1
)

:: Kill any existing processes on port 5173 (Client)
echo [2/6] Checking for processes on port 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    echo       Killing process %%a on port 5173
    taskkill /F /PID %%a >nul 2>&1
)

:: Kill any existing processes on port 5174 (Alternative Client Port)
echo [3/6] Checking for processes on port 5174...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174 ^| findstr LISTENING') do (
    echo       Killing process %%a on port 5174
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo Ports cleared.
echo.

:: Start Server
echo [4/6] Starting backend server...
start "NVCAR Server" cmd /k "cd server && npm run dev"

:: Wait for server to be ready (health check loop)
echo.
echo [5/6] Waiting for server to be ready...
echo       (This may take up to 60 seconds for TypeScript compilation + MongoDB connection)
echo.

set MAX_ATTEMPTS=30
set ATTEMPT=0

:health_check_loop
set /a ATTEMPT+=1
if %ATTEMPT% gtr %MAX_ATTEMPTS% (
    echo.
    echo WARNING: Server did not respond within 60 seconds.
    echo          Starting client anyway, but you may see proxy errors.
    echo          Check the server window for errors.
    goto start_client
)

:: Wait 2 seconds between checks
timeout /t 2 /nobreak >nul

:: Check if server is responding using PowerShell
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri 'https://localhost:4000/settings/public' -UseBasicParsing -TimeoutSec 2 -SkipCertificateCheck; exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo       Server is ready! (took ~%ATTEMPT%x2 seconds)
    goto start_client
)

:: Show progress
echo       Attempt %ATTEMPT%/%MAX_ATTEMPTS% - Server not ready yet...
goto health_check_loop

:start_client
echo.
echo [6/6] Starting frontend client...
start "NVCAR Client" cmd /k "cd client && npm run dev -- --host"

:: Wait for client to initialize before opening browser
echo.
echo Waiting for client to initialize...
timeout /t 5 /nobreak >nul

:: Open Browser
start https://localhost:5173

echo.
echo ========================================
echo   Network Access Information
echo ========================================
for /f %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }).IPAddress"') do (
  echo   Server: https://%%i:4000
  echo   Client: https://%%i:5173
)
echo.
echo If devices on your LAN cannot connect, allow Node/Vite through Windows Firewall.

echo.
echo ========================================
echo   Application Started Successfully!
echo ========================================
echo.
echo Close this window to keep servers running.
echo Close the server/client windows to stop them.
echo.
pause
