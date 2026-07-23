# Fase 14 — Ítem 1: White-label real

> Sub-fase del roadmap post-MVP (`docs/phases/fase-14-post-mvp.md`, ítem 1). Planificada con José el 2026-07-22. Como el resto de `docs/phases/`, este archivo es la especificación decidida — no se edita retroactivamente; las desviaciones de ejecución van en `docs/progreso/fase-14-post-mvp.md`.

## Objetivo

Que una Organización con plan Pro pueda aplicar su **logo** y su **color de marca** a `app-web`, reemplazando el logo/acento por defecto para todos los principales (tutores y usuarios) de esa organización. Es la materialización real del entitlement `whiteLabel` que existe desde Fase 4 pero que hasta ahora no tenía efecto.

## Alcance

**Dentro**:
- Campos de branding en `Organizacion` (`identity-service`).
- Endpoint de lectura del branding (cualquier principal de la org) y de escritura (solo `ORG_ADMIN`, gated por `whiteLabel`).
- Aplicación dinámica en `app-web`: color de marca (re-tematiza los tokens `--color-marca-*`) y logo en la topbar.
- Pantalla de administración del branding en el área tutor.

**Fuera (a propósito)**:
- `public-site` personalizado por organización (el ítem del roadmap lo marca opcional; queda para otra sub-fase si se decide).
- Almacenamiento de archivos / subida de imágenes. **Decisión con José (2026-07-22): el logo se referencia por URL externa** (el admin pega el link a una imagen ya hosteada). No se monta object storage — es coherente con el patrón de avatares del proyecto (IDs, no archivos) y evita infra nueva en una mini-fase post-MVP.
- Tipografías/fuentes personalizadas. Solo color + logo.
- Los colores de **zona** no se tocan: siguen viniendo de scoring por Grupo (`UmbralZona.colorHex`). White-label es la paleta de **marca** (acento/CTA), que es ortogonal a las zonas.

## Prerrequisitos

- Entitlement `whiteLabel` en billing (Fase 4) — existe.
- `BillingClientService` en identity para resolver entitlements — existe (`resolveEntitlements`).
- Tokens `--color-marca-*` en `libs/shared-ui/src/theme.css` y utilidades Tailwind v4 que los referencian en runtime — existen (Fase 10/11).

## Modelo de datos (`identity-service`)

Tres columnas **nullable** en `Organizacion` (migración retro-compatible; una organización preexistente queda sin branding y usa los defaults de `theme.css`):

| Campo | Tipo | Nota |
|---|---|---|
| `logoUrl` | `String?` | URL absoluta a una imagen (http/https). Máx. 2048 chars. |
| `colorPrimario` | `String?` | Hex `#RRGGBB`. Se usa como base para derivar la escala `--color-marca-50..900`. |
| `colorAcento` | `String?` | Hex `#RRGGBB`. Opcional; si es null se deriva del primario. Reservado para un segundo acento; en esta sub-fase la UI solo consume `colorPrimario`. |

Migración escrita a mano (mismo criterio que el ítem 8: puede no haber Postgres levantado en la sesión que la escribe). Debe aplicarse con `prisma migrate deploy`/`dev` antes de correr el servicio.

## Contrato (shared-types)

```ts
export interface BrandingOrganizacionDto {
  nombre: string;
  logoUrl: string | null;
  colorPrimario: string | null;   // hex #RRGGBB
  colorAcento: string | null;     // hex #RRGGBB
}

export interface ActualizarBrandingRequest {
  logoUrl?: string | null;        // null explícito = limpiar
  colorPrimario?: string | null;
  colorAcento?: string | null;
}
```

Se documentan en `docs/architecture/shared-types.md` (regla del repo: los DTOs compartidos se anotan ahí primero).

## Endpoints (`identity-service`)

### `GET /identity/mi-organizacion/branding`
- Auth: cualquier principal autenticado de la org (tutor **o** usuario) — `TenantContextGuard` sin `@Roles`. El usuario necesita leerlo para que su app también quede tematizada.
- Sin gate por plan: leer el branding siempre está permitido (si la org no es Pro, los campos vienen en `null` porque nunca se pudieron setear).
- Devuelve `BrandingOrganizacionDto` de la organización del JWT.

