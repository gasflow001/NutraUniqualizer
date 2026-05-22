# Nutra Creative Uniqualizer

Локальный веб-сервис для уникализации Facebook-креативов в вертикали nutra.
Полное ТЗ — в [CLAUDE.md](CLAUDE.md).

## Стек

- **Backend:** Python 3.11+, FastAPI, SQLite (aiosqlite), Playwright (CDP к системному Chrome), Pillow, NumPy
- **Frontend:** Vite + React 18 + TypeScript + Tailwind + zustand + react-router + react-dropzone
- **AI:** Gemini API `gemini-2.5-flash` (текст/vision) + Google Flow direct API `aisandbox-pa.googleapis.com` (картинки, через `GEM_PIX_2` / `GEM_PIX`)

## Структура

```
TrafficFlow/
├── backend/
│   ├── main.py              FastAPI + CORS + /storage static + lifespan init_db
│   ├── config.py            pydantic-settings из .env
│   ├── db.py                async SQLAlchemy + 6 моделей
│   ├── deps.py              FlowClient singleton + DI
│   ├── services/
│   │   ├── gemini_text.py   OCR + перевод + чат правок + product meta
│   │   ├── gemini_vision.py vision layout анализ
│   │   ├── flow_chrome.py   CDP bootstrap, persistent профиль
│   │   ├── flow_auth.py     simulate_human + recaptcha (site_key из страницы) + bearer
│   │   ├── flow_upload.py   uploadMedia + fallback на inlineData base64
│   │   ├── flow_client.py   generate / upsample / batchGenerateImages
│   │   ├── prompt_builder.py финальный промт из step1+2+3
│   │   └── antifraud.py     rotation + crop + jitter + noise (Pillow/Numpy)
│   ├── routers/
│   │   ├── projects.py      CRUD + history listing
│   │   ├── step1_text.py    parse + save + WS chat
│   │   ├── step2_layout.py  analyze (auto/manual)
│   │   ├── step3_product.py product upload + meta
│   │   ├── step4_generate.py generate N + WS progress + regenerate + edit
│   │   └── step5_export.py  finalize + download zip
│   ├── prompts/             5 шаблонов
│   ├── storage/             uploads / products / outputs / final (создаётся при старте)
│   ├── data/                nutra.db
│   ├── requirements.txt
│   ├── .env.example
│   └── start.bat / start.sh
├── frontend/
│   ├── src/
│   │   ├── App.tsx, main.tsx, index.css
│   │   ├── pages/           Wizard / History / Settings
│   │   ├── components/
│   │   │   ├── ImageDropzone.tsx, ChatPanel.tsx, ModelToggle.tsx, Toast.tsx
│   │   │   └── steps/       Step1..Step5 + Step2ManualEditor
│   │   ├── store/wizard.ts  zustand state
│   │   ├── api/client.ts    fetch + wsUrl
│   │   └── lib/cn.ts        tailwind-merge helper
│   ├── package.json
│   ├── vite.config.ts       /api и /storage проксируются на :8000
│   ├── tailwind.config.js, postcss.config.js
│   └── tsconfig.*.json
├── start.bat                one-click старт всего стека (Windows)
├── README.md
├── CLAUDE.md                полное ТЗ
└── .gitignore
```

## Быстрый старт (Windows)

Два скрипта в корне:

| Скрипт | Когда запускать |
|---|---|
| `setup.bat` | **Один раз** — при первой установке: ставит venv, python deps, playwright chromium, npm-зависимости, и открывает Chrome с целевым профилем для прогрева. |
| `start.bat` | **Каждый раз** при работе — поднимает Chrome + backend + frontend в трёх отдельных окнах. |

### Шаг 1. Первичная установка

1. Установи Python 3.11+, Node 20+, Chrome.
2. Двойной клик по **`setup.bat`** — он:
   - откроет Chrome с профилем `~/.chrome-nutra-flow` и debug-портом 9224 на `labs.google/fx/tools/flow`;
   - создаст backend venv, поставит python deps + playwright chromium;
   - подтянет npm-зависимости фронта;
   - создаст `backend/.env` из `.env.example`.
3. **В открывшемся Chrome:**
   - залогинься в Google аккаунт с AI Pro/Ultra;
   - открой Flow и **прогрей сессию руками 5-10 минут** — походи по UI, сгенери что-нибудь живым кликом. Это критично — без прогрева reCAPTCHA score будет низкий и API вернёт 403.
