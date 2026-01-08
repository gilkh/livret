@echo off
setlocal

:: Ensure we run from the directory of this script (nvcar\)
cd /d "%~dp0"

:: Basic sanity checks
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm not found in PATH. Please install Node.js and reopen your terminal.
    pause
    exit /b 1
)

if not exist "server\package.json" (
    echo ERROR: Could not find server\package.json. Make sure you are running this from the nvcar folder.
    pause
    exit /b 1
)

if not exist "client\package.json" (
    echo ERROR: Could not find client\package.json. Make sure you are running this from the nvcar folder.
    pause
    exit /b 1
)

echo ========================================
echo   Starting NVCAR Application...
echo ========================================
echo.

:: Kill ALL existing Node processes to ensure fresh code is loaded
echo [1/6] Killing any existing Node processes...
taskkill /F /IM node.exe >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo       Killed existing Node processes.
) else (
    echo       No existing Node processes found.
)

:: Also check specific ports as backup
echo [2/6] Checking for processes on ports 443, 4000 (server), 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :443 ^| findstr LISTENING') do (
    echo       Killing process %%a on port 443
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do (
    echo       Killing process %%a on port 4000
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    echo       Killing process %%a on port 5173
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo Ports cleared.
echo.

:: Start Server
echo [4/6] Starting backend server...
:: Ensure normal app is not started in sandbox mode (override any global env vars)
set SIMULATION_SANDBOX=
set SIMULATION_SANDBOX_MARKER=

:: Ensure normal app does not connect to a sandbox/test database by accident
if defined MONGODB_URI (
    echo %MONGODB_URI% | findstr /I "sandbox test" >nul
    if %ERRORLEVEL% equ 0 (
        echo WARNING: MONGODB_URI points to a sandbox/test DB. Clearing it for normal startup.
        set MONGODB_URI=
    )
)
if defined MONGO_URI (
    echo %MONGO_URI% | findstr /I "sandbox test" >nul
    if %ERRORLEVEL% equ 0 (
        echo WARNING: MONGO_URI points to a sandbox/test DB. Clearing it for normal startup.
        set MONGO_URI=
    )
)
if not exist "server\dist\index.js" (
    echo       Build not found: server\dist\index.js. Building backend once...
    pushd server
    call npm run build
    popd
)
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
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri 'https://localhost:443/settings/public' -UseBasicParsing -TimeoutSec 2 -SkipCertificateCheck; exit 0 } catch { exit 1 }" >nul 2>&1
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
:: Ensure normal UI uses the normal backend via Vite proxy (override any global env vars)
set VITE_API_URL=
start "NVCAR Client" cmd /k "cd client && npm run dev -- --host"

:: Wait for client to initialize before opening browser
echo.
echo Waiting for client to initialize...
timeout /t 5 /nobreak >nul

:: Open Browser
start https://localhost

echo.
echo ========================================
echo   Network Access Information
echo ========================================
for /f %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }).IPAddress"') do (
  echo   Server: https://%%i:443
  echo   Client: https://%%i
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
