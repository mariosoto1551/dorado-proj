# Registro de ejecución — Fase 3: Gateway mínimo + frontend autenticado

- **Estado**: PENDIENTE
- **Fecha de finalización**: —
- **Commit/rama**: —
- **Resumen de lo implementado**: —
- **Desviaciones del plan documentado** (si las hubo, y por qué): —
- **Verificación de criterios de aceptación** (copiado de `docs/phases/fase-03-gateway-frontend-auth.md`):
  - [ ] Todo el tráfico de `app-web` pasa por `/api/*` del Gateway, nunca directo a `identity-service`.
  - [ ] Flujo manual completo desde el navegador (registro → onboarding → invitación → canje → login).
  - [ ] Refrescar la página en `/` no desloguea (refresh silencioso funciona).
  - [ ] `/api/billing/*` (o prefijo aún no implementado) responde 503, no 404 ni 500.
  - [ ] Rate limiting verificado: 11 intentos de login en <1 min devuelven 429 en el intento 11.
  - [ ] CORS configurado explícito (no wildcard) entre `app-web`/`public-site` y el Gateway; cookie `dorado_refresh` se guarda correctamente en el navegador entre orígenes distintos.
- **Deuda técnica / pendientes conocidos**: —
- **Qué debería verificar la próxima sesión antes de construir sobre esta fase**: —
