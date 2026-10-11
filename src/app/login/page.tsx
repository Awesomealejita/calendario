"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else setState("sent");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <div className="mb-8 flex gap-1.5">
        {["bg-peach", "bg-coral", "bg-red", "bg-plum", "bg-night"].map((c) => (
          <span key={c} className={`h-2 flex-1 rounded-full ${c}`} />
        ))}
      </div>
      <h1 className="text-3xl font-extrabold">Tu calendario</h1>
      <p className="mt-2 text-muted">Gym, trabajo, citas y quehaceres. Con Outlook, Holded y un asistente que te echa un cable.</p>
      {state === "sent" ? (
        <div className="card mt-8">
          <p className="font-semibold">Revisa tu correo 📬</p>
          <p className="mt-1 text-sm text-muted">Te hemos enviado un enlace para entrar a {email}.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-3">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" autoComplete="email" />
          <button className="btn-primary w-full" disabled={state === "sending"}>
            {state === "sending" ? "Enviando…" : "Entrar con enlace mágico"}
          </button>
          {state === "error" && <p className="text-sm text-red">{error}</p>}
        </form>
      )}
    </main>
  );
}
