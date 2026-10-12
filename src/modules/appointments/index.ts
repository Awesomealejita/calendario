import type { ModuleDefinition } from "@/modules/core/registry";

export const appointmentsModule: ModuleDefinition = {
  key: "appointments",
  label: "Citas",
  icon: "📌",
  defaultColor: "#E8543F",
  timer: false,
  missedGraceMinutes: null,
  flexible: false,
  aiHint: "Citas fijas (médico, gestiones, personales). No se mueven salvo conflicto.",
};
