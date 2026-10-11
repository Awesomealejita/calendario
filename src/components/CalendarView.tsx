"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
import type { EventDropArg, EventInput } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import type { ActivityType, CalendarEvent } from "@/lib/types";
import { EventDialog, type DraftEvent } from "@/components/EventDialog";
import { useMediaQuery } from "@/components/hooks";
import { moveEvent } from "@/app/(app)/calendar/actions";

export function CalendarView({ types, outlookConnected }: { types: ActivityType[]; outlookConnected: boolean }) {
  const ref = useRef<FullCalendar>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<DraftEvent | null>(null);
  const [toast, setToast] = useState("");
  const mobile = useMediaQuery("(max-width: 640px)");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const refetch = () => ref.current?.getApi().refetchEvents();

  const fetchEvents = useCallback(
    async (info: { startStr: string; endStr: string }, ok: (e: EventInput[]) => void, fail: (e: Error) => void) => {
      try {
        const r = await fetch(`/api/events?start=${encodeURIComponent(info.startStr)}&end=${encodeURIComponent(info.endStr)}`);
        if (!r.ok) throw new Error(await r.text());
        const all: EventInput[] = await r.json();
        ok(all.filter((e) => !hidden.has((e.extendedProps as { raw: CalendarEvent }).raw.activity_type_id ?? "none")));
      } catch (e) {
        fail(e as Error);
      }
    },
    [hidden],
  );

  const newDraft = (start: Date, end: Date, allDay = false, typeId?: string): DraftEvent => ({
    title: "",
    activity_type_id: typeId ?? types[0]?.id ?? null,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    all_day: allDay,
    notes: null,
    location: null,
  });

  const onMove = async (arg: EventDropArg | EventResizeDoneArg) => {
    const r = await moveEvent(arg.event.id, arg.event.start!.toISOString(), (arg.event.end ?? arg.event.start!).toISOString());
    if (!r.ok) {
      arg.revert();
      setToast(r.error);
    } else if (r.warning) setToast(r.warning);
  };

  const quickAdd = (typeId: string) => {
    const s = new Date();
    s.setMinutes(Math.ceil(s.getMinutes() / 15) * 15, 0, 0);
    setDraft(newDraft(s, new Date(s.getTime() + 3600000), false, typeId));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {types.map((t) => {
          const off = hidden.has(t.id);
          return (
            <button
              key={t.id}
              onClick={() => {
                const n = new Set(hidden);
                if (off) n.delete(t.id);
                else n.add(t.id);
                setHidden(n);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${off ? "border-border text-muted line-through" : "border-transparent text-night"}`}
              style={off ? undefined : { background: t.color }}
              aria-pressed={!off}
            >
              {t.icon} {t.name}
            </button>
          );
        })}
        <div className="ml-auto flex gap-2">
          {types.filter((t) => t.module === "gym" || t.module === "appointments").map((t) => (
            <button key={t.id} className="btn-ghost px-3 py-1 text-xs" onClick={() => quickAdd(t.id)}>+ {t.name}</button>
          ))}
          <button className="btn-primary px-3 py-1 text-xs" onClick={() => quickAdd(types[0]?.id)}>+ Nuevo</button>
        </div>
      </div>

      <div className="card overflow-hidden p-2 sm:p-4">
        <FullCalendar
          ref={ref}
          key={mobile ? "m" : "d"}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          locale={esLocale}
          timeZone="local"
          initialView={mobile ? "listWeek" : "timeGridWeek"}
          views={{
            timeGridDay: { titleFormat: { weekday: "short", day: "numeric", month: "short" } },
            listWeek: { titleFormat: { day: "numeric", month: "short" }, noEventsContent: "Nada esta semana" },
          }}
          headerToolbar={
            mobile
              ? { left: "prev,next", center: "title", right: "listWeek,timeGridDay,dayGridMonth" }
              : { left: "prev,next today", center: "title", right: "timeGridDay,timeGridWeek,dayGridMonth,listWeek" }
          }
          buttonText={{ day: "Día", week: "Semana", month: "Mes", list: "Agenda", today: "Hoy" }}
          height={mobile ? "calc(100dvh - 15rem)" : "calc(100dvh - 12rem)"}
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          scrollTime="07:30:00"
          nowIndicator
          selectable
          selectMirror
          editable
          longPressDelay={300}
          events={fetchEvents}
          select={(s) => setDraft(newDraft(s.start, s.end, s.allDay))}
          eventClick={(c) => {
            const raw = (c.event.extendedProps as { raw: CalendarEvent }).raw;
            setDraft({ ...raw });
          }}
          eventDrop={onMove}
          eventResize={onMove}
        />
      </div>

      {draft && (
        <EventDialog
          key={draft.id ?? draft.starts_at}
          draft={draft}
          types={types}
          outlookConnected={outlookConnected}
          onClose={() => setDraft(null)}
          onSaved={(msg) => {
            setDraft(null);
            if (msg) setToast(msg);
            refetch();
          }}
        />
      )}
      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-xl bg-night px-4 py-3 text-sm text-peach shadow-lg md:bottom-6">
          {toast}
        </div>
      )}
    </div>
  );
}
