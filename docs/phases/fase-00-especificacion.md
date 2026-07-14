# Fase 0 — Especificación y documentación

> Objetivo: dejar cerrado en `docs/` todo lo que las fases de código dan por sentado. No se escribe código de servicios en esta fase (sí se puede crear el repo vacío). Basado en `proyecto-dorado-plan-desarrollo-general.md` sección 1.

## Prerrequisitos
Ninguno. Es la primera fase.

## Qué queda resuelto en esta fase (y dónde)

| Entregable pedido por el plan general | Dónde vive en este set de documentos |
|---|---|
| ADRs de decisiones (multi-tenancy, JWT, RabbitMQ, proveedor de pagos) | `docs/architecture/ADR-00-decisiones-fundacionales.md` |
| Catálogo de eventos de dominio (`libs/shared-events`) | `docs/architecture/event-catalog.md` |
| DTOs compartidos (`libs/shared-types`) | `docs/architecture/shared-types.md` |
| Esquema de datos por servicio (Prisma/ERD) | **Decisión de organización**: en vez de un documento aparte, el borrador de schema Prisma de cada servicio vive dentro del archivo de fase que construye ese servicio (ej. el schema de Identity está en `fase-02-identity.md`). Motivo: Claude Code ejecuta una fase a la vez y necesita todo el contexto de esa fase en un solo archivo, sin saltar entre documentos. |
| Contratos de API (rutas mínimas de MVP) | Misma lógica: cada `fase-XX-*.md` incluye la tabla de endpoints del servicio que construye. |
| Alcance MVP vs. post-MVP | Ver tabla abajo |
| Seed data de ejemplo (genérico, no el de Destino:Dorado real) | Ver sección "Seed data genérica" abajo. El seed real de Destino:Dorado es Fase 13. |
| Specs de privacidad/consentimiento de menores | Sigue pendiente — ver `ADR-00` sección 9. No bloquea Fases 0–13. |

## Alcance MVP (Fases 0–9 backend + Fase 10 frontend) vs. post-MVP

**Entra en el MVP** (esto es lo que Claude Code debe construir sin agregar nada extra):
- Las 9 fases de servicios backend (2–9, más gateway en 3) con exactamente los endpoints listados en cada archivo de fase.
- `app-web` completo (Fase 10): dashboard tutor, dashboard usuario, panel de evaluación de Sección, notificaciones in-app.
- `public-site` básico (Fase 11): landing + registro de organización, sin SEO avanzado más allá de SSR/SSG estándar de Astro.
- Billing con asignación de plan manual/flag (sin pasarela de pago real).
- Alta de "Destino: Dorado" como primer tenant (Fase 13).

**Post-MVP (Fase 14, no construir antes)**:
- White-label real (logo/colores por organización aplicados dinámicamente en el frontend).
- Reportes/analíticas avanzadas.
- Integración de pasarela de pago real.
- Cumplimiento formal de privacidad de menores.
- Panel de `PLATFORM_ADMIN` (gestión de organizaciones a nivel plataforma).
- Cualquier variante de Kubernetes/infra avanzada.
- El flujo de "propuesta de actividad por Usuario" señalado como punto suelto en `ADR-00` sección 10 (solo si confirmás que lo querés).

## Seed data genérica (para desarrollo, Fases 1–12)

Cada servicio que la necesite (Activity Catalog, Session/Section, Scoring) trae un script `prisma/seed.ts` con datos ficticios suficientes para probar el flujo completo sin depender del seed real de Destino:Dorado:

- 1 Organización de prueba (`Organización Demo`), 1 Grupo (`Grupo Demo`, timezone `America/La_Paz`).
- 1 Tutor `ORG_ADMIN` (`admin@demo.test` / password de prueba documentada en `.env.example`).
- 3 Usuarios de prueba (`usuario1`, `usuario2`, `usuario3`, mismo Grupo).
- 4 Actividades (2 opcionales, 2 obligatorias) y 2 Conductas (1 buena, 1 mala) de ejemplo genérico (ej. "Ordenar el cuarto", "Tarea del colegio") — **no** los nombres reales de Destino:Dorado, esos son Fase 13.
- 4 `UmbralZona` de ejemplo con los mismos cortes que Destino:Dorado (Rojo <10, Amarillo 10–109, Verde 110–209, Dorado 210+) porque son valores neutros, reutilizables como default razonable — no hace falta inventar otros solo por diferenciarlos del piloto.

## Estructura de `docs/` a crear en el repo real

```
docs/
├── architecture/
│   ├── ADR-00-decisiones-fundacionales.md
│   ├── event-catalog.md
│   └── shared-types.md
└── phases/
    ├── fase-00-especificacion.md   (este archivo)
    ├── fase-01-monorepo.md
    ├── fase-02-identity.md
    ├── fase-03-gateway-frontend-auth.md
    ├── fase-04-billing.md
    ├── fase-05-activity-catalog.md
    ├── fase-06-session-section.md
    ├── fase-07-scoring-engine.md
    ├── fase-08-rewards.md
    ├── fase-09-notification-audit.md
    ├── fase-10-frontend-completo.md
    ├── fase-11-public-site.md
    ├── fase-12-qa-hardening.md
    ├── fase-13-piloto-deploy.md
    └── fase-14-post-mvp.md
```

## Criterios de aceptación de esta fase

- [ ] Los tres archivos de `docs/architecture/` existen en el repo tal cual están acá (copiados desde este set de planificación).
- [ ] Los quince archivos de `docs/phases/` existen en el repo.
- [ ] `README.md` raíz del monorepo enlaza a `docs/architecture/ADR-00-decisiones-fundacionales.md` como punto de entrada obligatorio de lectura antes de tocar código.
- [ ] No se escribió código de aplicación todavía (Fase 1 es la primera con código).

## Nota para Claude Code

No supongas ningún nombre de campo, endpoint o evento que no esté en `docs/architecture/` o en el archivo de la fase que estás ejecutando. Si te falta un dato para continuar (ej. un valor de configuración, un nombre de variable de entorno), preguntá antes de inventarlo — los documentos de este proyecto están escritos para no dejar nada implícito; si encontrás un hueco, probablemente sea un error de la documentación, no algo para decidir sobre la marcha.
