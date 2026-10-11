"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export function PasswordPanel() {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section className="card">
      <h2 className="font-bold">🔑 Contraseña</h2>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const { error } = await supabaseBrowser().auth.updateUser({ password });
          setBusy(false);
          setMsg(error ? { text: error.message, ok: false } : { text: "Contraseña cambiada ✅", ok: true });
          if (!error) setPassword("");
        }}
      >
        <input className="input" type="password" minLength={8} required placeholder="Nueva contraseña (mín. 8)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-label="Nueva contraseña" />
        <button className="btn-primary" disabled={busy}>Cambiar</button>
      </form>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-plum dark:text-peach" : "text-red"}`}>{msg.text}</p>}
    </section>
  );
}
