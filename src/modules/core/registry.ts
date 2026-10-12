import type { ActivityType, ModuleKey } from "@/lib/types";

/**
 * Definición de un módulo de actividad. Para añadir un módulo nuevo:
 * crea src/modules/<nombre>/index.ts exportando un ModuleDefinition y regístralo abajo.
 */
export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  icon: string;
  defaultColor: string;
  /** Admite cronómetro (hora real de inicio/fin). */
  timer: boolean;
  /** Margen tras el inicio planificado para considerar un evento "no acudido" si no hay sesión. */
  missedGraceMinutes: number | null;
  /** Si es true, el horario es flexible y la IA puede proponer moverlo. */
  flexible: boolean;
  /** Pista que se envía a la IA para contextualizar sugerencias. */
  aiHint: string;
}

import { gymModule } from "@/modules/gym";
import { workModule } from "@/modules/work";
import { appointmentsModule } from "@/modules/appointments";
import { tasksModule } from "@/modules/tasks";

const customModule: ModuleDefinition = {
  key: "custom",
  label: "Personalizado",
  icon: "✨",
  defaultColor: "#7C3F82",
  timer: false,
  missedGraceMinutes: null,
  flexible: true,
  aiHint: "Categoría creada por el usuario.",
};

export const MODULES: Record<ModuleKey, ModuleDefinition> = {
  gym: gymModule,
  work: workModule,
  appointments: appointmentsModule,
  tasks: tasksModule,
  custom: customModule,
};

export function moduleFor(type: Pick<ActivityType, "module"> | null | undefined): ModuleDefinition {
  return (type && MODULES[type.module]) || customModule;
}
