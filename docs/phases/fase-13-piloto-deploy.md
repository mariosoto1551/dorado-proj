# Fase 13 — Piloto y despliegue inicial

> Objetivo: desplegar la plataforma real y dar de alta "Destino: Dorado" como primer tenant. Basado en `proyecto-dorado-plan-desarrollo-general.md` sección 14.

## Prerrequisitos
Fase 12 completa (QA/hardening en verde).

## Bloqueante real antes de arrancar esta fase

Los tres datos marcados como pendientes en `ADR-00` sección 9 **sí bloquean esta fase específicamente** (no las anteriores): catálogo real de Actividades/Conductas de Destino:Dorado, y los `username` de los 3 Usuarios miembro de la familia. Confirmar estos datos con José antes de ejecutar el seed real — no inventarlos.

Datos que **ya están confirmados** y se usan tal cual (`arquitectura-base.md` 4.6, `memory.md`):
- Umbrales: Rojo (<10 pts), Amarillo (10–109), Verde (110–209), Dorado (210+).
- `sesionesPorSeccion = 6` (lunes a sábado), `cronAperturaSesion = "0 0 * * 1-6"`, `cronAperturaSeccion = "0 0 * * 1"`, `modo = AUTOMATICO`, `evaluarUmbralesEn = SOLO_AL_CIERRE_SECCION`.
- 2 Tutores (padres) + 3 Usuarios (hijos).

## Despliegue de infraestructura

| Componente | Plataforma | Notas |
|---|---|---|
| `identity-service`, `billing-service`, `activity-service`, `session-service`, `scoring-service`, `rewards-service`, `notification-service`, `audit-service`, `gateway` | Railway o Render (elegir una sola plataforma para los 9, no mezclar) | Un servicio por contenedor, variables de entorno por servicio según su `README.md` de Fase 12. |
| `app-web` | Vercel o Netlify | Build Angular estático, apunta a `GATEWAY_PUBLIC_URL` vía variable de entorno de build. |
| `public-site` | Vercel o Netlify | Build Astro estático. |
| Postgres (8 bases) | Railway Postgres o Supabase | Puede ser una instancia gestionada con 8 bases (igual que en local) o 8 instancias separadas — decisión de costo, no de arquitectura (la arquitectura ya asume bases independientes lógicamente). |
| RabbitMQ | CloudAMQP (free tier) u otra alternativa gestionada compatible | Confirmar que el free tier soporta exchanges/colas suficientes para 9 servicios antes de comprometerse. |

No se usa Kubernetes en esta fase (`arquitectura-base.md` sección 7: reevaluar solo si el volumen lo justifica — un solo tenant piloto no lo justifica).

## Variables de entorno de producción

Cada servicio necesita, como mínimo (ver `README.md` de Fase 12 para la lista completa por servicio): `DATABASE_URL`, `RABBITMQ_URL`, `GATEWAY_INTERNAL_SECRET`, `JWT_PUBLIC_KEY` (todos los servicios) / `JWT_PRIVATE_KEY` (solo Identity), `<SERVICIO>_INTERNAL_URL` de sus dependencias. Ninguna de estas se comitea al repo — se cargan desde el panel de la plataforma de hosting. `.env.example` en la raíz documenta los nombres sin valores reales.

## Alta del tenant piloto

1. Registrar la Organización "Destino: Dorado" vía `public-site` en producción (flujo real, no seed directo en base — sirve como prueba final del flujo público).
2. Crear el Grupo familiar, configurar Sesión/Sección con los valores confirmados arriba.
3. Cargar el catálogo real de Actividades/Conductas (una vez confirmado por José).
4. Configurar los Umbrales de zona confirmados.
5. Generar invitaciones para los 2 Tutores adicionales (si José no es el único admin) y los 3 Usuarios; canjearlas con los `username` reales confirmados.
6. Cargar el catálogo de Recompensas real por zona.

## Observación post-alta

- Revisar logs estructurados (correlación, Fase 1) durante la primera semana real de uso para detectar errores silenciosos.
- No abrir el registro público (`/registro` de `public-site`) a otras organizaciones todavía — aunque el endpoint ya es público y funcional, la decisión de abrir la plataforma a más clientes es posterior y depende de resolver los pendientes de Fase 14 (privacidad de menores, en particular, si van a sumarse organizaciones con datos de menores fuera del círculo de confianza familiar directo).

## Criterios de aceptación de esta fase

- [ ] Los 9 servicios + Gateway + 2 frontends responden en producción y pasan su healthcheck.
- [ ] El flujo completo de "Destino: Dorado" corre en producción de punta a punta al menos una semana real (un ciclo completo de Sección) sin intervención manual de emergencia.
- [ ] Los datos reales (actividades, conductas, usernames) están cargados — no queda seed genérico de Fase 0 en el tenant piloto.

## Nota para Claude Code

Si al llegar a esta fase José todavía no confirmó el catálogo real de actividades/conductas o los usernames, no los inventes para "avanzar" — esperá la confirmación. Cargar datos ficticios en el tenant piloto real generaría trabajo de limpieza innecesario.
