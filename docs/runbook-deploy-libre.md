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

## 0. Lo que necesitás

- Una cuenta de **Oracle Cloud** (pide tarjeta **solo para verificar
  identidad**; no cobra mientras la cuenta siga en *Always Free* y no la
  upgradees a Pay As You Go).
- Una cuenta de **DuckDNS** (login con GitHub/Google, gratis).
- Nada más: ni dominio pago, ni tarjeta con saldo, ni IP fija, ni router.

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

## 2. Abrir los puertos 80 y 443 — EN LOS DOS LUGARES

El error clásico de Oracle, y el que hace perder más tiempo: hay **dos**
firewalls y los dos bloquean por defecto.

**a) En la consola de Oracle** — Networking → VCN → Security List de la subred →
*Add Ingress Rules*: origen `0.0.0.0/0`, TCP, puertos 80 y 443.

**b) En la máquina** — la imagen Ubuntu de OCI trae reglas de `iptables` que
descartan todo salvo SSH (y viene con UFW deshabilitado, así que no alcanza con
`ufw allow`):

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo apt-get install -y iptables-persistent   # o: sudo netfilter-persistent save
```

Si hacés solo uno de los dos, Caddy no va a poder sacar el certificado y el
síntoma es un timeout sin explicación.

## 3. El dominio (DuckDNS)

1. Entrá a [duckdns.org](https://www.duckdns.org), logueate y creá un subdominio
   (ej. `destino-dorado`).
2. Poné la **IP pública** de la instancia en el campo `current ip` y guardá.
3. Verificá desde tu PC antes de seguir — Caddy pide el certificado en el
   arranque y necesita que el DNS ya resuelva:
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

Completá: `DOMINIO` (sin `https://`), `POSTGRES_PASSWORD`, `RABBITMQ_PASS`,
`JWT_PUBLIC_KEY`, `JWT_PRIVATE_KEY`, `GATEWAY_INTERNAL_SECRET`. Los secretos se
generan con `openssl rand -hex 24`.

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

- **Un solo nodo, sin alta disponibilidad.** Se cae la VM, se cae todo. Los
  backups son la red, y solo si te los llevaste de la máquina.
- **Oracle puede reclamar recursos de cuentas inactivas.** Un sistema con cron y
  consumidores corriendo no está inactivo, pero es un riesgo de la casa.
- **2 OCPU ARM** alcanzan para una familia o un grupo chico; no para vender esto
  a cincuenta organizaciones.
- **Sin observabilidad**: no hay Sentry ni métricas ni alertas. Si algo falla, te
  enterás mirando `docker compose logs`.
- **Sin recuperación de contraseña**: todavía no existe en el sistema (no hay
  SMTP). Un olvido se arregla con SQL a mano.
