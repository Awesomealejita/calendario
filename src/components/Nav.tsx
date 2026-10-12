"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS } from "@/components/icons";

const ITEMS = [
  { href: "/calendar", label: "Calendario", Icon: NAV_ICONS.calendar },
  { href: "/timer", label: "Cronómetro", Icon: NAV_ICONS.timer },
  { href: "/insights", label: "Asistente", Icon: NAV_ICONS.insights },
  { href: "/settings", label: "Ajustes", Icon: NAV_ICONS.settings },
];

export function Nav() {
  const path = usePathname();
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Principal">
        <ul className="grid grid-cols-4">
          {ITEMS.map(({ href, label, Icon }) => {
            const active = path.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors duration-150 ${active ? "text-plum dark:text-coral" : "text-muted"}`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150 ${active ? "bg-peach/60 dark:bg-plum/40" : ""}`}>
                    <Icon aria-hidden size={20} strokeWidth={active ? 2.5 : 2} />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors duration-150 ${active ? "bg-night text-peach" : "text-muted hover:bg-surface-2 hover:text-text"}`}
            >
              <Icon aria-hidden size={16} />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
