@echo off
REM ================================================================
REM  Nutra Uniqualizer — Prepare Clean Distribution
REM  Creates a clean ZIP without personal data (API keys, DB, 
REM  storage, Chrome profile, venv, node_modules).
REM ================================================================
setlocal enabledelayedexpansion
cd /d %~dp0
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "DIST_DIR=%ROOT%\dist-clean"
set "PROJECT_NAME=NutraUniqualizer"

echo === Preparing clean distribution ===
echo.

REM ---------- Remove old dist if exists ----------
if exist "%DIST_DIR%" (
    echo Removing old dist folder...
    rmdir /s /q "%DIST_DIR%"
)
mkdir "%DIST_DIR%\%PROJECT_NAME%"

echo Copying project files...

REM ---------- Copy root files ----------
copy "%ROOT%\setup.bat" "%DIST_DIR%\%PROJECT_NAME%\" >nul
copy "%ROOT%\start.bat" "%DIST_DIR%\%PROJECT_NAME%\" >nul
copy "%ROOT%\.gitignore" "%DIST_DIR%\%PROJECT_NAME%\" >nul
copy "%ROOT%\SETUP_GUIDE.md" "%DIST_DIR%\%PROJECT_NAME%\" >nul
if exist "%ROOT%\README.md" copy "%ROOT%\README.md" "%DIST_DIR%\%PROJECT_NAME%\" >nul

REM ---------- Copy backend (without sensitive data) ----------
echo Copying backend...
xcopy "%ROOT%\backend" "%DIST_DIR%\%PROJECT_NAME%\backend\" /E /I /Q /EXCLUDE:%~f0.exclude >nul 2>&1

REM Create exclude list
(
    echo .venv\
    echo __pycache__\
    echo .env
    echo nutra.db
    echo storage\uploads\
    echo storage\outputs\
    echo storage\final\
    echo storage\products\
    echo storage\design_refs\
) > "%DIST_DIR%\_exclude.txt"

REM Re-copy with exclusions
rmdir /s /q "%DIST_DIR%\%PROJECT_NAME%\backend" 2>nul
mkdir "%DIST_DIR%\%PROJECT_NAME%\backend"

REM Copy backend files manually (xcopy exclude is unreliable)
for %%F in (config.py db.py deps.py main.py requirements.txt start.bat start.sh .env.example) do (
    if exist "%ROOT%\backend\%%F" copy "%ROOT%\backend\%%F" "%DIST_DIR%\%PROJECT_NAME%\backend\" >nul
)

REM Copy backend subdirectories (without excluded)
for %%D in (prompts routers services) do (
    if exist "%ROOT%\backend\%%D" (
        xcopy "%ROOT%\backend\%%D" "%DIST_DIR%\%PROJECT_NAME%\backend\%%D\" /E /I /Q >nul
    )
)

REM Create empty storage and data dirs with .gitkeep
for %%D in (storage data) do (
    mkdir "%DIST_DIR%\%PROJECT_NAME%\backend\%%D" 2>nul
    echo. > "%DIST_DIR%\%PROJECT_NAME%\backend\%%D\.gitkeep"
)

REM ---------- Copy frontend (without node_modules/dist) ----------
echo Copying frontend...
mkdir "%DIST_DIR%\%PROJECT_NAME%\frontend"

REM Copy root frontend files
for %%F in (package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html eslint.config.js) do (
    if exist "%ROOT%\frontend\%%F" copy "%ROOT%\frontend\%%F" "%DIST_DIR%\%PROJECT_NAME%\frontend\" >nul
)

REM Copy frontend source
if exist "%ROOT%\frontend\src" (
    xcopy "%ROOT%\frontend\src" "%DIST_DIR%\%PROJECT_NAME%\frontend\src\" /E /I /Q >nul
)
if exist "%ROOT%\frontend\public" (
    xcopy "%ROOT%\frontend\public" "%DIST_DIR%\%PROJECT_NAME%\frontend\public\" /E /I /Q >nul
)

REM ---------- Clean up ----------
del "%DIST_DIR%\_exclude.txt" 2>nul

REM ---------- Verify no .env leaked ----------
for /r "%DIST_DIR%" %%F in (.env) do (
    if /i "%%~nxF"==".env" (
        echo [!] WARNING: Found .env file at %%F — REMOVING
        del "%%F"
    )
)

echo.
echo ================================================================
echo  Clean distribution ready at:
echo  %DIST_DIR%\%PROJECT_NAME%\
echo.
echo  Verify NO personal data:
echo   [x] No .env file (only .env.example)
echo   [x] No nutra.db database
echo   [x] No storage/ content (uploads, outputs, etc.)
echo   [x] No .venv/ or node_modules/
echo   [x] No Chrome profile data
echo.
echo  To create ZIP: right-click the folder ^> Send to ^> Compressed
echo  Or use: powershell Compress-Archive ...
echo ================================================================
echo.
pause
endlocal
