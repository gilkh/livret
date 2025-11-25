@echo off
echo Starting NVCAR Application...
echo.

:: Kill any existing processes on port 4000 (Server)
echo Checking for processes on port 4000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do (
    echo Killing process %%a on port 4000
    taskkill /F /PID %%a >nul 2>&1
)

:: Kill any existing processes on port 5173 (Client)
echo Checking for processes on port 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    echo Killing process %%a on port 5173
    taskkill /F /PID %%a >nul 2>&1
)

:: Kill any existing processes on port 5174 (Alternative Client Port)
echo Checking for processes on port 5174...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174 ^| findstr LISTENING') do (
    echo Killing process %%a on port 5174
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo Ports cleared. Starting servers...
echo.

:: Start Server
start "NVCAR Server" cmd /k "cd server && npm run dev"

:: Wait a moment for server to initialize
timeout /t 5 /nobreak

:: Start Client
start "NVCAR Client" cmd /k "cd client && npm run dev -- --host"

:: Open Browser
timeout /t 3 /nobreak
start http://localhost:5173

echo.
echo Detecting network addresses...
for /f %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }).IPAddress"') do (
  echo Server shared: http://%%i:4000
  echo Client shared: http://%%i:5173
)
echo If devices on your LAN cannot connect, allow Node/Vite through Windows Firewall.

echo.
echo Application started!
echo Close this window to keep servers running, or close the server windows to stop them.
pause
