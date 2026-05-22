@echo off
REM Nutra Creative Uniqualizer — backend startup
cd /d %~dp0

if not exist ".venv" (
    echo Creating virtualenv...
    python -m venv .venv
)

call .venv\Scripts\activate.bat

echo Installing python deps...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

echo Installing playwright chromium runtime...
python -m playwright install chromium

if not exist ".env" (
    copy .env.example .env
    echo Created .env from .env.example - please fill in credentials.
)

echo Starting backend (python main.py)...
python main.py
