import { expect, type Page } from '@playwright/test';

import type { Organizacion } from './escenario';

/**
 * Lo que comparten las suites de NAVEGADOR (`turnos-visibles`,
 * `navegacion-tutor`, `registro-del-tutor` y la herramienta de capturas). Las
 * demás suites son API-first y no pasan por acá.
 */
export const APP_URL = process.env['E2E_APP_URL'] ?? 'http://localhost:4200';

/**
 * Login por formulario — el access token vive en memoria (regla 7 de
 * `CLAUDE.md`), así que no hay atajo por storage.
 *
 * **Reintenta**, y no por flakiness: `/auth/login` tiene un límite estricto de
 * 10 por minuto, y con cuatro suites de navegador corriendo seguidas —cada una
 * con su `beforeAll`— la última se lo come. El síntoma engaña: el 429 deja la
 * pestaña en `/login` y lo que se ve es «la pantalla no cargó», no «me
 * limitaron». Esperar una ventana y volver a intentar es la única salida desde
 * el lado del test; subir el límite sería aflojar una defensa real.
 */
export async function entrarComoTutor(page: Page, org: Organizacion): Promise<void> {
  for (let intento = 1; ; intento += 1) {
    await page.goto(`${APP_URL}/login`);
    await page.fill('#identificador', org.emailContacto);
    await page.fill('#password', org.password);
    await page.click('button[type="submit"]');

    try {
      await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

      return;
    } catch (error) {
      if (intento >= 3) {
        throw error;
      }

      await page.waitForTimeout(62_000);
    }
  }
}
