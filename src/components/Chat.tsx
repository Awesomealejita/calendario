"use client";
import { useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { CardTitle } from "@/components/icons";

type Msg = { role: "user" | "assistant"; content: string };

const PROMPTS = ["¿Cuándo encajo el gym esta semana?", "¿Cómo voy de horas este mes?", "¿Qué tengo mañana?"];

export function Chat({ enabled }: { enabled: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-20) }),
      });
      const j = await r.json();
      setMessages([...next, { role: "assistant", content: r.ok ? j.reply || "…" : j.error }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Sin conexión. Inténtalo de nuevo." }]);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  if (!enabled) {
    return (
      <section className="card">
        <CardTitle icon={MessageCircle}>Pregúntale al asistente</CardTitle>
        <p className="mt-1 text-sm text-muted">Configura ANTHROPIC_API_KEY en el servidor para activar el chat.</p>
      </section>
    );
  }

  return (
    <section className="card flex flex-col">
      <CardTitle icon={MessageCircle} className="mb-2">Pregúntale al asistente</CardTitle>
      <div className="mb-3 max-h-80 min-h-24 space-y-2 overflow-y-auto">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {PROMPTS.map((p) => (
              <button key={p} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:bg-surface-2" onClick={() => send(p)}>{p}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <p
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-night text-peach" : "bg-surface-2"}`}
          >
            {m.content}
          </p>
        ))}
        {busy && <p className="w-fit animate-pulse rounded-2xl bg-surface-2 px-3 py-2 text-sm text-muted">Pensando…</p>}
        <div ref={endRef} />
      </div>
      <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), send(input))}>
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escribe…" aria-label="Mensaje" />
        <button className="btn-primary" disabled={busy || !input.trim()}>Enviar</button>
      </form>
    </section>
  );
}
