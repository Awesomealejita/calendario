"use client";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import type { WorkoutSet } from "@/lib/types";
import { addSet, deleteSet } from "@/app/(app)/timer/actions";

export interface LastSet {
  exercise: string;
  reps: number | null;
  weight_kg: number | null;
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

/** Registro de series de una sesión de gym, al estilo de las apps de entreno. */
export function WorkoutLog({
  sessionId,
  sets,
  history,
  finishedMinutes,
}: {
  sessionId: string;
  sets: WorkoutSet[];
  /** Última serie registrada de cada ejercicio (para autocompletar y comparar). */
  history: LastSet[];
  /** Si la sesión ya terminó: minutos para enviar a Apple Salud. */
  finishedMinutes: number | null;
}) {
  const [exercise, setExercise] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const ios = useSyncExternalStore(() => () => {}, isIOS, () => false);

  const grouped = useMemo(() => {
    const m = new Map<string, WorkoutSet[]>();
    for (const s of sets) m.set(s.exercise, [...(m.get(s.exercise) ?? []), s]);
    return [...m.entries()];
  }, [sets]);
  const volume = sets.reduce((a, s) => a + (s.reps ?? 0) * (s.weight_kg ?? 0), 0);

  const pick = (name: string) => {
    setExercise(name);
    const last = history.find((h) => h.exercise.toLowerCase() === name.toLowerCase());
    if (last) {
      setReps(last.reps?.toString() ?? "");
      setWeight(last.weight_kg?.toString() ?? "");
    }
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Entreno</h3>
        {sets.length > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {sets.length} {sets.length === 1 ? "serie" : "series"} · {Math.round(volume).toLocaleString("es-ES")} kg de volumen
          </span>
        )}
      </div>

      {grouped.length > 0 && (
        <ul className="mt-2 space-y-2">
          {grouped.map(([name, list]) => (
            <li key={name} className="rounded-xl bg-surface-2 p-2.5">
              <p className="text-sm font-semibold">{name}</p>
              <ol className="mt-1 flex flex-wrap gap-1.5">
                {list.map((s, i) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="rounded-lg border border-border bg-surface px-2 py-1 text-xs tabular-nums hover:border-red"
                      title="Borrar esta serie"
                      aria-label={`Serie ${i + 1}: ${s.reps ?? "–"} repeticiones con ${s.weight_kg ?? 0} kg. Pulsa para borrar.`}
                      onClick={() => confirm("¿Borrar esta serie?") && start(async () => void (await deleteSet(s.id)))}
                    >
                      {s.reps ?? "–"} × {s.weight_kg ?? 0} kg
                    </button>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 grid grid-cols-[1fr_4.5rem_4.5rem] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          start(async () => {
            const r = await addSet({
              sessionId,
              exercise,
              reps: reps === "" ? null : Number(reps),
              weightKg: weight === "" ? null : Number(weight.replace(",", ".")),
            });
            if (!r.ok) setError(r.error);
          });
        }}
      >
        <input
          className="input"
          list={`exercises-${sessionId}`}
          placeholder="Ejercicio"
          value={exercise}
          onChange={(e) => pick(e.target.value)}
          required
          aria-label="Ejercicio"
        />
        <datalist id={`exercises-${sessionId}`}>
          {history.map((h) => (
            <option key={h.exercise} value={h.exercise} />
          ))}
        </datalist>
        <input className="input px-2 text-center" inputMode="numeric" placeholder="Reps" value={reps} onChange={(e) => setReps(e.target.value.replace(/\D/g, ""))} aria-label="Repeticiones" />
        <input className="input px-2 text-center" inputMode="decimal" placeholder="Kg" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Peso en kilos" />
        <button className="btn-ghost col-span-3 h-11" disabled={pending || !exercise.trim()}>
          {pending ? "Guardando…" : "+ Añadir serie"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {finishedMinutes !== null && ios && (
        <a
          className="btn-primary mt-3 h-11 w-full"
          href={`shortcuts://run-shortcut?name=${encodeURIComponent("Calendario Entreno")}&input=text&text=${finishedMinutes}`}
        >
          Guardar {finishedMinutes} min en Apple Salud
        </a>
      )}
    </div>
  );
}
