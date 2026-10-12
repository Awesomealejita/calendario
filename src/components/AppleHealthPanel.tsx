/** Instrucciones para enviar los minutos de entreno a Apple Salud con un Atajo de iOS. */
export function AppleHealthPanel() {
  return (
    <section className="card">
      <h2 className="font-bold">Apple Salud</h2>
      <p className="mt-1 text-sm text-muted">
        Una web no puede escribir en Salud directamente, así que se hace con un Atajo de iPhone (se configura una vez). Después, al terminar el gym verás el botón
        «Guardar en Apple Salud» en el cronómetro.
      </p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
        <li>Abre la app <b>Atajos</b> → <b>+</b> para crear uno nuevo y llámalo exactamente <b>Calendario Entreno</b>.</li>
        <li>
          Añade la acción <b>Registrar entrenamiento</b> (en inglés «Log Workout»). Tipo: <b>Entrenamiento de fuerza tradicional</b>.
        </li>
        <li>
          En <b>Duración</b> elige la variable <b>Entrada del atajo</b> y la unidad <b>minutos</b>. Hora de inicio: <b>Fecha actual</b>.
        </li>
        <li>Guarda el atajo. La primera vez iOS te pedirá permiso para escribir en Salud.</li>
      </ol>
      <p className="mt-3 text-xs text-muted">Pruébalo una vez y revisa en Salud → Actividad que el entreno aparece con su duración.</p>
    </section>
  );
}
