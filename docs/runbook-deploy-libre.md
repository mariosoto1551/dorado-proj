# Runbook de despliegue — variante LIBRE (en internet, sin costo)

El sistema completo —10 procesos backend, los 3 frontends, Postgres, RabbitMQ,
backups y HTTPS— en internet, con dominio propio y accesible desde cualquier
lado, **sin pagar nada**.

> Las otras tres variantes: `docs/runbook-deploy-casa.md` (red local, sin
> internet), `docs/runbook-deploy-vps.md` (VPS pago + Vercel) y
> `docs/runbook-deploy.md` (Render + CloudAMQP). Esta es la única que llega a
> internet a costo cero.

## Lo único que no es gratis

**El asistente de IA.** OpenAI cobra por token y no hay tier gratuito que
alcance. Sin `OPENAI_API_KEY` el sistema levanta igual y el asistente queda
apagado: `/api/ai` responde 503 y **nada más cambia**. Se puede prender después
sin tocar el resto (con uso familiar el gasto son centavos al mes, pero conviene
un service account de un project propio de OpenAI con límite de gasto).

## Por qué esta variante existe (y por qué no es "todo en un solo contenedor")

La idea intuitiva para abaratar es meter todo en una imagen. **No sirve, y no
por elegancia**: las plataformas que regalan un contenedor dan 256–512 MB y lo
duermen por inactividad, y esto necesita ~2 GB y procesos que no pueden dormir
(el scheduler de secciones y los consumidores de eventos). Consolidar te haría
perder reinicio, logs y health por servicio **sin entrar igual en ningún tier
gratuito**. La unidad que importa no es el contenedor: es la máquina. Este
runbook consigue una máquina gratis y corre el compose que ya existe.

## La forma del despliegue: UN SOLO ORIGEN

Todo se sirve desde el mismo dominio, repartido por prefijo:

| URL | Va a |
|---|---|
| `https://TU-DOMINIO/` | public-site (sitio público, registro) |
| `https://TU-DOMINIO/app/` | app-web (tutores y participantes) |
| `https://TU-DOMINIO/admin/` | admin-web (panel de plataforma) |
| `https://TU-DOMINIO/api/…` | Gateway → los 10 servicios |

**No es una decisión estética.** Un dominio gratuito de DuckDNS está en la
Public Suffix List, así que `app.tuyo.duckdns.org` y `api.tuyo.duckdns.org`
serían **sitios distintos** para el navegador: la cookie `dorado_refresh` es
`SameSite=Lax`, no viajaría, y el login quedaría roto de una forma dificilísima
de diagnosticar (parece un problema de contraseña). Con un origen único:

- no hay CORS que configurar ni que mantener sincronizado con el dominio,
- la cookie es first-party y el handoff de sesión del registro (te registrás en
  el sitio público y entrás a la app ya logueado) funciona como fue escrito,
- las SPAs se compilan con `apiBaseUrl` **relativo**, así que **no llevan el
  dominio adentro**: cambiás de dominio y no hay que reconstruirlas.

---

## Elegí primero el modo de exposición

El stack es el mismo; lo que cambia es quién puede llegar.

| | **A · Privado (Tailscale)** | **B · Público (DuckDNS)** |
|---|---|---|
| Quién entra | solo los dispositivos de tu tailnet | cualquiera con el link |
| Puertos abiertos a internet | **ninguno** | 80 y 443 |
| HTTPS | sí, lo da Tailscale | sí, Let's Encrypt vía Caddy |
| Desde afuera de casa | sí | sí |
| Pasos extra | instalar Tailscale en cada dispositivo | abrir 2 firewalls + DNS |
| Para | **una familia, un grupo cerrado** | abrirlo a desconocidos |

**Para uso familiar, andá por A.** No es solo comodidad: hoy el sistema **no
tiene recuperación de contraseña, ni observabilidad, ni alertas**, y guarda
datos de chicos. Publicarlo a internet cuando lo van a usar cinco personas
conocidas es aceptar una superficie de ataque que no necesitás. Con Tailscale el
sistema simplemente **no existe** para el resto de internet.

