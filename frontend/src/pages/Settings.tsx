import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useToasts } from "../components/Toast";

type Health = {
  ok: boolean;
  chrome_alive: boolean;
  gemini_alive: boolean;
  gemini_configured: boolean;
  flow_configured: boolean;
  gemini_proxy: boolean;
  flow_proxy: boolean;
};

export default function Settings() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const push = useToasts((s) => s.push);

  const refresh = () =>
    api.get<Health>("/api/health").then(setHealth).catch((e) => setError(String(e)));

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const pingGemini = async () => {
    try {
      const r = await api.post<{ alive: boolean }>("/api/health/ping_gemini");
      push(r.alive ? "Gemini отвечает" : "Gemini молчит", r.alive ? "ok" : "error");
    } catch (e) {
      push(String(e), "error");
    }
  };

  return (
    <div className="grid gap-4 max-w-2xl">
      <div className="card">
        <h2 className="text-lg font-semibold">Состояние сервиса</h2>
        {error && <p className="text-destructive text-sm mt-2">{error}</p>}
        {health && (
          <ul className="mt-3 space-y-1 text-sm">
            <Row label="API" ok={health.ok} />
            <Row label="Chrome (CDP)" ok={health.chrome_alive} hint="запустится при первой генерации" />
            <Row
              label="Gemini API ключ"
              ok={health.gemini_configured}
              hint={!health.gemini_configured ? "заполни GEMINI_API_KEY в backend/.env" : undefined}
            />
            <Row
              label="Flow конфиг"
              ok={health.flow_configured}
              hint={!health.flow_configured ? "заполни FLOW_PROJECT_ID в backend/.env" : undefined}
            />
            <Row
              label="Gemini прокси"
              ok={health.gemini_proxy}
              hint={!health.gemini_proxy ? "empty — Gemini goes direct" : "enabled"}
            />
            <Row
              label="Flow прокси"
              ok={health.flow_proxy}
              hint={!health.flow_proxy ? "пусто — Flow ходит напрямую (обычно ОК)" : "включён"}
            />
          </ul>
        )}
        <div className="flex gap-2 mt-3">
          <button className="btn-secondary" onClick={pingGemini}>
            Пинг Gemini
          </button>
          <button className="btn-ghost" onClick={refresh}>
            ↻ обновить
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold">Как это работает</h2>
        <ul className="text-sm text-zinc-400 list-disc pl-5 space-y-1 mt-2">
          <li>
            <code>start.bat</code> поднимает Chrome с отдельным профилем (<code>~/.chrome-nutra-flow</code>) и debug-портом 9224.
          </li>
          <li>В этом Chrome <b>один раз</b> залогинься в Google AI Pro/Ultra аккаунт и открой <code>labs.google/fx/tools/flow</code>.</li>
          <li>Прогрей сессию: походи по UI, сгенери что-нибудь руками. После этого софт умеет звать API.</li>
          <li>Cookies и сессия живут внутри профиля Chrome — софт ничего не парсит и не хранит в файлах.</li>
          <li>reCAPTCHA site_key софт сам вытащит со страницы.</li>
          <li>Если видишь видимую капчу — профиль плохо прогрет, юзай его как обычный человек.</li>
          <li>Софт работает в LAN: открой <code>http://&lt;ip-пк&gt;:5173</code> с телефона.</li>
        </ul>
      </div>
    </div>
  );
}

function Row({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <li className="flex items-center justify-between">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        {hint && <span className="text-xs text-zinc-500">{hint}</span>}
        <span className={ok ? "text-green-400" : "text-zinc-500"}>{ok ? "✓" : "—"}</span>
      </span>
    </li>
  );
}
