# Fase 6 — Session/Section Service

> Objetivo: máquina de estados de Sesión/Sección, modo manual y automático. Basado en `proyecto-dorado-plan-desarrollo-general.md` sección 7 y `proyecto-dorado-arquitectura-base.md` sección 4.3.

## Prerrequisitos
Fase 5 completa (Activity Catalog CRUD, sin registro todavía). Session/Section no depende funcionalmente de Activity Catalog — se puede desarrollar en paralelo si hace falta, pero el plan general las secuencia una después de la otra.

## Modelo de datos (`session-service`, base `session_db`)

```prisma
enum ModoSesion {
  MANUAL
  AUTOMATICO
}

enum EvaluarUmbralesEn {
  CADA_SESION
  SOLO_AL_CIERRE_SECCION
}

enum EstadoSeccion {
  ABIERTA
  EVALUACION
  CERRADA
}

enum EstadoSesion {
  ABIERTA
  CERRADA
}

model ConfiguracionSesion {
  grupoId               String   @id // 1 config por Grupo
  organizacionId        String
  modo                  ModoSesion @default(MANUAL)
  cronAperturaSesion    String?    // cron, hora del Grupo. Obligatorio si modo=AUTOMATICO. Ej Destino:Dorado: "0 0 * * 1-6" (00:00 lunes a sábado)
  sesionesPorSeccion    Int        @default(1)
  cronAperturaSeccion   String?    // cron, hora del Grupo: cuándo cierra la Sección actual (si seguía en EVALUACION) y abre la siguiente. Obligatorio si modo=AUTOMATICO. Ej Destino:Dorado: "0 0 * * 1" (lunes 00:00)
  evaluarUmbralesEn     EvaluarUmbralesEn @default(SOLO_AL_CIERRE_SECCION)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

model Seccion {
  id             String        @id @default(uuid())
  organizacionId String
  grupoId        String
  numero         Int           // secuencial por grupo, empieza en 1
  estado         EstadoSeccion @default(ABIERTA)
  fechaInicio    DateTime      @default(now())
  fechaFin       DateTime?     // se completa al pasar a CERRADA
  sesiones       Sesion[]
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@unique([grupoId, numero])
  @@index([organizacionId])
  @@index([grupoId])
}

model Sesion {
  id             String       @id @default(uuid())
  seccionId      String
  seccion        Seccion      @relation(fields: [seccionId], references: [id])
  organizacionId String
  grupoId        String
  numero         Int          // secuencial dentro de la Sección, empieza en 1
  estado         EstadoSesion @default(ABIERTA)
  fechaInicio    DateTime     @default(now())
  fechaFin       DateTime?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([seccionId, numero])
  @@index([organizacionId])
  @@index([grupoId])
}
```

## Máquina de estados

```
Sección:  ABIERTA ──(sesionesPorSeccion alcanzado, o forzado)──▶ EVALUACION ──(cronAperturaSeccion, o forzado)──▶ CERRADA
Sesión:   ABIERTA ──(cronAperturaSesion siguiente, o forzado)──▶ CERRADA
```

- Solo puede haber una Sección no-`CERRADA` (`ABIERTA` o `EVALUACION`) por Grupo a la vez.
- Solo puede haber una Sesión `ABIERTA` por Sección a la vez.
- Al pasar una Sección a `CERRADA`: si `ConfiguracionSesion.modo = AUTOMATICO` para ese Grupo, se crea automáticamente la Sección siguiente (`numero + 1`, `estado = ABIERTA`) junto con su primera Sesión (`numero = 1`, `estado = ABIERTA`), en la misma operación. Si `modo = MANUAL`, no se crea nada — un Tutor debe llamar `POST /session/grupos/:grupoId/secciones/iniciar` explícitamente.

## Scheduler (modo automático)

Job cada 1 minuto (`@nestjs/schedule`, `@Cron('* * * * *')`) que recorre todos los Grupos con `ConfiguracionSesion.modo = AUTOMATICO`. Para cada uno, convierte "ahora" a `Grupo.timezone` (el dato de timezone se obtiene de Identity vía `GET /internal/identity/grupos/:id` — llamada síncrona interna, cachear en memoria del proceso por 5 minutos para no golpear Identity cada minuto) y evalúa, en este orden:

1. **¿Matchea `cronAperturaSesion` Y la Sección actual está `ABIERTA` Y no se alcanzó `sesionesPorSeccion`?** → cerrar la Sesión abierta actual (si hay), publicar `SesionCerrada`; si `evaluarUmbralesEn = CADA_SESION`, ese evento es justamente la señal para que Scoring evalúe (Scoring lo consume, Fase 7). Abrir Sesión `numero + 1`, publicar `SesionAbierta`.
2. **¿La Sesión recién cerrada era la número `sesionesPorSeccion`?** → la Sección pasa a `EVALUACION` (no se abre Sesión nueva), publicar `SeccionEntroEvaluacion`.
3. **¿Matchea `cronAperturaSeccion`?** → si la Sección actual está en `EVALUACION` (caso esperado) o todavía `ABIERTA` (caso de seguridad, ej. mal configurada), cerrarla: `estado = CERRADA`, `fechaFin = now`, publicar `SeccionCerrada`. Crear la Sección siguiente + su primera Sesión (ver regla de arriba), publicar `SeccionAbierta` y `SesionAbierta`.

Parseo de cron: librería `cron-parser`, comparación por igualdad de minuto (no por rango) para evitar dobles disparos — guardar en memoria (o en una tabla `UltimoTickProcesado(grupoId, minuto)`) el último minuto procesado por Grupo para hacerlo idempotente ante reinicios del proceso dentro del mismo minuto.

