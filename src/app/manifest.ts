import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Calendario",
    short_name: "Calendario",
    description: "Gym, trabajo, citas y quehaceres en un solo sitio.",
    start_url: "/calendar",
    display: "standalone",
    background_color: "#fff8f0",
    theme_color: "#2c2153",
    lang: "es",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Cronómetro", url: "/timer" },
      { name: "Asistente", url: "/insights" },
    ],
  };
}