### `PUT /identity/mi-organizacion/branding`
- Auth: solo `ORG_ADMIN`.
- **Gate**: consulta `entitlements.features.whiteLabel` vía `BillingClientService`. Si `false` → `403 WHITE_LABEL_NO_DISPONIBLE`. Si billing no responde, **fail-closed** (403) — a diferencia de los chequeos de *límite* (que hacen fail-open), acá negar de más es lo seguro: no habilitar una feature de pago por una caída de billing.
- Validación:
  - `logoUrl`: si viene (no null), string http(s) válida, ≤ 2048 chars → si no, `400`.
  - `colorPrimario`/`colorAcento`: si vienen (no null), hex `#RRGGBB` (regex `/^#[0-9a-fA-F]{6}$/`) → si no, `400`.
  - `null` explícito limpia el campo; campo ausente lo deja como estaba (patch parcial, mismo criterio que `editarGrupo`).
- Emite `AccionAdministrativaRegistrada` (`accion: 'BRANDING_ACTUALIZADO'`, `entidadTipo: 'Organizacion'`, snapshot antes/después) — retrofit de auditoría Fase 9.
- Devuelve el `BrandingOrganizacionDto` resultante.

## Frontend (`app-web`)

### `BrandingService` (nuevo, `core/branding/`)
- `cargar()`: `GET /identity/mi-organizacion/branding` y aplica:
  - **Color**: si `colorPrimario` no es null, deriva la escala completa `--color-marca-50..900` (mezcla con blanco para los pasos claros, con negro para los oscuros — helper local, sin dependencia) y la escribe en `document.documentElement.style`. Tailwind v4 re-tematiza en vivo porque sus utilidades referencian esas variables. Si es null, remueve los overrides (vuelven los defaults de `theme.css`).
  - **Logo**: expone `logoUrl` como signal para que el shell lo muestre.
- Se invoca al entrar al shell autenticado (una vez que hay sesión). Al hacer logout se limpian los overrides.

### Pantalla "Marca" (área tutor, solo `ORG_ADMIN`)
- Ruta `/marca`, item de nav solo-admin (mismo patrón que "Tutores").
- Lee `GET /billing/mi-organizacion` (ya existe, ORG_ADMIN) para conocer `plan.whiteLabel`:
  - Si `false`: estado bloqueado con aviso "Disponible en el plan Pro" — el formulario se muestra deshabilitado, sin permitir guardar (el backend igual lo rechazaría; esto es UX).
  - Si `true`: formulario con color picker (`colorPrimario`) + campo de URL de logo, con vista previa en vivo. Guarda vía `PUT` y refresca el `BrandingService`.

## Criterios de aceptación

- [ ] Organización preexistente (sin branding) arranca con los colores/logo por defecto — nada se rompe (migración retro-compatible).
- [ ] `PUT branding` con plan FREE → `403 WHITE_LABEL_NO_DISPONIBLE`; con Pro y payload válido → 200 y persiste.
- [ ] `PUT branding` con hex inválido o URL no-http → `400`.
- [ ] `null` explícito en un campo lo limpia; campo ausente no lo toca.
- [ ] `GET branding` es legible por un USUARIO (no solo tutor) de la org.
- [ ] En `app-web`, tras setear `colorPrimario`, los CTAs/acentos de marca cambian de color en vivo (tutor y usuario) y el logo aparece en la topbar.
- [ ] Se emite `AccionAdministrativaRegistrada` al actualizar (visible en el timeline de audit).
- [ ] Fail-closed: si billing no responde, `PUT branding` da 403 (no habilita la feature por defecto).

## Notas de implementación / riesgos

- La escala de color derivada de un solo hex es una aproximación (mezcla lineal con blanco/negro), no una paleta perceptualmente uniforme. Es suficiente para acento de marca; si en el futuro se quiere control fino, se agregarían más campos (o una paleta completa) — fuera de alcance acá.
- El logo por URL externa depende de que el cliente mantenga la imagen hosteada; si el link se cae, el shell debe degradar a "sin logo" (mostrar el nombre de la org). El `<img>` maneja `onerror` → oculta y cae al texto.
