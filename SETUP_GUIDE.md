# 🛠️ Nutra Uniqualizer — Setup Guide

Complete guide for setting up and running the app from scratch on a new Windows machine.

---

## 📋 Prerequisites

Before starting, make sure you have:

| Requirement | Version | Download |
|---|---|---|
| **Windows** | 10/11 | — |
| **Google Chrome** | Latest | [chrome.google.com](https://www.google.com/chrome/) |
| **Python** | 3.10+ | [python.org/downloads](https://www.python.org/downloads/) |
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org/) |
| **Google Account** | With AI Pro/Ultra subscription | [one.google.com](https://one.google.com/) |
| **Gemini API Key** | Free tier works | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

> ⚠️ **Important**: During Python installation, check ✅ **"Add Python to PATH"**!

---

## 📦 Step 1: Download the Project

1. Download the ZIP archive and extract it to any folder, for example:
   ```
   C:\NutraUniqualizer\
   ```

Your folder should look like this:
```
NutraUniqualizer/
├── backend/
├── frontend/
├── setup.bat
├── start.bat
├── SETUP_GUIDE.md  (this file)
└── ...
```

---

## ⚙️ Step 2: Run Initial Setup

1. **Double-click `setup.bat`**
2. It will automatically:
   - Open Chrome with a special profile (for Flow API)
   - Create Python virtual environment + install dependencies
   - Install Playwright Chromium
   - Install frontend npm packages
   - Create `backend/.env` from template

> This takes **3-5 minutes** depending on internet speed.

---

## 🔑 Step 3: Get Your API Keys

### 3.1 Gemini API Key

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Click **"Create API Key"**
3. Copy the key (starts with `AIza...`)

### 3.2 Flow Project ID

1. In the Chrome window that opened in Step 2, go to [labs.google/fx/tools/flow](https://labs.google/fx/tools/flow)
2. **Sign in** with your Google account (must have AI Pro or Ultra subscription)
3. Create a new project (or open an existing one)
4. Look at the URL — it looks like:
   ```
   https://labs.google/fx/tools/flow/project/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
5. Copy the UUID after `/project/` — that's your `FLOW_PROJECT_ID`

---

## 📝 Step 4: Configure Environment

1. Open `backend/.env` in any text editor (Notepad works fine)
2. Fill in your keys:

```env
# ============ Gemini API ============
GEMINI_API_KEY=AIzaSy...your_key_here...
GEMINI_TEXT_MODEL=gemini-2.5-flash

# Proxy for Gemini API (otherwise 403).
# Format: http://user:pass@host:port or leave empty if not needed.
GEMINI_PROXY=

# ============ Google Flow ============
# UUID from the Flow project URL
FLOW_PROJECT_ID=your-uuid-here

# ============ Chrome ============
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
CHROME_CDP_PORT=9224
CHROME_FLOW_PROFILE_DIR=~/.chrome-nutra-flow

# ============ Parallelism ============
FLOW_API_SEMAPHORE=5
FLOW_CHROME_COUNT=1

# ============ Web server ============
HOST=0.0.0.0
PORT=8000
STORAGE_PATH=./storage
DB_PATH=./data/nutra.db
```

> 💡 **Only `GEMINI_API_KEY` and `FLOW_PROJECT_ID` are required.** Everything else has sensible defaults.

---

## 🔥 Step 5: Warm Up the Chrome Session

This is **critical** for Flow API to work:

1. In the Chrome that opened in Step 2 (the one with the special profile):
   - Make sure you're **signed in to Google**
   - Go to [labs.google/fx/tools/flow](https://labs.google/fx/tools/flow)
   - Create a test project
   - **Generate 2-3 images manually** (any prompt, e.g. "a cat")
   - Click around, scroll, interact normally for **5-10 minutes**

> This "warms up" the session — Google needs to see real user activity before the automated token extraction works reliably.

2. **Don't close this Chrome window** — keep it running in the background.

---

## 🚀 Step 6: Launch the App

1. **Double-click `start.bat`**
2. Three windows will open:
   - **Chrome** — Flow session (keep running, don't interact)
   - **Backend** — Python server (you'll see logs here)
   - **Frontend** — Vite dev server

3. Open your **regular browser** (not the Flow Chrome!) and go to:
   ```
   http://localhost:5173
   ```

4. You should see the **Nutra Uniqualizer** interface 🎉

---

## 🎯 How to Use

### Workflow (6 steps):

| Step | What to do |
|---|---|
| **1. Text** | Drop a competitor's Facebook ad → AI extracts all text (headline, benefits, CTA, badges) |
| **2. Layout** | Auto-analyze composition or manually adjust zone positions |
| **3. Product** | Upload your product photo (bottle, box, etc.) |
| **4. Design** | Upload a design reference → AI analyzes style, mood, colors |
| **5. Generate** | AI generates 3 unique creatives. Regenerate or edit individually |
| **6. Export** | Download final images individually or as ZIP |

### Tips:
- In Step 1 and Step 4, you can **write in Russian** and press 🔄 to auto-translate
- In Step 1, use **"+ добавить"** to add more headlines, CTAs, etc.
- In Step 5, click ♻️ to regenerate a single variant
- In **History** tab, all completed projects are saved with full context

---

## ❗ Troubleshooting

### "503 UNAVAILABLE" errors
Gemini API is overloaded. The app **auto-retries** (up to 3 times with backoff). If it persists, wait a few minutes.

### "Token extraction failed"
The Flow Chrome session expired. Solution:
1. Go to the Flow Chrome window
2. Refresh the Flow page
3. Generate 1-2 images manually
4. Try again in the app

### Port 8000 is busy
Another process is using port 8000. The app auto-falls back to 8001. If the frontend can't connect, restart everything.

### "python not found"
Python is not in PATH. Reinstall Python and check ✅ **"Add Python to PATH"** during installation.

### Chrome not found
If Chrome is installed in a non-standard location, edit `CHROME_PATH` in `backend/.env`.

---

## 🔒 Security Notes

- Your `backend/.env` contains your API key — **never share this file**
- The Chrome profile (`~/.chrome-nutra-flow`) contains your Google session cookies — **never share this folder**
- The `backend/data/nutra.db` database and `backend/storage/` folder contain your generated creatives
- When sharing the project, always use the clean version (without `.env`, `data/`, `storage/`, `.chrome-nutra-flow/`)

---

## 🔄 Updating

When you receive an updated version:
1. **Backup** your `backend/.env` file
2. Replace all files except:
   - `backend/.env` (your config)
   - `backend/data/nutra.db` (your history)
   - `backend/storage/` (your images)
3. Run `setup.bat` again to update dependencies
4. Run `start.bat` to launch

---

## 📊 System Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| RAM | 4 GB | 8 GB+ |
| Disk | 500 MB + generated images | 2 GB+ |
| Internet | Required (API calls) | Stable connection |
| Google Account | AI Pro ($20/mo) | AI Ultra (higher limits) |
