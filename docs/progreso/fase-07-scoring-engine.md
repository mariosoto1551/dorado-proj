# Registro de ejecución — Fase 7: Scoring Engine (+ registro en Activity Catalog)

- **Estado**: PENDIENTE
- **Fecha de finalización**: —
- **Commit/rama**: —
- **Resumen de lo implementado**: —
- **Desviaciones del plan documentado** (si las hubo, y por qué): —
- **Verificación de criterios de aceptación** (copiado de `docs/phases/fase-07-scoring-engine.md`):
  - [ ] Flujo completo (completar + no-hizo + conducta) da el puntaje correcto en `GET .../puntaje`.
  - [ ] Editar `valorPuntos` de una Actividad después de tener registros no cambia el puntaje ya calculado (snapshot).
  - [ ] Forzar cierre de Sección con `evaluarUmbralesEn=SOLO_AL_CIERRE_SECCION` genera `ResultadoSeccion` por usuario y publica `ZonaAlcanzada esEvaluacionFinal=true`.
  - [ ] Usuario descalificado en Sección N no sigue descalificado en N+1 sin acción manual.
  - [ ] `POST .../corregir` sobre Sección `CERRADA` funciona y no altera el `ResultadoSeccion` ya escrito.
  - [ ] Reentrega de un evento de RabbitMQ no duplica `EventoPuntos` (verificar `EventoProcesado`).
- **Deuda técnica / pendientes conocidos**: —
- **Qué debería verificar la próxima sesión antes de construir sobre esta fase**: que `activity-service` (Fase 5) efectivamente incorporó los endpoints de registro nuevos de esta fase — quedan documentados acá pero viven físicamente en el repo de `activity-service`, no en `scoring-service`.
