import Link from "next/link";
import { Nav } from "@/components/Nav";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="min-h-dvh pb-24 md:pb-8">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/calendar" className="flex items-center gap-2 font-extrabold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-peach via-coral to-plum text-night">✓</span>
            Calendario
          </Link>
          <Nav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-4">{children}</main>
    </div>
  );
}
