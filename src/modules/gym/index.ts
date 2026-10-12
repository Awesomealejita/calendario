import type { ModuleDefinition } from "@/modules/core/registry";

export const gymModule: ModuleDefinition = {
  key: "gym",
  label: "Gym",
  icon: "🏋️",
  defaultColor: "#FF8C6B",
  timer: true,
  missedGraceMinutes: 45,
  flexible: true,
  aiHint:
    "Entrenamientos. Horario flexible: si se salta o se acorta, propone huecos libres realistas " +
    "(sin pisar reuniones) para cumplir el objetivo semanal de sesiones y minutos.",
};
