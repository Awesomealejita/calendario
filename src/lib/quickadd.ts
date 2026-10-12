import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import type { ModuleKey } from "@/lib/types";
import { TIMEZONE } from "@/lib/time";

/** Resultado de interpretar una frase como "gym mañana a las 7" o "dentista el jueves a las 17:30". */
export interface QuickAddDraft {
  title: string;
  module: ModuleKey;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  /** Se dijo una hora explícita (si no, el evento queda como "todo el día"). */
  hasTime: boolean;
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const MODULE_WORDS: Array<[ModuleKey, RegExp]> = [
  ["gym", /\b(gym|gimnasio|gimnas|entreno|entrenar|entrenamiento|pesas|crossfit|pierna|pecho|espalda|hombro|brazo|cardio|correr|running|yoga|pilates|spinning|natacion|nadar|boxeo|padel|tenis|futbol|bici)\b/],
  ["appointments", /\b(dentista|medico|medica|cita|fisio|fisioterapeuta|peluqueria|peluquero|revision|analisis|veterinario|abogado|banco|notario|ginecologo|oculista|dermatologo|psicologo|itv|taller|gestoria)\b/],
  ["work", /\b(reunion|call|llamada|meeting|daily|trabajo|cliente|demo|presentacion|oficina|entrevista|formacion|kick ?off|sprint)\b/],
  ["tasks", /\b(comprar|pagar|enviar|recoger|limpiar|lavar|ordenar|tramitar|renovar|hacer|preparar|estudiar|tarea|recado)\b/],
];

const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DEFAULT_MINUTES: Record<ModuleKey, number> = { gym: 60, work: 60, appointments: 60, tasks: 30, custom: 60 };

/**
 * Interpreta una frase en español sin IA. Entiende días (hoy, mañana, pasado mañana, el jueves,
 * el 15, 15/10, 15 de octubre), horas (a las 7, 17:30, 19h, 7 y media, 8 menos cuarto, mediodía,
 * de la tarde/noche/mañana), duración (1h, 90 min, durante 2 horas, de 17 a 18, hasta las 19)
 * y el tipo de actividad por palabras clave.
 */
export function parseQuickAdd(input: string, now: Date = new Date(), tz = TIMEZONE): QuickAddDraft | null {
  const original = input.trim().replace(/\s+/g, " ");
  if (!original) return null;
  let t = ` ${strip(original)} `;
  const removed: string[] = [];
  const take = (re: RegExp) => {
    const m = t.match(re);
    if (m) {
      removed.push(m[0]);
      t = t.replace(m[0], " ");
    }
    return m;
  };

  // Franja del día ("de la tarde") antes de buscar "mañana" como día.
  let meridiem: "am" | "pm" | null = null;
  if (take(/\b(de|por) la (tarde|noche)\b|\bpm\b/)) meridiem = "pm";
  else if (take(/\b(de|por) la (manana|madrugada)\b|\bam\b/)) meridiem = "am";

  const local = new TZDate(now.getTime(), tz);
  let day: TZDate | null = null;
  if (take(/\bpasado manana\b/)) day = addDays(local, 2) as TZDate;
  else if (take(/\bmanana\b/)) day = addDays(local, 1) as TZDate;
  else if (take(/\bhoy\b|\besta (tarde|noche)\b/)) day = local;
  const wd = !day && take(/\b(el |este |proximo |el proximo )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)( que viene)?\b/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[2]);
    let diff = (target - local.getDay() + 7) % 7;
    if (diff === 0 || /proximo|que viene/.test(wd[0])) diff = diff === 0 ? 7 : diff;
    day = addDays(local, diff) as TZDate;
  }
  const dm = !day && take(/\b(?:el )?(\d{1,2})(?:\/(\d{1,2})| de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))?\b(?! ?(?:h|:|\.|y |menos|min))/);
  if (dm && Number(dm[1]) >= 1 && Number(dm[1]) <= 31 && (dm[2] || dm[3] || /\bel /.test(dm[0]))) {
    const month = dm[2] ? Number(dm[2]) - 1 : dm[3] ? MONTHS.indexOf(dm[3]) : local.getMonth();
    let candidate = new TZDate(local.getFullYear(), month, Number(dm[1]), 0, 0, 0, tz);
    if (candidate.getTime() < new TZDate(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0, tz).getTime()) {
      candidate = dm[2] || dm[3]
        ? new TZDate(local.getFullYear() + 1, month, Number(dm[1]), 0, 0, 0, tz)
        : new TZDate(local.getFullYear(), local.getMonth() + 1, Number(dm[1]), 0, 0, 0, tz);
    }
    day = candidate;
  } else if (dm) {
    // No era una fecha: lo devolvemos al texto.
    t = t.replace(" ", ` ${dm[0]} `);
    removed.pop();
  }

  // Módulo (antes de la hora, para la heurística de mañana/tarde).
  const kind = (MODULE_WORDS.find(([, re]) => re.test(t))?.[0] ?? "appointments") as ModuleKey;

  // Hora de inicio.
  const parseClock = (h: string, m?: string, extra?: string) => {
    let hour = Number(h);
    let minute = m ? Number(m) : 0;
    if (extra) {
      if (/y media/.test(extra)) minute = 30;
      else if (/y cuarto/.test(extra)) minute = 15;
      else if (/menos cuarto/.test(extra)) {
        hour -= 1;
        minute = 45;
      }
    }
    return { hour, minute };
  };
  let startClock: { hour: number; minute: number } | null = null;
  let endClock: { hour: number; minute: number } | null = null;
  if (take(/\b(a )?mediodia\b/)) startClock = { hour: 12, minute: 0 };
  const range = !startClock && take(/\b(?:de|entre) (?:las |la )?(\d{1,2})(?:[:.](\d{2}))? (?:a|y) (?:las |la )?(\d{1,2})(?:[:.](\d{2}))?\s*h?\b/);
  if (range) {
    startClock = parseClock(range[1], range[2]);
    endClock = parseClock(range[3], range[4]);
  }
  const at = !startClock && take(/\b(?:a las |a la |sobre las |las )?(\d{1,2})(?:[:.](\d{2}))?(?:\s*(h\b|horas?\b))?( y media| y cuarto| menos cuarto)?/);
  if (at && (at[0].trim().startsWith("a ") || at[0].includes("las") || at[0].includes("la ") || at[2] || at[3] || at[4])) {
    startClock = parseClock(at[1], at[2], at[4]);
  } else if (at) {
    t = t.replace(" ", ` ${at[0]} `);
    removed.pop();
  }
  const until = startClock && !endClock && take(/\bhasta (?:las |la )?(\d{1,2})(?:[:.](\d{2}))?\b/);
  if (until) endClock = parseClock(until[1], until[2]);

  const fixMeridiem = (c: { hour: number; minute: number }) => {
    let h = c.hour;
    if (meridiem === "pm" && h < 12) h += 12;
    else if (meridiem === "am" && h === 12) h = 0;
    // Sin "de la tarde": las citas y reuniones a la 1–7 casi siempre son por la tarde.
    else if (!meridiem && kind !== "gym" && h >= 1 && h <= 7) h += 12;
    return { hour: h, minute: c.minute };
  };
  if (startClock) startClock = fixMeridiem(startClock);
  if (endClock) {
    endClock = fixMeridiem(endClock);
    if (startClock && endClock.hour < startClock.hour && endClock.hour < 12) endClock.hour += 12;
  }

  // Duración.
  let minutes = DEFAULT_MINUTES[kind];
  const dur = take(/\b(?:durante |de )?(\d+(?:[.,]\d+)?)\s*(h|horas?|min|minutos?)\b/);
  if (dur) {
    const n = Number(dur[1].replace(",", "."));
    minutes = /^h/.test(dur[2]) ? Math.round(n * 60) : Math.round(n);
  } else if (take(/\b(una hora y media|hora y media)\b/)) minutes = 90;
  else if (take(/\bmedia hora\b/)) minutes = 30;
  else if (take(/\buna hora\b/)) minutes = 60;

  const base = day ?? local;
  const hasTime = Boolean(startClock);
  const start = hasTime
    ? new TZDate(base.getFullYear(), base.getMonth(), base.getDate(), startClock!.hour, startClock!.minute, 0, tz)
    : new TZDate(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, tz);
  const end = !hasTime
    ? addDays(start, 1)
    : endClock
      ? new TZDate(base.getFullYear(), base.getMonth(), base.getDate(), endClock.hour, endClock.minute, 0, tz)
      : new Date(start.getTime() + minutes * 60000);

  // Título: lo que queda tras quitar fecha/hora, con las mayúsculas del original.
  const leftover = t.replace(/\b(a las|a la|el|la|los|las|de|del|para|con|en)\s*$/g, "").replace(/\s+/g, " ").trim();
  const words = leftover.split(" ").filter(Boolean);
  const originalWords = original.split(" ");
  const titleWords = words.map((w) => originalWords.find((o) => strip(o) === w) ?? w);
  while (titleWords.length && /^(a|el|la|las|los|de|del|y|en|para)$/i.test(titleWords.at(-1)!)) titleWords.pop();
  while (titleWords.length && /^(a|el|la|las|los|de|del|y|en|para)$/i.test(titleWords[0])) titleWords.shift();
  let title = titleWords.join(" ");
  if (!title) title = { gym: "Gym", work: "Trabajo", appointments: "Cita", tasks: "Tarea", custom: "Evento" }[kind];
  title = title.charAt(0).toUpperCase() + title.slice(1);

  return { title, module: kind, start: new Date(start.getTime()).toISOString(), end: new Date(end.getTime()).toISOString(), allDay: !hasTime, hasTime };
}
