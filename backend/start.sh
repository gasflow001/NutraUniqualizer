#!/usr/bin/env bash
# Nutra Creative Uniqualizer — backend startup
set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Creating virtualenv..."
    python3 -m venv .venv
fi

source .venv/bin/activate

echo "Installing python deps..."
pip install --upgrade pip
pip install -r requirements.txt

echo "Installing playwright chromium runtime..."
python -m playwright install chromium

if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "Created .env from .env.example - please fill in credentials."
fi

echo "Starting backend (python main.py)..."
python main.py
