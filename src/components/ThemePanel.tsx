"use client";
import { useState } from "react";

const OPTIONS = [
  { value: "light", label: "☀️ Claro" },
  { value: "dark", label: "🌙 Oscuro" },
  { value: "auto", label: "💻 Como el sistema" },
] as const;

/** Aplica el tema al instante y lo recuerda en una cookie (el servidor lo usa al renderizar). */
function applyTheme(value: string) {
  document.documentElement.setAttribute("data-theme", value);
  document.cookie = `theme=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemePanel({ initial }: { initial: string }) {
  const [theme, setTheme] = useState(initial);
  const choose = (value: string) => {
    setTheme(value);
    applyTheme(value);
  };
  return (
    <section className="card">
      <h2 className="font-bold">🎨 Apariencia</h2>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Tema">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={theme === o.value}
            onClick={() => choose(o.value)}
            className={theme === o.value ? "btn-primary" : "btn-ghost"}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}
