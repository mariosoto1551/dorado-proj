# Fase 12 — Integración, QA y hardening

> Objetivo: confirmar que las reglas no-negociables de la arquitectura realmente se sostienen end-to-end antes de poner un tenant real. Basado en `proyecto-dorado-plan-desarrollo-general.md` sección 13.

## Prerrequisitos
Fases 0–11 completas (los 9 servicios + Gateway + `app-web` + `public-site` funcionando juntos).

## 1. E2E del flujo completo multi-tenant

Suite de pruebas end-to-end (Playwright recomendado, corre contra el stack completo levantado vía `docker-compose`) que cubre, en una sola corrida:

1. Registro de una Organización nueva desde `public-site`.
2. Login en `app-web`, creación de un Grupo, configuración de Sesión/Sección (modo manual, para no depender de tiempo real).
3. Creación de Actividades, Conductas, Umbrales, Recompensas.
4. Generación de invitación, canje como Usuario en una sesión de navegador separada.
5. Ciclo semanal completo: iniciar Sección → completar/no-hacer actividades → registrar conductas → forzar evaluación → forzar cierre.
6. Verificar puntaje y zona resultante coinciden con el cálculo manual esperado (definir el escenario con números conocidos de antemano, no verificar "que dé algo").
7. Selección/sorteo de recompensa, marcado como entregada.
8. Verificar que las notificaciones esperadas del flujo llegaron y que el timeline de auditoría las registra.

## 2. Aislamiento entre tenants

- Crear **dos** Organizaciones distintas (vía el mismo flujo de arriba) y verificar explícitamente, para cada servicio, que un JWT de la Organización A nunca puede leer ni escribir datos de la Organización B — probar tanto vía API directa (headers manipulados) como vía UI.
- Caso específico a cubrir: un `TUTOR` de un Grupo dentro de una Organización no puede ver Grupos de otra Organización aunque adivine el `grupoId` (UUID) por fuerza bruta en la URL.
- Verificar que el `PrismaTenantMiddleware` (`ADR-00` sección 2) efectivamente bloquea cualquier query que no incluya el filtro de tenant — idealmente con un test que intente deliberadamente una query sin el filtro y confirme que el middleware la intercepta/rechaza, no solo que "en la práctica no pasó".

## 3. Reglas de puntaje inmutable y Secciones cerradas

- Test que edita el `valorPuntos` de una Actividad después de tener registros, y confirma que los `EventoPuntos` ya existentes no cambiaron.
- Test que intenta (vía API directa) hacer un `UPDATE`/`DELETE` sobre una fila de `EventoPuntos` o `RegistroAuditoria` — confirmar que no existe ningún endpoint que lo permita (revisión de código, no solo test funcional).
- Test de corrección post-cierre (`POST /scoring/eventos-puntos/:id/corregir` sobre una Sección `CERRADA`): confirma que se crea una fila nueva con `corregidoDeId` seteado y que el `ResultadoSeccion` original no se tocó.
- Test que confirma que no se puede completar/registrar actividad-conducta contra una Sesión que no está `ABIERTA`.

## 4. Carga/performance básica del bus de eventos

- Prueba simple (no un benchmark exhaustivo): publicar ~500 eventos de registro de actividad en ráfaga contra `activity-service` y confirmar que `scoring-service` los procesa todos sin pérdidas ni duplicados (usando la tabla `EventoProcesado` para verificar conteo exacto) en un tiempo razonable (definir un umbral de referencia, ej. bajo 60s, ajustable — no es un SLA productivo, es una señal de humo).
- Confirmar que la Dead Letter Queue (`ADR-00` sección 5) efectivamente recibe un mensaje después de forzar 3 fallos de procesamiento (ej. apagando temporalmente la base de un consumidor).

## 5. Documentación de despliegue por servicio

Cada `apps/<servicio>` tiene un `README.md` con: variables de entorno requeridas (tabla, con cuáles son secretas), comando de build, comando de start, healthcheck, dependencias externas (a qué otros servicios llama, a qué colas se suscribe). Esto es insumo directo de Fase 13.

## Criterios de aceptación de esta fase

- [ ] La suite E2E completa corre en CI (ampliar el workflow de Fase 1) y pasa en verde de forma reproducible (no flaky — si algo es flaky, arreglarlo antes de continuar a Fase 13).
- [ ] El test de aislamiento entre tenants está explícitamente documentado como "test de seguridad", no mezclado con tests funcionales genéricos.
- [ ] Todos los `README.md` de despliegue existen y están completos.
- [ ] No hay ningún hallazgo abierto de la lista de puntos 1–4 sin resolver antes de pasar a Fase 13.

## Nota para Claude Code

Esta fase es de verificación, no de features nuevas. Si un test revela que una regla de negocio de una fase anterior no se cumple, el fix va en el servicio de esa fase (no acá) — esta fase documenta y prueba, no rediseña.
