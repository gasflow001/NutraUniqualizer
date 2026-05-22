@echo off
REM ================================================================
REM  Nutra Creative Uniqualizer — ОБЫЧНЫЙ ЗАПУСК
REM  Запускать когда setup.bat уже отработал и всё настроено.
REM  Поднимает: Chrome с тем же профилем + backend + frontend
REM  в трёх отдельных окнах.
REM ================================================================
setlocal enabledelayedexpansion
cd /d %~dp0
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

REM ---------- Sanity checks ----------
if not exist "%ROOT%\backend\.venv\Scripts\activate.bat" (
    echo [!] backend\.venv not found. Run setup.bat first.
    pause
    exit /b 1
)
if not exist "%ROOT%\frontend\node_modules" (
    echo [!] frontend\node_modules not found. Run setup.bat first.
    pause
    exit /b 1
)

REM ---------- Chrome ----------
set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_EXE%" set "CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
set "CHROME_PROFILE=%USERPROFILE%\.chrome-nutra-flow"
set "CDP_PORT=9224"
if not exist "%CHROME_PROFILE%" mkdir "%CHROME_PROFILE%"

if exist "%CHROME_EXE%" (
    echo === Launching Flow Chrome ^(profile: %CHROME_PROFILE%, CDP :%CDP_PORT%^) ===
    start "" "%CHROME_EXE%" ^
        --user-data-dir="%CHROME_PROFILE%" ^
        --remote-debugging-port=%CDP_PORT% ^
        --no-first-run ^
        --no-default-browser-check ^
        https://labs.google/fx/tools/flow
) else (
    echo [!] Chrome not found. Launch it manually with --user-data-dir="%CHROME_PROFILE%" --remote-debugging-port=%CDP_PORT%
)

REM ---------- Detect free backend port ----------
REM  Windows иногда держит «zombie listener» на :8000 после kill (PID stale в TCP-таблице).
REM  Тогда uvicorn падает на bind. Авто-fallback на 8001.
set "BACKEND_PORT=8000"
netstat -ano -p TCP | findstr /R /C:":8000 .*LISTENING" >nul
if not errorlevel 1 (
    echo [!] Port 8000 busy — falling back to 8001 ^(zombie listener^?^)
    set "BACKEND_PORT=8001"
)

REM ---------- Backend в отдельном окне ----------
REM  ВАЖНО: в `set NAME=value && next` пробел ПЕРЕД && попадает в значение
REM  переменной (классическая Windows-bat ловушка). Поэтому используем
REM  `set NAME=value&& next` БЕЗ пробела до &&.
echo === Launching backend on :%BACKEND_PORT% ===
start "nutra-backend" /D "%ROOT%\backend" cmd /k "set PYTHONUNBUFFERED=1&& set PORT=%BACKEND_PORT%&& .venv\Scripts\activate.bat && python main.py"

REM ---------- Frontend в отдельном окне ----------
echo === Launching frontend on :5173 ===
start "nutra-frontend" /D "%ROOT%\frontend" cmd /k "set BACKEND_URL=http://127.0.0.1:%BACKEND_PORT%&& set VITE_BACKEND_PORT=%BACKEND_PORT%&& npm run dev"

echo.
echo ================================================================
echo  Chrome:   https://labs.google/fx/tools/flow
echo            ^(profile %CHROME_PROFILE%, port %CDP_PORT%^)
echo  Backend:  http://localhost:%BACKEND_PORT%/api/health
echo  Frontend: http://localhost:5173
echo  LAN:      http://^<your-lan-ip^>:5173
echo ================================================================
echo.
echo Закрой это окно когда захочешь — серверы крутятся в своих окнах.
echo Чтобы остановить — закрой окна "nutra-backend" и "nutra-frontend".
echo.
echo Если порт 8000 не освобождается ^(zombie^), перезагрузи Windows или выполни
echo от админа: netsh int ip reset, потом netsh winsock reset.
endlocal