## Endpoints

Todos bajo `/session/*`.

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| PUT | `/session/grupos/:grupoId/configuracion` | TUTOR asignado, ORG_ADMIN | Upsert de `ConfiguracionSesion`. Valida que si `modo=AUTOMATICO`, `cronAperturaSesion` y `cronAperturaSeccion` sean cron válidos y no estén vacíos. |
| GET | `/session/grupos/:grupoId/configuracion` | cualquier rol del grupo | Lectura. |
| POST | `/session/grupos/:grupoId/secciones/iniciar` | TUTOR asignado, ORG_ADMIN | Solo si `modo=MANUAL` y no hay Sección `ABIERTA`/`EVALUACION` vigente. Crea Sección + primera Sesión. Publica `SeccionAbierta`, `SesionAbierta`. |
| GET | `/session/grupos/:grupoId/secciones` | cualquier rol del grupo | Lista, filtro `?estado=`. |
| GET | `/session/grupos/:grupoId/secciones/actual` | cualquier rol del grupo | La Sección no-`CERRADA` más reciente, o `null`. |
| GET | `/session/secciones/:id` | cualquier rol del grupo | Detalle + sus Sesiones. |
| POST | `/session/secciones/:id/sesiones/abrir-siguiente` | TUTOR asignado, ORG_ADMIN | Solo `modo=MANUAL`, Sección `ABIERTA`, no se alcanzó `sesionesPorSeccion`. Cierra la Sesión actual si estaba abierta, abre la siguiente. |
| POST | `/session/secciones/:id/sesiones/:sesionId/forzar-cierre` | TUTOR asignado, ORG_ADMIN | Cierra antes de tiempo, en cualquiera de los dos modos ("forzar cierre/extensión manual" de `arquitectura-base.md` 4.3). Publica `SesionCerrada`. |
| POST | `/session/sesiones/:id/extender` | TUTOR asignado, ORG_ADMIN | `{ minutosAdicionales }`. Pospone el autocierre de esa Sesión (relevante solo en modo automático). |
| POST | `/session/secciones/:id/forzar-evaluacion` | TUTOR asignado, ORG_ADMIN | Fuerza `ABIERTA → EVALUACION` aunque no se agotaron las sesiones. Cierra la Sesión abierta si la había. Publica `SeccionEntroEvaluacion`. |
| POST | `/session/secciones/:id/cerrar` | TUTOR asignado, ORG_ADMIN | Fuerza a `CERRADA` desde `EVALUACION` (o desde `ABIERTA` en caso de emergencia). Publica `SeccionCerrada`. Aplica la misma regla de auto-creación de la siguiente Sección si `modo=AUTOMATICO`. |

## Endpoint interno

| Método | Ruta | Protección | Descripción |
|---|---|---|---|
| GET | `/internal/session/grupos/:grupoId/secciones/actual` | `x-internal-secret` | Igual que el endpoint público equivalente, pero para llamadas servicio-a-servicio (sin JWT de usuario). Lo usa `activity-service` desde Fase 7 para saber en qué Sesión/Sección registrar una actividad completada. |
| GET | `/internal/session/grupos/:grupoId/configuracion` | `x-internal-secret` | Igual que el endpoint público equivalente. Lo usa `scoring-service` desde Fase 7 para saber si `evaluarUmbralesEn = CADA_SESION`. |
| GET | `/internal/health` | ninguna | Health check para el Gateway. |

## Eventos publicados

`SesionAbierta`, `SesionCerrada`, `SeccionAbierta`, `SeccionEntroEvaluacion`, `SeccionCerrada`. Ninguno consumido en esta fase.

## Reglas de negocio

- No se puede iniciar una Sección nueva (manual) si ya hay una `ABIERTA` o `EVALUACION` en ese Grupo — 409.
- Todas las comparaciones de tiempo (cron, deadlines de Fase 5) se hacen en `Grupo.timezone`, nunca en UTC del servidor directamente (se convierte para persistir).
- El ejemplo de `arquitectura-base.md` 4.6 (Destino:Dorado) debe poder configurarse exactamente así: `modo=AUTOMATICO`, `cronAperturaSesion="0 0 * * 1-6"`, `sesionesPorSeccion=6`, `cronAperturaSeccion="0 0 * * 1"`, `evaluarUmbralesEn=SOLO_AL_CIERRE_SECCION` — validar este caso puntual como test de aceptación.

## Criterios de aceptación de esta fase

- [ ] Modo manual probado de punta a punta: iniciar Sección → abrir/cerrar Sesiones una por una → forzar evaluación → cerrar Sección → confirmar que en modo `MANUAL` NO se crea la siguiente Sección sola.
- [ ] Modo automático probado con un cron de prueba corto (ej. cada 2 minutos en vez de diario) para no esperar días reales: confirmar que el scheduler abre/cierra Sesiones y Secciones solo, en el orden correcto, sin duplicar disparos.
- [ ] El caso Destino:Dorado (cron real diario) queda documentado como configuración de ejemplo, sin necesidad de correr días completos en test — se testea con la lógica de matching de cron, no con tiempo real transcurrido.
- [ ] `forzar-cierre` y `extender` funcionan en ambos modos.

## Nota para Claude Code

Este servicio no sabe nada de puntos, actividades ni zonas — su única responsabilidad es el ciclo de vida de Sesión/Sección. Si te encontrás calculando puntaje acá, es un error de capa: eso es Scoring Engine (Fase 7), que va a consumir los eventos que este servicio publica.
