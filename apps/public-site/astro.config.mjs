import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// public-site es 100% estático (SSG) — no agregar adapters de SSR (ver skill
// astro-public-site). El único JS de cliente es el island de /registro.
//
// `site` se usa para canonical/OG absolutos y para @astrojs/sitemap. Se toma de
// SITE_URL en build; el default es el dominio de marketing de producción.
const site = process.env.SITE_URL ?? 'https://proyectodorado.app';

export default defineConfig({
  site,
  server: { port: 4321 },
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