El plan free de Tailscale son **6 usuarios y dispositivos ilimitados**, que es
exactamente el tamaño de una familia.

## 0. Lo que necesitás

- Una **máquina que quede prendida**. Dos formas de conseguirla gratis:
  - una cuenta de **Oracle Cloud** (pide tarjeta **solo para verificar
    identidad**; no cobra mientras siga en *Always Free*), o
  - **una PC vieja, mini-PC, NAS o Raspberry Pi 4/5** que ya tengas en casa —
    con Tailscale no hace falta que esté en la nube ni que tenga IP pública.
- Para el modo A: una cuenta de **Tailscale** (login con Google/GitHub, gratis).
- Para el modo B: una cuenta de **DuckDNS** (gratis).
- Nada más: ni dominio pago, ni IP fija, ni tocar el router.

## 1. La máquina (Oracle Cloud Always Free)

Creá una instancia **VM.Standard.A1.Flex** (ARM Ampere) con **Ubuntu 24.04**:

- **2 OCPU / 12 GB RAM.** Oracle bajó el Always Free de 4/24 a 2/12 en junio de
  2026. Alcanza de sobra: el stack corre en ~2 GB y compilar los frontends pide
  ~4 GB.
- **Disco**: el boot volume de 50 GB alcanza; el Always Free llega a 200 GB.
- Guardá la clave SSH que te genera.

> **"Out of capacity"** es lo normal, no un error tuyo: las ARM gratuitas están
> muy pedidas. Probá otra Availability Domain, otra región, o reintentá cada
> tanto. Es el único paso de este runbook que puede tardar días.

> **Es ARM (aarch64)**, no x86. Por eso el workflow `images.yml` construye las
> imágenes para las dos arquitecturas: el servidor baja las suyas y no compila
> nada del backend.

## 2 y 3 · Cómo se llega al servidor

### Modo A · Privado con Tailscale (recomendado para la familia)

**No hay que abrir ningún puerto.** Ni en Oracle, ni en la máquina, ni en el
router. Salteate toda la parte de firewalls y de DNS.

**a) Tailscale en el servidor:**

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# seguí el link que imprime para autorizar la máquina
```

**b) Activá HTTPS en tu tailnet:** en [login.tailscale.com](https://login.tailscale.com)
→ DNS → *Enable HTTPS*. Eso te da un nombre estable del estilo
`servidor.tu-tailnet.ts.net` con certificado de Let's Encrypt, sin tener un
dominio propio. Anotalo: **ese es tu `DOMINIO`**.

**c) Tailscale en los 5 dispositivos de la familia.** Dos caminos:

- **Todos bajo tu cuenta** (más simple): instalás la app en cada celu/laptop y
  los autorizás vos. Un solo usuario, dispositivos ilimitados.
- **Una cuenta por persona**: los invitás a la tailnet desde el panel. El plan
  free llega a 6 usuarios, así que entran los cinco.

**d) Publicá el sistema dentro de la tailnet** (después del paso 6, cuando el
stack esté arriba):

```bash
sudo tailscale serve --bg --https=443 http://127.0.0.1:8080
sudo tailscale serve status     # confirmá el nombre que quedó sirviendo
```

> **No uses `tailscale funnel`**: eso es justo lo contrario — publica el
> servicio a internet, que es lo que este modo evita.

### Modo B · Público con DuckDNS

**a) Abrí 80 y 443 EN LOS DOS LUGARES.** Es el error clásico de Oracle: hay dos
firewalls y los dos bloquean por defecto.

- **Consola de Oracle** — Networking → VCN → Security List de la subred → *Add
  Ingress Rules*: origen `0.0.0.0/0`, TCP, puertos 80 y 443.
- **En la máquina** — la imagen Ubuntu de OCI trae reglas de `iptables` que
  descartan todo salvo SSH, y viene con UFW deshabilitado (así que `ufw allow`
  no alcanza):

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo apt-get install -y iptables-persistent   # o: sudo netfilter-persistent save
```

