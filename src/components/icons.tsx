import {
  BriefcaseBusiness,
  CalendarDays,
  Dumbbell,
  ListChecks,
  Settings,
  Sparkles,
  Stethoscope,
  Tag,
  Timer,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import type { ModuleKey } from "@/lib/types";

/** Icono SVG por módulo (sustituye a los emojis: se ven igual en todos los dispositivos). */
export const MODULE_ICONS: Record<ModuleKey, LucideIcon> = {
  gym: Dumbbell,
  work: BriefcaseBusiness,
  appointments: Stethoscope,
  tasks: ListChecks,
  custom: Tag,
};

export function ModuleIcon({ module, ...props }: { module: ModuleKey | null | undefined } & LucideProps) {
  const Icon = MODULE_ICONS[module ?? "custom"] ?? Tag;
  return <Icon aria-hidden size={16} strokeWidth={2.25} {...props} />;
}

export const NAV_ICONS = { calendar: CalendarDays, timer: Timer, insights: Sparkles, settings: Settings };

/** Logo: check dibujado (sin depender de glifos). */
export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <span className={`flex items-center justify-center rounded-lg bg-gradient-to-br from-peach via-coral to-plum ${className}`} aria-hidden>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="var(--night)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

/** Título de tarjeta con icono SVG decorativo. */
export function CardTitle({ icon: Icon, children, className = "" }: { icon: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`flex items-center gap-2 font-bold ${className}`}>
      <Icon aria-hidden size={18} strokeWidth={2.25} className="shrink-0 text-plum dark:text-coral" />
      {children}
    </h2>
  );
}
