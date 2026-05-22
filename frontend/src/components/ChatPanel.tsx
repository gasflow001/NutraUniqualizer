import { useEffect, useRef, useState } from "react";
import { wsUrl } from "../api/client";

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "system"; text: string };

type Props = {
  wsPath: string; // e.g. /api/projects/1/step1/chat
  onPayload?: (data: unknown) => void;
  placeholder?: string;
};

export default function ChatPanel({ wsPath, onPayload, placeholder = "Опиши, что поправить..." }: Props) {
  const wsRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = wsUrl(wsPath);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = (e) => {
      setConnected(false);
      if (e.code !== 1000 && e.code !== 1001 && e.code !== 1005) {
        setMessages((m) => [
          ...m,
          { role: "system", text: `WS закрыт: код ${e.code}${e.reason ? ` (${e.reason})` : ""}` },
        ]);
      }
    };
    ws.onerror = () =>
      setMessages((m) => [
        ...m,
        { role: "system", text: `Ошибка соединения с ${url}. Проверь что backend запущен на :8000.` },
      ]);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "thinking") {
          setBusy(true);
          return;
        }
        if (data.type === "error") {
          setBusy(false);
          setMessages((m) => [...m, { role: "system", text: data.message }]);
          return;
        }
        setBusy(false);
        if (data.data) onPayload?.(data.data);
        setMessages((m) => [...m, { role: "assistant", text: "✓ Применено" }]);
      } catch {
        setMessages((m) => [...m, { role: "system", text: String(e.data) }]);
      }
    };
    return () => ws.close();
  }, [wsPath, onPayload]);

  const send = () => {
    const text = input.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== 1) return;
    wsRef.current.send(JSON.stringify({ instruction: text }));
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
  };

  return (
    <div className="card flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Чат правок</h3>
        <span className={`text-xs ${connected ? "text-green-400" : "text-zinc-500"}`}>
          {connected ? "online" : "offline"}
        </span>
      </header>
      <ul className="flex flex-col gap-2 max-h-60 overflow-auto text-sm">
        {messages.map((m, i) => (
          <li
            key={i}
            className={
              m.role === "user"
                ? "self-end rounded-lg bg-primary/20 px-3 py-1.5 max-w-[80%]"
                : m.role === "assistant"
                ? "self-start rounded-lg bg-zinc-800 px-3 py-1.5 max-w-[80%]"
                : "self-center text-xs text-zinc-500"
            }
          >
            {m.text}
          </li>
        ))}
        {busy && <li className="self-start text-xs text-zinc-500">⏳ думаю...</li>}
      </ul>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={!connected || busy}
        />
        <button className="btn-primary" onClick={send} disabled={!connected || busy}>
          Отправить
        </button>
      </div>
    </div>
  );
}
