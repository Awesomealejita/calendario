"use client";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import type { ActivityType } from "@/lib/types";
import type { QuickAddDraft } from "@/lib/quickadd";
import { TIMEZONE } from "@/lib/time";
import { previewQuickAdd, saveEvent } from "@/app/(app)/calendar/actions";
import type { DraftEvent } from "@/components/EventDialog";

type Draft = QuickAddDraft & { activity_type_id: string | null };

// API de dictado del navegador (Safari/Chrome la exponen con prefijo webkit).
interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;
const getRecognition = (): RecognitionCtor | undefined =>
  typeof window === "undefined"
    ? undefined
    : ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition);

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("es-ES", { timeZone: TIMEZONE, ...opts });

export function QuickAdd({ types, onCreated, onEdit }: { types: ActivityType[]; onCreated: (msg?: string) => void; onEdit: (d: DraftEvent) => void }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [pending, start] = useTransition();
  const rec = useRef<Recognition | null>(null);
  const canDictate = useSyncExternalStore(() => () => {}, () => Boolean(getRecognition()), () => false);

  const preview = (value: string) =>
    start(async () => {
      setError("");
      const r = await previewQuickAdd(value);
      if (r.ok) setDraft(r.draft);
      else {
        setDraft(null);
        setError(r.error);
      }
    });

  const dictate = () => {
    const Ctor = getRecognition();
    if (!Ctor) return;
    if (listening) return rec.current?.stop();
    const r = new Ctor();
    r.lang = "es-ES";
    r.interimResults = false;
    r.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript ?? "";
      setText(said);
      if (said) preview(said);
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Permite el micrófono para dictar." : "No te he oído, prueba otra vez.");
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  const type = draft && types.find((t) => t.id === draft.activity_type_id);
  const asDialogDraft = (d: Draft): DraftEvent => ({
    title: d.title,
    activity_type_id: d.activity_type_id,
    starts_at: d.start,
    ends_at: d.end,
    all_day: d.allDay,
    notes: null,
    location: null,
  });

  return (
    <div className="card p-3">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) preview(text);
        }}
      >
        <input
          className="input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDraft(null);
          }}
          placeholder="Escribe o dicta: «gym mañana a las 7»"
          aria-label="Añadir evento escribiendo"
        />
        {canDictate && (
          <button
            type="button"
            onClick={dictate}
            className={`btn-ghost h-11 w-11 shrink-0 p-0 ${listening ? "animate-pulse border-red text-red" : ""}`}
            aria-label={listening ? "Parar dictado" : "Dictar por voz"}
            aria-pressed={listening}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        )}
        <button className="btn-primary h-11 shrink-0" disabled={pending || !text.trim()}>
          {pending ? "…" : "Añadir"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red">{error}</p>}
      {draft && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-3" role="status">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: type?.color ?? "var(--plum)" }} aria-hidden />
          <p className="min-w-0 flex-1 text-sm">
            <b>{draft.title}</b> · {type?.name ?? "Evento"} ·{" "}
            <span className="capitalize">{fmt(draft.start, { weekday: "long", day: "numeric", month: "short" })}</span>
            {draft.hasTime && ` · ${fmt(draft.start, { hour: "2-digit", minute: "2-digit" })}–${fmt(draft.end, { hour: "2-digit", minute: "2-digit" })}`}
            {!draft.hasTime && " · todo el día"}
          </p>
          <button className="btn-ghost h-9 px-3 text-xs" onClick={() => onEdit(asDialogDraft(draft))}>Editar</button>
          <button
            className="btn-primary h-9 px-3 text-xs"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveEvent({
                  title: draft.title,
                  activity_type_id: draft.activity_type_id,
                  starts_at: draft.start,
                  ends_at: draft.end,
                  all_day: draft.allDay,
                });
                if (r.ok) {
                  setText("");
                  setDraft(null);
                  onCreated(r.warning ?? `«${draft.title}» añadido`);
                } else setError(r.error);
              })
            }
          >
            Confirmar
          </button>
        </div>
      )}
    </div>
  );
}
