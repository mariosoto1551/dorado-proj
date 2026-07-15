import { defineConfig } from 'astro/config';

// public-site es 100% estático (SSG) — no agregar adapters de SSR
// salvo que una página lo necesite explícitamente (ver skill astro-public-site).
export default defineConfig({
  server: { port: 4321 },
});
