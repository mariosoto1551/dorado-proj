# Registro de ejecución — Fase 9: Notification & Audit Services

- **Estado**: PENDIENTE
- **Fecha de finalización**: —
- **Commit/rama**: —
- **Resumen de lo implementado**: —
- **Desviaciones del plan documentado** (si las hubo, y por qué): —
- **Verificación de criterios de aceptación** (copiado de `docs/phases/fase-09-notification-audit.md`):
  - [ ] Cada endpoint del "retrofit obligatorio" (Parte A) publica `AccionAdministrativaRegistrada` y aparece en `RegistroAuditoria` en segundos.
  - [ ] Marcar una notificación como leída no afecta las demás.
  - [ ] El badge de no leídas baja a 0 después de `leer-todas`.
  - [ ] `GET /audit/entidades/Usuario/:id` de un usuario descalificado muestra el evento `UsuarioDescalificado` con su motivo.
  - [ ] Ningún endpoint de `audit-service` permite escribir directamente.
- **Deuda técnica / pendientes conocidos**: verificar explícitamente que el retrofit a Identity/Activity/Scoring/Rewards (Fases 2, 5, 7, 8) se hizo completo — es fácil olvidar alguno de los endpoints listados en la Parte A.
- **Qué debería verificar la próxima sesión antes de construir sobre esta fase**: —