Si hacés solo uno de los dos, Caddy no va a poder sacar el certificado y el
síntoma es un timeout sin explicación.

**b) El dominio:** entrá a [duckdns.org](https://www.duckdns.org), creá un
subdominio, poné ahí la IP pública de la máquina, y verificá que resuelva
**antes** de levantar nada (Caddy pide el certificado en el arranque):

```bash
nslookup destino-dorado.duckdns.org
```

## 4. Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
newgrp docker
```

## 5. El repo y los secretos

```bash
git clone https://github.com/mariosoto1551/dorado-proj.git
cd dorado-proj

# Claves JWT (una sola vez; imprime las dos en base64)
node tools/generar-claves-jwt.mjs

cp infra/docker/.env.libre.example infra/docker/.env.libre
nano infra/docker/.env.libre
```

Completá: `DOMINIO` (sin `https://` — el nombre `.ts.net` en el modo A, el de
DuckDNS en el B), `POSTGRES_PASSWORD`, `RABBITMQ_PASS`, `JWT_PUBLIC_KEY`,
`JWT_PRIVATE_KEY`, `GATEWAY_INTERNAL_SECRET`. Los secretos se generan con
`openssl rand -hex 24`.

**En el modo A, descomentá además estas cuatro:**

```
BORDE_SITIO=:80
BORDE_HTTP=127.0.0.1:8080
BORDE_HTTPS=127.0.0.1:8443
TRUST_PROXY=2
```

Qué hace cada una: `BORDE_SITIO=:80` le dice a Caddy que sirva HTTP plano y no
intente sacar un certificado (el TLS lo pone Tailscale, y acá no habría nada
público contra qué validar un desafío). Las dos de puertos atan el borde a
**loopback**: desde la red no se lo alcanza, solo `tailscale serve` desde la
propia máquina. Y `TRUST_PROXY=2` son los dos saltos que hay delante del Gateway
en este modo (Tailscale Serve, que pone el `X-Forwarded-For` real, y el borde,
que agrega el suyo al proxear).

> Si te olvidás `DOMINIO`, el `up` falla al instante con un mensaje que lo dice.
> Es a propósito: sin dominio, Caddy fallaría de una forma mucho menos clara.

## 6. Levantar

```bash
COMPOSE="-f infra/docker/docker-compose.libre.yml --env-file infra/docker/.env.libre"
docker compose $COMPOSE up -d --build
```

La primera vez tarda: los 3 frontends se compilan en la máquina (los 10
servicios backend también, salvo que uses las imágenes pre-armadas de GHCR — ver
la variante de abajo). Con 2 OCPU, contá entre 20 y 40 minutos. Después:

```bash
docker compose $COMPOSE ps          # todos "running"/"healthy"
docker compose $COMPOSE logs -f borde   # mirá que Caddy saque el certificado
```

### Variante: sin compilar el backend

Si la máquina va justa o querés que el deploy tarde 2 minutos en vez de 40,
usá las imágenes que ya construyó CI (multi-arquitectura, así que bajan las ARM
solas):

```bash
docker login ghcr.io -u TU-USUARIO-GITHUB   # con un PAT read:packages
docker compose $COMPOSE -f infra/docker/docker-compose.images.yml pull
docker compose $COMPOSE -f infra/docker/docker-compose.images.yml up -d
```

Los 3 frontends se siguen compilando localmente: llevan el prefijo de ruta y el
dominio horneados, así que no hay una imagen genérica que sirva para todos.

## 7. Verificar

**Modo A**, desde la propia máquina primero (el borde escucha en loopback):

```bash
curl http://127.0.0.1:8080/api/health   # {"status":"ok"} con los 10 servicios
sudo tailscale serve --bg --https=443 http://127.0.0.1:8080
```

