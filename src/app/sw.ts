/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Eventos: red primero, caché si no hay conexión (lectura offline de la agenda).
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/events"),
      handler: new NetworkFirst({ cacheName: "events", networkTimeoutSeconds: 4 }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Calendario", {
      body: data.body,
      icon: "/icons/192",
      badge: "/icons/192",
      data: { url: data.url ?? "/insights" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      const client = list.find((c) => "focus" in c);
      return client ? client.navigate(url).then((c) => c?.focus()) : self.clients.openWindow(url);
    }),
  );
});
