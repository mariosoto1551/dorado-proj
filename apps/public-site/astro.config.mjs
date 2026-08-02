import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// public-site es 100% estático (SSG) — no agregar adapters de SSR (ver skill
// astro-public-site). El único JS de cliente es el island de /registro.
//
// `site` se usa para canonical/OG absolutos y para @astrojs/sitemap. Se toma de
// SITE_URL en build; el default es el dominio de marketing de producción.
const site = process.env.SITE_URL ?? 'https://proyectodorado.app';

// Hosts extra que el dev server acepta además de localhost y las IPs. Los setea
// `scripts/home-up.mjs` ("modo casa") con el nombre mDNS de la PC: sin esto Vite
// responde 403 "Blocked request" a `http://<nombre>.local:4321`. Solo afecta a
// `astro dev` — el build estático no tiene servidor.
const allowedHosts = (process.env.CASA_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

export default defineConfig({
  site,
  server: { port: 4321 },
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
    server: { allowedHosts },
  },
});
