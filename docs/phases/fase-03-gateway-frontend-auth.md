# Fase 3 — Gateway mínimo + arranque del frontend autenticado

> Objetivo: primer flujo end-to-end real (registro → login → unirse a un grupo) pasando por un punto de entrada único. Basado en `proyecto-dorado-plan-desarrollo-general.md` sección 4.

## Prerrequisitos
Fase 2 completa (Identity funcionando y probado directo, sin gateway).

## `apps/gateway` (NestJS, sin base de datos propia)

### Tabla de ruteo

El Gateway expone un único prefijo público `/api/*`. Cada segmento después mapea 1:1 a un servicio interno. Se define la tabla completa (incluyendo servicios que todavía no existen) para no tener que retocar el Gateway en cada fase siguiente — las entradas de servicios no implementados devuelven `503 Service Unavailable` hasta que esa fase los levante (controlado por variables de entorno `<SERVICIO>_INTERNAL_URL` ausentes).

| Prefijo público | Servicio interno | Env var | Implementado desde |
|---|---|---|---|
| `/api/auth/*` | identity-service `/auth/*` | `IDENTITY_INTERNAL_URL` | Fase 3 |
| `/api/identity/*` | identity-service `/identity/*` | `IDENTITY_INTERNAL_URL` | Fase 3 |
| `/api/billing/*` | billing-service `/billing/*` | `BILLING_INTERNAL_URL` | Fase 4 |
| `/api/activity/*` | activity-service `/activity/*` | `ACTIVITY_INTERNAL_URL` | Fase 5 |
| `/api/session/*` | session-service `/session/*` | `SESSION_INTERNAL_URL` | Fase 6 |
| `/api/scoring/*` | scoring-service `/scoring/*` | `SCORING_INTERNAL_URL` | Fase 7 |
| `/api/rewards/*` | rewards-service `/rewards/*` | `REWARDS_INTERNAL_URL` | Fase 8 |
| `/api/notification/*` | notification-service `/notification/*` | `NOTIFICATION_INTERNAL_URL` | Fase 9 |
| `/api/audit/*` | audit-service `/audit/*` | `AUDIT_INTERNAL_URL` | Fase 9 |

Implementación: middleware de proxy (`http-proxy-middleware` sobre el adapter Express de Nest) montado por prefijo en `main.ts`. No se reimplementan los controllers de cada servicio en el Gateway — es un proxy puro más cross-cutting concerns.

### CORS (obligatorio, no queda implícito)

El Gateway es el único servicio que responde a origenes de navegador — todo lo demás es tráfico interno. Configurar `app.enableCors(...)` explícito, **no `origin: '*'`**:

```ts
app.enableCors({
  origin: [process.env.APP_WEB_URL, process.env.PUBLIC_SITE_URL], // en local: http://localhost:4200, http://localhost:4321
  credentials: true, // obligatorio: sin esto la cookie httpOnly del refresh token (ADR-00 sección 3) no viaja entre origenes distintos
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

`credentials: true` + lista explícita de orígenes (no wildcard) es obligatorio porque `app-web` y `public-site` corren en dominios distintos al Gateway ya desde desarrollo local (puertos distintos) y definitivamente en producción (Vercel/Netlify vs. Railway/Render, ver `fase-13-piloto-deploy.md`) — sin esto, el flujo de refresh token vía cookie (`ADR-00` sección 3) se rompe silenciosamente en el navegador (la cookie no se manda ni se guarda) y el síntoma es indistinguible de un bug de JWT.

### Orden de middlewares (todos en `main.ts`, en este orden exacto)

1. CORS (`app.enableCors(...)`, ver arriba) — antes que cualquier otra cosa, incluso antes de leer el `correlationId`, porque el navegador puede mandar un preflight `OPTIONS` que no debe pasar por el resto de la cadena.
2. `correlationIdMiddleware` — lee/genera `x-correlation-id` (ver Fase 1).
3. `ThrottlerGuard` global (`@nestjs/throttler`) — límite default 100 req/min por IP. Override específico más estricto en `/api/auth/login` y `/api/auth/organizaciones`: 10 req/min por IP, para mitigar fuerza bruta (ver nota en Fase 2 sobre throttling diferido al Gateway).
4. `jwtValidationMiddleware` — valida firma RS256 con `JWT_PUBLIC_KEY` y expiración. Rutas exentas (lista explícita, no heurística): `POST /api/auth/organizaciones`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/invitaciones/:codigo`, `POST /api/auth/invitaciones/:codigo/canjear`, `GET /api/health`. Todo lo demás requiere JWT válido o devuelve 401 antes de llegar al proxy.
5. `tenantHeaderInjectorMiddleware` — si el JWT es válido, decodifica el payload y agrega al request saliente: `x-organizacion-id`, `x-grupo-ids` (join por coma), `x-rol`, `x-principal-id`, `x-principal-type`, más `x-internal-secret: GATEWAY_INTERNAL_SECRET` (env var compartida, ver `ADR-00` sección 4).
6. Proxy por prefijo según la tabla de arriba.

### Health check

