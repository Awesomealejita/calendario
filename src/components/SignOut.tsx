"use client";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export function SignOut() {
  const router = useRouter();
  return (
    <button
      className="btn-ghost text-xs"
      onClick={async () => {
        await supabaseBrowser().auth.signOut();
        router.replace("/login");
      }}
    >
      Cerrar sesión
    </button>
  );
}
