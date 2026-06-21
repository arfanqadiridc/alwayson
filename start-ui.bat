@echo off
echo ==============================================
echo  AlwaysOn UI — Static PWA Server
echo  (Service Worker enabled — works offline!)
echo ==============================================
echo.

cd /d "%~dp0alwayson-ui"

echo [1/2] Building Angular PWA (production + service worker)...
call npx ng build --configuration production
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Angular build failed!
    pause
    exit /b 1
)

echo.
echo [2/2] Serving on http://localhost:4200 ...
echo        Service worker will cache the app after first load.
echo        You can close and reopen this server — the app will
echo        still load from the browser cache!
echo.
echo        Press Ctrl+C to stop.
echo.

:: npx serve is a zero-config static server that supports SPA routing
npx serve dist/alwayson-ui/browser -l 4200 --single
pause