`GET /api/health` (público, sin JWT) devuelve `{ status: 'ok', servicios: { identity: 'up'|'down'|'not_configured', billing: ..., ... } }` — pinga `GET /internal/health` de cada servicio configurado (timeout 2s, no bloquea si uno está caído).

## `apps/app-web` (Angular 17+, standalone + signals, Tailwind)

### Alcance de esta fase (solo lo necesario para el flujo registro→login→unirse)

Rutas:

| Ruta | Página | Acceso |
|---|---|---|
| `/registro` | Formulario auto-registro de organización | público |
| `/login` | Login unificado (mismo form para Tutor y Usuario, un solo campo `identificador`) | público |
| `/invitacion/:codigo` | Preview de invitación + form de canje (nombre, password, email o username según `tipoInvitado`) | público |
| `/` (shell autenticado) | Layout con topbar (nombre + logout) y sidebar vacío (placeholder, se llena en Fase 10) | requiere sesión |
| `/onboarding` | Pantalla post-canje/post-registro: "creá tu primer Grupo" (solo si `rol` es `ORG_ADMIN`/`TUTOR` y no tiene grupos todavía) | requiere sesión |

Mobile-first: todos los formularios se diseñan primero para viewport angosto (< 480px), con breakpoints hacia arriba — es la base de usuario familiar (memoria del proyecto).

### Manejo de sesión (sin `localStorage`/`sessionStorage`)

- `AuthService` (Angular, `providedIn: 'root'`) guarda el `accessToken` en un `signal<string | null>` en memoria. Se pierde al recargar la página a propósito — por eso existe el refresh flow.
- Al bootear la app (`APP_INITIALIZER` o resolver en el shell), se llama `POST /api/auth/refresh` una vez (la cookie `dorado_refresh` viaja sola por ser `httpOnly`); si responde 200, se hidrata el `accessToken` en memoria y se redirige al shell; si 401, se queda en `/login`.
- `HttpInterceptor` (`authInterceptor`, funcional, `withInterceptors`): agrega `Authorization: Bearer <token>` a toda request hacia `/api/*` excepto las públicas listadas arriba. Si una respuesta es 401 y todavía no se reintentó, dispara `POST /api/auth/refresh` una vez y reintenta la request original; si el refresh también falla, limpia el signal y redirige a `/login`.
- Todas las llamadas HTTP van con `withCredentials: true` para que la cookie de refresh viaje.

### Guards

- `authGuard` (funcional, `CanActivateFn`): redirige a `/login` si no hay `accessToken` en memoria (después de intentar el refresh silencioso).
- `soloTutorGuard`: redirige a `/` si el `rol` decodificado del JWT es `USUARIO` (para rutas que en fases futuras son solo de tutor, ej. `/onboarding` de creación de grupo).

### Componentes de esta fase

- `RegistroOrganizacionPageComponent` — form reactivo (`nombre`, `emailContacto`, `password`), llama `POST /api/auth/organizaciones`, guarda token, redirige a `/onboarding`.
- `LoginPageComponent` — form (`identificador`, `password`), llama `POST /api/auth/login`, redirige a `/` (o `/onboarding` si aplica).
- `InvitacionPageComponent` — al montar, llama `GET /api/auth/invitaciones/:codigo`; si 404/410 muestra estado de error explícito (no un error genérico); si válida, muestra form de canje según `tipoInvitado` y llama `POST /api/auth/invitaciones/:codigo/canjear`.
- `ShellComponent` — layout raíz autenticado, usa `libs/shared-ui` para tokens de color/tipografía (aunque todavía no hay colores de zona que mostrar, se deja el layout listo).
- `OnboardingCrearGrupoPageComponent` — form (`nombre`, `timezone` con selector de zonas horarias comunes), llama `POST /api/identity/grupos`.

## Criterios de aceptación de esta fase

- [ ] Todo el tráfico de `app-web` pasa por `http://localhost:<puerto-gateway>/api/*`, nunca directo a `identity-service`.
- [ ] Flujo manual completo desde el navegador: registro de organización → onboarding (crear grupo) → generar invitación (vía Postman/curl a `/api/identity/grupos/:id/invitaciones`, todavía no hay UI de generación de invitaciones — eso es Fase 10) → abrir `/invitacion/:codigo` en una ventana nueva → canjear como Usuario → loguearse como ese Usuario.
- [ ] Refrescar la página en `/` no desloguea al usuario (el refresh silencioso funciona).
- [ ] `/api/billing/*` (o cualquier prefijo aún no implementado) responde 503, no 404 ni 500.
- [ ] Rate limiting verificado: 11 intentos de login en menos de un minuto desde la misma IP devuelven 429 en el intento 11.
- [ ] Servido `app-web` desde su propio puerto (4200) contra el Gateway (3000) — dos orígenes distintos incluso en local — el login y el refresh funcionan sin error de CORS en la consola del navegador, y la cookie `dorado_refresh` efectivamente se guarda (revisar en DevTools → Application → Cookies).

## Nota para Claude Code

El Gateway no tiene lógica de negocio ni base de datos. Si te encontrás queriendo agregar una tabla o una regla de negocio acá, esa lógica va en el servicio correspondiente, no en el Gateway.
