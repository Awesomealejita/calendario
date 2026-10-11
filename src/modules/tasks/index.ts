import type { ModuleDefinition } from "@/modules/core/registry";

export const tasksModule: ModuleDefinition = {
  key: "tasks",
  label: "Quehaceres",
  icon: "✅",
  defaultColor: "#FFCF9C",
  timer: false,
  missedGraceMinutes: null,
  flexible: true,
  aiHint: "Quehaceres y tareas (incluye Microsoft To Do). Sugiere bloques de tiempo para las vencidas.",
};