4. Заполни `backend/.env`:
   - `GEMINI_API_KEY` — ключ из [aistudio.google.com](https://aistudio.google.com);
   - `FLOW_PROJECT_ID` — UUID из URL `labs.google/fx/tools/flow/project/{...}`;
   - `CHROME_PATH` — путь до chrome.exe (по умолчанию `C:\Program Files\Google\Chrome\Application\chrome.exe`).

   Никаких cookies / recaptcha site_key / Google пароля **не нужно** — софт всё берёт из живого Chrome-профиля сам.

### Шаг 2. Обычный запуск

Двойной клик по **`start.bat`** — поднимает три окна:

- **Chrome** с тем же профилем `~/.chrome-nutra-flow` на :9224 → `labs.google/fx/tools/flow`
- **nutra-backend** — uvicorn на `:8000`
- **nutra-frontend** — vite dev на `:5173`

Открой `http://localhost:5173` (или с телефона в той же LAN — `http://<ip-пк>:5173`).

Чтобы остановить — закрой окна `nutra-backend` и `nutra-frontend`.

## Ручной запуск

**Backend:**
```cmd
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m playwright install chromium
copy .env.example .env
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**
```cmd
cd frontend
npm install
npm run dev
```

## Pipeline

1. **Шаг 1 — Текст**: дроп креатива → Gemini OCR + перевод в RU → редактирование сегментов → WS-чат правок.
2. **Шаг 2 — Композиция**: Auto (генератор сам компонует) или Manual (Gemini Vision выдаёт зоны → SVG drag-n-drop).
3. **Шаг 3 — Товар**: фото банки + crop → Gemini vision вытаскивает brand_name / package_type / dominant color.
4. **Шаг 4 — Генерация** ⭐:
   - подключается к уже запущенному Chrome через CDP :9224 (профиль `~/.chrome-nutra-flow`)
   - simulate_human_behavior + reCAPTCHA Enterprise v3 (site_key софт сам тянет со страницы) + bearer из `/fx/api/auth/session`
   - upload фото товара → UUID (с fallback на inlineData base64)
   - `flowMedia:batchGenerateImages` → URL картинки → upsample 2K
   - 1-10 вариантов параллельно (API semaphore = 5), WS прогресс
   - per-variant: чат правок + regenerate
5. **Шаг 5 — Антифрод**: Pillow rotation + crop + jitter + noise → PNG → ZIP-download.

## Статус реализации (21 пункт ТЗ)

- [x] **1. Скелет** — структура, FastAPI `/api/health`, Vite + Tailwind
- [x] **2. БД + storage** — 6 SQLAlchemy моделей
- [x] **3. Шаг 1 backend** — gemini_text + /step1/parse + промт
- [x] **4. Шаг 1 frontend** — Step1Text + ImageDropzone
- [x] **5. Шаг 1 чат** — WS /step1/chat + ChatPanel
- [x] **6. Шаг 2 backend** — gemini_vision + auto/manual ветка
- [x] **7. Шаг 2 frontend** — Auto/Manual toggle + SVG drag-n-drop editor
- [x] **8. Шаг 3** — upload товара + Gemini meta
- [x] **9. Шаг 4.1 FlowChrome** — CDP bootstrap к живому профилю
- [x] **10. Шаг 4.2 FlowAuth** — simulate_human + recaptcha (site_key из страницы) + bearer
- [x] **11. Шаг 4.3 FlowUpload** — endpoint + fallback inlineData (см. TODO ниже)
- [x] **12. Шаг 4.4 FlowClient** — generate + retry on 403
- [x] **13. Шаг 4.5 Upsample** — 2K через `flow/upsampleImage`
- [x] **14. Шаг 4.6 prompt_builder** — `final_generation.txt` с подстановками
- [x] **15. Шаг 4.7 N вариантов** — asyncio.gather + WS broadcast
- [x] **16. Шаг 4.8 frontend** — slider 1-10, model toggle, грид, прогресс
- [x] **17. Шаг 4.9 чат правок** — `/edit/{variant_id}` + inline UI
- [x] **18. Шаг 5** — antifraud + finalize + Step5Export + ZIP
- [x] **19. History + Settings** — список проектов, health-monitor, инструкции
- [x] **20. One-click start** — `start.bat` + README
- [x] **21. Полировка** — toasts, retry, dark mode, mobile UX

## Реверс Flow API (ключевые endpoints)

После анализа bundle JS + смоук-тестов установлено точно:

**1. Загрузка картинки → UUID**
```
POST https://aisandbox-pa.googleapis.com/v1/flow/uploadImage
Body: {clientContext, imageBytes: <base64>}
Response: {media: {name: "<UUID>", ...}}
```
Реализовано в [services/flow_upload.py](backend/services/flow_upload.py).

**2. Генерация креативов**
```
POST https://aisandbox-pa.googleapis.com/v1/projects/{FLOW_PROJECT_ID}/flowMedia:batchGenerateImages
Body: {clientContext, requests: [{
  clientContext, seed, imageModelName: "GEM_PIX_2", imageAspectRatio, prompt,
  imageInputs: [{imageInputType: "IMAGE_INPUT_TYPE_REFERENCE", name: <upload UUID>}]
}]}
Response: {media: [{image: {generatedImage: {fifeUrl, mediaId, ...}}}], workflows: [...]}
```
URL картинки лежит в `media[0].image.generatedImage.fifeUrl` (host `flow-content.google`).
Реализовано в [services/flow_client.py](backend/services/flow_client.py).

## Proxy Configuration

If Gemini API returns `403 PERMISSION_DENIED ("Your project has been denied access")`, you may need to route Gemini requests through a proxy.

In `backend/.env`:
```env
# HTTP/HTTPS proxy for Gemini API (Step 1 OCR, Step 2 vision, Step 3 product meta).
# Supports basic-auth: http://user:pass@host:port
GEMINI_PROXY=http://login:password@123.45.67.89:8080

# Proxy for Flow API. Usually not needed. Enable only if you get 403 on Flow requests.
FLOW_PROXY=
```

HTTP/HTTPS proxies (datacenter, residential) are supported. SOCKS requires an extra dependency:
```cmd
backend\.venv\Scripts\pip install "httpx[socks]"
```

After editing `.env` — **restart the backend** (close `nutra-backend` window → run `start.bat`). Check in **Settings** that `Gemini proxy: ✓` and/or `Flow proxy: ✓` are green.

Smoke test from console:
```cmd
cd backend
.venv\Scripts\activate
python -c "from services import gemini_text; print(gemini_text._get_client().models.generate_content(model='gemini-2.5-flash', contents=['ping']).text)"
```
Если выводит ответ — прокси работает.

## Известные ограничения

1. **Прогрев профиля.** Если генерация выдаёт 403 или вылазит видимая капча — Chrome-профиль `~/.chrome-nutra-flow` плохо прогрет. Зайди в него руками и поработай в Flow как обычный пользователь.

2. **`reload=False` обязателен на Windows.** В `main.py` стоит `uvicorn.run(..., reload=False)` — иначе uvicorn спавнит worker через subprocess+StatReload, который оказывается на SelectorEventLoop и валит Playwright пустым `NotImplementedError`. Если правишь python-код — перезапусти `start.bat` руками.

3. **Gemini API free tier — 20 запросов/сутки.** На free tier (`gemini-2.5-flash`) лимит `GenerateRequestsPerDayPerProjectPerModel-FreeTier=20` в сутки. После исчерпания шаги 1 (OCR/перевод), 2-manual и 3 (продуктовый vision-анализ) валятся с `429 RESOURCE_EXHAUSTED`. Шаг 4 (Flow) и 5 (антифрод) от Gemini не зависят. Решения: подождать сброс квоты или включить billing в [aistudio.google.com](https://aistudio.google.com).

4. **Zombie listener на :8000.** На Windows иногда после kill-а python-процесса порт остаётся «занят» в TCP-таблице (PID не существует, но `netstat` показывает LISTENING). `start.bat` это детектит автоматически и переключает backend на :8001 + говорит фронту слушать его там через `BACKEND_URL`/`VITE_BACKEND_PORT` env. Чтобы вылечить навсегда — `netsh winsock reset` от админа + reboot.

5. **Mobile UX** — основные вещи адаптивны, но drag-n-drop в Step2ManualEditor на touch-устройствах нужно тестить отдельно.

6. **One Chrome profile = один аккаунт.** При бане заведи второй профиль (поменяй `CHROME_FLOW_PROFILE_DIR` в `.env`) и залогинься в другой аккаунт. UI для горячего переключения — v2.

## Безопасность

- `.env` в `.gitignore`. Cookies живут в Chrome-профиле, на диске не дублируются.
- Локальный сервис без auth — **не открывать наружу через port forwarding без VPN**.
- Валидация mime-типов и лимит 10 МБ на загрузке.
