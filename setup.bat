@echo off
REM ================================================================
REM  Nutra Creative Uniqualizer — ПЕРВИЧНАЯ УСТАНОВКА
REM  Запускать один раз, когда ничего ещё не настроено.
REM  Делает: открывает Chrome с целевым профилем (чтобы юзер
REM  залогинился и прогрел сессию), ставит python-зависимости,
REM  playwright chromium, npm-зависимости фронта.
REM ================================================================
setlocal enabledelayedexpansion
cd /d %~dp0
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

REM ---------- Поиск python ----------
where python >nul 2>&1
if errorlevel 1 (
    echo [!] python.exe not found in PATH. Install Python 3.11+ and reopen this window.
    pause
    exit /b 1
)

REM ---------- Поиск Chrome ----------
set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_EXE%" set "CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
set "CHROME_PROFILE=%USERPROFILE%\.chrome-nutra-flow"
set "CDP_PORT=9224"
if not exist "%CHROME_PROFILE%" mkdir "%CHROME_PROFILE%"

REM ---------- 1. Chrome для прогрева сессии ----------
if exist "%CHROME_EXE%" (
    echo === Step 1/4: Starting Flow Chrome ^(profile: %CHROME_PROFILE%, CDP :%CDP_PORT%^) ===
    start "" "%CHROME_EXE%" ^
        --user-data-dir="%CHROME_PROFILE%" ^
        --remote-debugging-port=%CDP_PORT% ^
        --no-first-run ^
        --no-default-browser-check ^
        https://labs.google/fx/tools/flow
    echo Chrome launched. Sign in to Google AI Pro/Ultra and use Flow manually for 5-10 min to warm up.
) else (
    echo [!] Chrome not found at default paths. Install Chrome or set CHROME_PATH manually.
)

REM ---------- 2. Backend venv + deps ----------
echo.
echo === Step 2/4: Backend venv + deps ===
cd /d "%ROOT%\backend"
if not exist ".venv" (
    echo Creating virtualenv...
    python -m venv .venv
    if errorlevel 1 (
        echo [!] python -m venv failed.
        pause
        exit /b 1
    )
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo [!] pip install failed.
    pause
    exit /b 1
)

REM ---------- 3. Playwright chromium ----------
echo.
echo === Step 3/4: Playwright chromium runtime ===
python -m playwright install chromium
if errorlevel 1 (
    echo [!] playwright install failed.
    pause
    exit /b 1
)

if not exist ".env" (
    copy .env.example .env
    echo Created backend\.env from .env.example - fill in GEMINI_API_KEY and FLOW_PROJECT_ID.
)

REM ---------- 4. Frontend npm install ----------
echo.
echo === Step 4/4: Frontend npm install ===
cd /d "%ROOT%\frontend"
where npm >nul 2>&1
if errorlevel 1 (
    echo [!] npm not found in PATH. Install Node.js 20+ and rerun this script.
    pause
    exit /b 1
)
call npm install
if errorlevel 1 (
    echo [!] npm install failed.
    pause
    exit /b 1
)

cd /d "%ROOT%"
echo.
echo ================================================================
echo  Setup complete.
echo.
echo  Next steps:
echo   1. В открытом Chrome — залогинься в Google AI Pro/Ultra,
echo      зайди в Flow, поработай 5-10 минут как обычный юзер
echo      (генерь, листай, кликай) — это прогрев сессии.
echo   2. Заполни backend\.env  (GEMINI_API_KEY, FLOW_PROJECT_ID).
echo   3. Запусти start.bat — он поднимет backend + frontend и Chrome.
echo ================================================================
pause
endlocal
