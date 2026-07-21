import { defineConfig } from '@playwright/test';

/**
 * Suite E2E de la Fase 12 — corre contra el stack COMPLETO ya levantado
 * (infra vía docker-compose + los 11 procesos vía `nx run-many serve`). El
 * arranque/apagado del stack lo orquesta `scripts/e2e-up.mjs`; esta config NO
 * usa `webServer` porque no levanta un solo proceso sino todo el sistema.
 *
 * Toda la suite es API-first sobre el Gateway (:3000) — verifica el mismo
 * comportamiento que un E2E de navegador pero sin la fragilidad de manejar dos
 * frontends cruzando orígenes. El único tramo de UI (registro en public-site,
 * login en app-web) vive en `flujo-completo.e2e.ts` como smoke opcional,
 * salteado si los frontends no están servidos (ver GATEWAY/APP/SITE env).
 *
 * Decisión de orquestación registrada en docs/progreso/fase-12-qa-hardening.md.
 */
const GATEWAY_URL = process.env['E2E_GATEWAY_URL'] ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.e2e.ts',
  // Serial a propósito: los escenarios comparten el stack y algunos dependen
  // de estado acumulado (una Sección evaluada, un canje único). El aislamiento
  // real entre corridas lo da recrear las bases, no la paralelización.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env['CI']
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: GATEWAY_URL,
    extraHTTPHeaders: { 'content-type': 'application/json' },
    trace: 'retain-on-failure',
  },
});
