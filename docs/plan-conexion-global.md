# Plan — acceso global para la familia (hasta 6 usuarios, sin costo)

> **Esto es un plan, no un runbook.** Nada de acá está ejecutado. Escrito el
> 2026-08-12, con el sistema ya corriendo en el servidor de casa
> (`docs/runbook-deploy-casa.md`, variante `docker-compose.casa.yml`).

## El problema

Hoy el sistema solo se alcanza desde la red de casa: `http://dorado.local:4200`
y compañía. Fuera de la casa no hay nada. Se quiere que la familia entre desde
cualquier lado —datos móviles, la casa de un abuelo, un viaje— **sin publicar el
sistema a internet** y **sin costo mensual**.

Que no sea público no es una preferencia estética. Vale la pena repetir lo que
ya decidió la fase 13: este sistema **no tiene recuperación de contraseña, ni
observabilidad, ni alertas**, y guarda datos de chicos. Exponerlo a internet
para que lo usen cinco personas conocidas es aceptar una superficie de ataque
que no hace falta.

## La tecnología: Tailscale

Es una VPN de malla sobre WireGuard. Cada dispositivo entra a una red privada
("tailnet") y se ve con los demás como si estuvieran en la misma LAN, sin
importar dónde estén físicamente.

Por qué encaja acá y no otra cosa:

- **El plan gratuito es de 6 usuarios con dispositivos ilimitados** (cambió en
  abril 2026; dato registrado en `docs/progreso/fase-13-piloto-deploy.md`).
  Justo el tamaño de una familia. *Reconfirmar en el alta: es un dato de plan
  comercial y puede volver a cambiar.*
- **No hace falta abrir puertos en el router, ni IP fija, ni dominio, ni
  certificados.** Esto importa especialmente en esta red: hay dos routers y un
  DHCP en conflicto (ver la nota de red del proyecto), y encima la conexión se
  cae seguido. Tailscale atraviesa NAT y CGNAT por diseño; una solución de
  port-forwarding se rompería con la primera renovación de IP.
- **Nada queda expuesto a internet.** El servidor sigue sin puertos publicados
  hacia afuera. Quien no esté en la tailnet no ve absolutamente nada — ni
  siquiera un puerto cerrado que escanear.

### La alternativa que descarto (y por qué)

**Cloudflare Tunnel + Cloudflare Access** es la otra candidata seria y también
tiene free tier generoso (Access llega a 50 usuarios). La descarto porque
publica la app en un hostname de internet y la protege con una capa de
autenticación *adicional* delante: son dos sistemas de login para la misma
familia, y un error de configuración en Access deja el sistema abierto al
mundo. Tailscale falla cerrado: si algo se rompe, nadie entra. Con datos de
chicos y sin observabilidad, prefiero el que falla cerrado.

---

## El obstáculo real: CORS y el origen

Acá está la parte que no es obvia y que define cuál de las tres opciones
conviene. El Gateway decide qué orígenes acepta en
[cors-origin.ts](../apps/gateway/src/proxy/cors-origin.ts):

- Acepta IPs privadas RFC 1918 y loopback.
- Acepta nombres bajo `local`, `lan`, `casa`, `internal`, `home`, `home.arpa`.
- Acepta **un nombre de una sola etiqueta** (`http://dorado:4200`).
- **No** acepta `ts.net` — no está en la lista de sufijos.
- **No** acepta el rango `100.64.0.0/10` (CGNAT), que es el que reparte
  Tailscale — no entra en el regex de IP privada.

O sea: entrar por `https://dorado.mi-tailnet.ts.net` o por `http://100.x.y.z`
**lo rechaza el CORS**, aunque la red funcione perfecto. Es exactamente lo que
anticipó la fase 13 al elegir origen único para el modo libre.

Segundo condicionante: el frontend **deriva la URL de la API del host desde el
que se abrió** (`environment.ts`). Si entrás por `X:4200`, le pega a `X:3000`.
Así que el hostname que se use tiene que servir los cuatro puertos.

---

## Tres opciones

### Opción A — Tailscale sobre el despliegue actual, por nombre corto

Lo mínimo. Se instala Tailscale en el servidor y en cada dispositivo, y se entra
por **`http://dorado:4200`** (el nombre corto de MagicDNS), que pasa el CORS por
la rama de "una sola etiqueta".

- **Costo de cambio:** ninguno en el código. Solo instalar y compartir.
- **Contras:**
  - **Sin HTTPS.** El tráfico va cifrado por WireGuard, pero el navegador ve
    `http://` y trata al sitio como inseguro. Eso limita el uso como PWA
    ("agregar a pantalla de inicio"), que hoy es cómo entra la familia.
  - Depende de que el *search domain* de MagicDNS resuelva el nombre corto en
    cada plataforma. Suele andar en iOS/Android con la app de Tailscale, pero es
    la parte frágil del plan.
  - Si el nombre corto falla, el fallback natural (la IP `100.x.y.z`) **no
    funciona**: lo rechaza el CORS.
