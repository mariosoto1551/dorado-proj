# Registro de ejecución — Fase 2: Identity & Access Service

- **Estado**: PENDIENTE
- **Fecha de finalización**: —
- **Commit/rama**: —
- **Resumen de lo implementado**: —
- **Desviaciones del plan documentado** (si las hubo, y por qué): —
- **Verificación de criterios de aceptación** (copiado de `docs/phases/fase-02-identity.md`):
  - [ ] Flujo completo probado manualmente: registro → crear grupo → generar invitación → canjear como USUARIO → login → `GET /identity/me` correcto.
  - [ ] RabbitMQ management UI muestra los 4 eventos publicándose durante ese flujo.
  - [ ] Un TUTOR sin `TutorGrupo` hacia un Grupo recibe 403 en `GET /identity/grupos/:grupoId/usuarios` de ese grupo.
  - [ ] Tests unitarios de los guards de `libs/shared-auth` (JWT inválido/expirado/rol insuficiente) y de invitación vencida.
- **Deuda técnica / pendientes conocidos**: —
- **Qué debería verificar la próxima sesión antes de construir sobre esta fase**: —
