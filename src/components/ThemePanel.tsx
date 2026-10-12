"use client";
import { useState } from "react";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { CardTitle } from "@/components/icons";

const OPTIONS = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
  { value: "auto", label: "Como el sistema", Icon: Monitor },
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
      <CardTitle icon={Palette}>Apariencia</CardTitle>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Tema">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={theme === o.value}
            onClick={() => choose(o.value)}
            className={theme === o.value ? "btn-primary" : "btn-ghost"}
          >
            <o.Icon aria-hidden size={16} />
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}
