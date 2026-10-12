"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mode = "password" | "link";

function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const linkFailed = useSearchParams().get("error") === "link";
  const [error, setError] = useState(linkFailed ? "El enlace ha caducado o ya se usó. Pide uno nuevo." : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    const auth = supabaseBrowser().auth;
    if (mode === "password") {
      const { error } = await auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message === "Invalid login credentials" ? "Email o contraseña incorrectos." : error.message);
        setState("idle");
      } else router.replace("/calendar");
      return;
    }
    const { error } = await auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false },
    });
    if (error) {
      setError(/signups not allowed/i.test(error.message) ? "No hay ninguna cuenta con ese email." : error.message);
      setState("idle");
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
          <p className="font-semibold">Revisa tu correo</p>
          <p className="mt-1 text-sm text-muted">Te hemos enviado un enlace para entrar a {email}.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-3">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" autoComplete="email" />
          {mode === "password" && (
            <>
              <label className="label" htmlFor="password">Contraseña</label>
              <input id="password" type="password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </>
          )}
          <button className="btn-primary w-full" disabled={state === "sending"}>
            {state === "sending" ? "Entrando…" : mode === "password" ? "Entrar" : "Enviarme un enlace"}
          </button>
          <button type="button" className="w-full text-center text-sm text-muted underline" onClick={() => setMode(mode === "password" ? "link" : "password")}>
            {mode === "password" ? "Prefiero un enlace por email" : "Entrar con contraseña"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