…y después desde un celular con Tailscale prendido, entrando a
`https://servidor.tu-tailnet.ts.net/`.

**Modo B**, directo:

```bash
curl https://TU-DOMINIO/api/health     # {"status":"ok"} con los 10 servicios
curl -I https://TU-DOMINIO/app/        # 200, y las cabeceras de seguridad
curl -I https://TU-DOMINIO/            # 200, el sitio público
```

Después, en el navegador: entrá a `https://TU-DOMINIO/`, registrá la
organización desde el sitio, y fijate que al terminar el botón te lleve a
`/app/` **ya logueado** — si eso funciona, la cookie de refresh está bien y todo
el resto también.

## 8. El alta del tenant

Igual que en las otras variantes: crear el grupo, configurar Sesión/Sección,
cargar umbrales, actividades, conductas y recompensas por pantalla, e invitar a
los participantes. Ver la sección equivalente de `docs/runbook-deploy-vps.md`.

Para el panel de plataforma (`/admin/`) hace falta la cuenta de `PLATFORM_ADMIN`,
que se crea con las variables `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`
de identity-service.

## 9. Operación

```bash
COMPOSE="-f infra/docker/docker-compose.libre.yml --env-file infra/docker/.env.libre"

docker compose $COMPOSE logs -f scoring-service   # logs de un servicio
docker compose $COMPOSE restart gateway           # reiniciar uno
git pull && docker compose $COMPOSE up -d --build # actualizar
```

### Backups

Corren solos todos los días a las 03:00 UTC: un `.sql.gz` por base, verificado
al escribirlo, con 14 días de retención.

```bash
docker compose $COMPOSE exec backup ls -1 /backups                       # qué hay
docker compose $COMPOSE exec backup /usr/local/bin/backup-postgres.sh    # uno ahora
```

Una carpeta terminada en `_INCOMPLETO` es un backup al que le faltó alguna base;
la retención nunca las borra, para que se noten.

**Bajalos de la máquina cada tanto** — es el paso que hace que sirvan:

```bash
ssh usuario@TU-IP "docker compose $COMPOSE exec -T backup tar -cz -C /backups ." \
  > dorado-backups-$(date +%F).tar.gz
```

**Restaurar** (dropea y recrea la base; pide confirmación):

```bash
docker compose $COMPOSE exec backup \
  /usr/local/bin/restore-postgres.sh /backups/2026-08-10_0300 scoring_db
```

### Si cambiás de dominio

Editá `DOMINIO` en `.env.libre` y reconstruí **solo public-site** (es el único
que lleva el dominio adentro; las dos SPAs usan rutas relativas):

```bash
docker compose $COMPOSE up -d --build public-site borde
```

## Lo que estás aceptando al no pagar

- **Un solo nodo, sin alta disponibilidad.** Se cae la máquina, se cae todo. Los
  backups son la red, y solo si te los llevaste de ahí.
- **Oracle puede reclamar recursos de cuentas inactivas.** Un sistema con cron y
  consumidores corriendo no está inactivo, pero es un riesgo de la casa. (Con
  una máquina propia en casa, este punto no aplica.)
- **2 OCPU ARM** alcanzan para una familia o un grupo chico; no para vender esto
  a cincuenta organizaciones.
- **Sin observabilidad**: no hay Sentry ni métricas ni alertas. Si algo falla, te
  enterás mirando `docker compose logs`.
- **Sin recuperación de contraseña**: todavía no existe en el sistema (no hay
  SMTP). Un olvido se arregla con SQL a mano. En el modo A esto duele menos —
  nadie de afuera puede intentar entrar— pero sigue siendo trabajo tuyo.
- **En el modo A, hay que tener Tailscale prendido** en el dispositivo para
  entrar. Es el precio de que el sistema no exista para internet: si un chico se
  desinstala la app, deja de ver la suya hasta que la vuelva a poner.