- **Cuándo elegirla:** para probar el concepto en una tarde y ver si a la
  familia le sirve, antes de invertir en la migración.

### Opción B — Tailscale Serve con HTTPS, manteniendo el compose de casa

`tailscale serve` termina TLS con un certificado válido para
`dorado.<tailnet>.ts.net`, gratis y renovado solo. Se mapean los cuatro puertos.

- **El CORS se resuelve sin tocar código**: la lista explícita
  (`origenesPermitidos`) se consulta **antes** que la rama de red local, así que
  alcanza con setear `APP_WEB_URL` y `PUBLIC_SITE_URL` al nombre `ts.net` en el
  `.env.casa`. Es configuración, no un parche al regex.
- **Contras:** quedan cuatro URLs con puertos distintos sobre HTTPS, y hay que
  verificar cómo se comporta la derivación de `apiBaseUrl` del frontend cuando
  el puerto de origen no es el 4200 sino el que asignó Serve. **Este es el punto
  a validar antes de comprometerse con esta opción.**

### Opción C — Migrar al compose `libre` en modo privado (la ya diseñada)

La fase 13 ya dejó diseñado y verificado en configuración un modo Tailscale para
`docker-compose.libre.yml`: Caddy adelante como **origen único**
(`/api/*` → gateway, `/app/` → app-web, `/admin/` → admin-web, raíz →
public-site), `BORDE_SITIO=:80`, puertos atados a `127.0.0.1`, `TRUST_PROXY=2`,
y el TLS puesto por `tailscale serve` sobre el nombre `*.ts.net`.

- **Ventajas:** un solo origen y una sola URL → **el problema de CORS
  desaparece por completo**, no por parche sino por diseño. HTTPS real. Es el
  camino que el proyecto ya pensó, no una improvisación.
- **Contras (el costo honesto):**
  1. **Migración de datos.** El compose `libre` es otro proyecto de Docker, con
     otros volúmenes. Hay que hacer `pg_dump` de las 9 bases desde
     `dorado-casa_pgdata` y restaurarlas del otro lado. No es difícil, pero es
     el paso donde se pierde información si sale mal.
  2. **Rebuild de los frontends** con la configuración `libre` (`baseHref`
     `/app/` y `/admin/`). Otros ~25 minutos de build secuencial.
  3. Se pierde el acceso por `dorado.local:4200` al que la familia ya se
     acostumbró, salvo que se mantengan los dos caminos.
- **Lo no verificado:** la fase 13 dice explícitamente que la tailnet real y
  `tailscale serve` nunca se probaron — solo que los composes resuelven a la
  configuración esperada.

---

## Recomendación

**Empezar por A, decidir entre B y C con datos.**

El motivo es que la incógnita más grande no es técnica sino de uso: si la
familia va a querer entrar desde afuera lo suficiente como para justificar una
migración de datos. La opción A cuesta una tarde y **cero cambios en el
sistema**; si resulta que se usa, ahí sí vale la pena la C, que es la única que
deja esto bien terminado (HTTPS, origen único, PWA funcionando).

Ir directo a C también es defendible si se prefiere hacerlo una sola vez.

## Pasos, si se avanza

Fase 1 — probar (opción A):

1. Crear la cuenta de Tailscale y la tailnet.
2. Instalar Tailscale en el servidor y autenticarlo. Conviene marcarlo como
   nodo con **clave que no expira**, o cada 6 meses se cae solo el acceso.
3. Habilitar MagicDNS en la consola de Tailscale.
4. Invitar a los miembros de la familia (ojo con el tope de 6 del plan free).
5. Instalar la app en cada celular y probar `http://dorado:4200` **con los datos
   móviles, no con el WiFi de casa** — con WiFi funcionaría igual sin Tailscale
   y la prueba no diría nada.

Fase 2 — decidir. Si se usa, evaluar B contra C con la duda de B ya resuelta
(cómo deriva el frontend la URL de la API detrás de Serve).

## Preguntas abiertas

- ¿Cuántas personas exactamente? El free son 6 **usuarios**; si son más, cambia
  la elección de tecnología, no solo el plan.
- ¿Hace falta que funcione como PWA desde afuera? Si la respuesta es sí, la
  opción A queda descartada de entrada y conviene ir a C.
- ¿Se mantiene el acceso por `dorado.local` para cuando están en casa? (Es lo
  razonable: más rápido y no depende de que Tailscale esté arriba.)
