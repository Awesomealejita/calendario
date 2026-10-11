"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/calendar", label: "Calendario", icon: "📅" },
  { href: "/timer", label: "Cronómetro", icon: "⏱️" },
  { href: "/insights", label: "Asistente", icon: "✨" },
  { href: "/settings", label: "Ajustes", icon: "⚙️" },
];

export function Nav() {
  const path = usePathname();
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="grid grid-cols-4">
          {ITEMS.map((i) => {
            const active = path.startsWith(i.href);
            return (
              <li key={i.href}>
                <Link
                  href={i.href}
                  className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${active ? "text-red dark:text-coral" : "text-muted"}`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="text-lg leading-none" aria-hidden>{i.icon}</span>
                  {i.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <nav className="hidden items-center gap-1 md:flex">
        {ITEMS.map((i) => {
          const active = path.startsWith(i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${active ? "bg-night text-peach" : "text-muted hover:bg-surface-2"}`}
            >
              {i.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
