---
name: angular-frontend
description: Usar siempre que se escriba o edite código dentro de `apps/app-web` (Angular). Cubre Angular 22 signal-first, zoneless, componentes standalone/selectorless, manejo de sesión sin localStorage, y las convenciones de UI mobile-first del proyecto.
---

# Angular frontend — `app-web`, Proyecto Dorado

## Versión y modelo mental

- **Angular 22**, era "signal-first". Zoneless es el comportamiento por defecto — no agregar `zone.js` a mano, no está en las dependencias.
- Estrategia de detección de cambios por defecto: `OnPush`/`Eager` (ya viene así al crear componentes con el generador de Nx/Angular CLI). No forzar `Default` clásico.
- Todos los componentes son **standalone** (no hay `NgModule` de features). Evaluar **selectorless components** (feature de Angular 22) para componentes de uso puramente interno/composición que no necesitan selector — no es obligatorio, es una herramienta más, usar criterio.

## Regla simple para Signals vs RxJS

> Usar RxJS para **traer y transformar** datos (llamadas HTTP, streams); usar Signals para **guardar y mostrar** estado.

- Estado de componente/servicio: `signal()`.
- `@Input()` → `input()`. `@Output()` → `output()`.
- Datos async desde HTTP: evaluar `resource()`/`httpResource()` (APIs estables desde Angular 22) en vez de combinar manualmente `Observable` + `signal` + `subscribe` a mano para el caso simple de "traer datos y mostrarlos".
- Forms: Signal Forms está estable en Angular 22 — usarlo para formularios nuevos de esta fase en vez de Reactive Forms clásico salvo que el equipo prefiera lo segundo por familiaridad (decisión abierta, no bloqueante — si se elige Reactive Forms clásico, ser consistente en todo `app-web`, no mezclar los dos estilos en la misma pantalla).

## Sesión y auth (regla del proyecto, no solo de Angular)

- El `accessToken` vive en un `signal<string | null>` de un `AuthService` `providedIn: 'root'`. **Nunca** `localStorage`/`sessionStorage` (ver `CLAUDE.md` regla 7 y `fase-03-gateway-frontend-auth.md`).
- Interceptor funcional (`withInterceptors`) para adjuntar `Authorization` y manejar el refresh silencioso en 401 — ver el detalle exacto de la lógica en `fase-03-gateway-frontend-auth.md`, no reinventarla.

## Diseño mobile-first (obligatorio)

Maquetar primero para < 480px, expandir con `sm:`/`md:`/`lg:` de Tailwind. Ver `fase-10-frontend-completo.md` para el detalle de navegación (bottom nav en mobile para `Usuario`, sidebar drawer para `Tutor`).

## Componentes y estilo

- Tailwind CSS 4 (ver skill `tailwind-css`) para todo el estilo — nada de CSS-in-JS ni librerías de componentes tipo Material/PrimeNG (decisión ya tomada: control total del sistema visual de zonas, ver `docs/architecture` y la razón por la que se descartó DaisyUI).
- Tokens de diseño (colores de zona, tipografía) vienen de `libs/shared-ui`, nunca hardcodeados en un componente de `app-web`.
- Componentes reutilizables obligatorios antes de duplicar UI: `ZonaBadgeComponent`, `EstadoSeccionBadgeComponent`, `ConfirmDialogComponent` (ver `fase-10-frontend-completo.md`).

## Testing

Vitest para unit tests de componentes/servicios (Angular ya soporta Vitest como test runner vía el builder oficial — usar ese, no Karma/Jasmine). Playwright para e2e (`fase-12-qa-hardening.md`).

## Errores comunes a evitar en este proyecto puntual

- Guardar el JWT en `localStorage` "por simplicidad" — está explícitamente prohibido.
- Hardcodear los colores de zona (`#EF4444` etc.) en un componente en vez de leerlos de `GET /api/scoring/grupos/:grupoId/umbrales`.
- Llamar a un servicio backend directo (`identity-service:3001`) salteando el Gateway (`localhost:3000/api/*`) — ni siquiera en desarrollo local.

## Dónde mirar antes de codear

`fase-03-gateway-frontend-auth.md` (setup de auth/shell) y `fase-10-frontend-completo.md` (páginas completas), más el archivo de la fase backend correspondiente para saber la forma exacta de los endpoints que se van a consumir.
