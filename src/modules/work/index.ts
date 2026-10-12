import type { ModuleDefinition } from "@/modules/core/registry";

export const workModule: ModuleDefinition = {
  key: "work",
  label: "Trabajo",
  icon: "💼",
  defaultColor: "#7C3F82",
  timer: true,
  missedGraceMinutes: 30,
  flexible: false,
  aiHint:
    "Jornada laboral y reuniones (Outlook). El fichaje real viene de Holded. " +
    "Detecta fichajes olvidados, jornadas que se alargan o se quedan cortas y reuniones fuera de jornada.",
};
