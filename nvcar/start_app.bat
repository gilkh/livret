@echo off
echo Starting NVCAR Application...

:: Start Server
start "NVCAR Server" cmd /k "cd server && npm run dev"

:: Wait a moment for server to initialize
timeout /t 5

:: Start Client
start "NVCAR Client" cmd /k "cd client && npm run dev"

:: Open Browser
timeout /t 3
start http://localhost:5173

echo Application started!
