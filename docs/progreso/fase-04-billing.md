# Registro de ejecución — Fase 4: Billing/Subscription

- **Estado**: PENDIENTE
- **Fecha de finalización**: —
- **Commit/rama**: —
- **Resumen de lo implementado**: —
- **Desviaciones del plan documentado** (si las hubo, y por qué): —
- **Verificación de criterios de aceptación** (copiado de `docs/phases/fase-04-billing.md`):
  - [ ] Al registrar una organización nueva, aparece su fila en `Suscripcion` (plan FREE) vía evento, no polling.
  - [ ] Crear un 3er Grupo en una organización FREE (límite 1) devuelve 403 con el código de error documentado.
  - [ ] Cambiar manualmente `Suscripcion.planId` a PRO hace que el próximo login traiga `plan: 'PRO'` y los límites se levanten.
  - [ ] Si se detiene `billing-service`, el login sigue funcionando (fallback a FREE), no da 500.
- **Deuda técnica / pendientes conocidos**: confirmar los límites numéricos del plan Free (puestos como default en la spec, no vienen de los docs fuente) antes de Fase 13.
- **Qué debería verificar la próxima sesión antes de construir sobre esta fase**: —
