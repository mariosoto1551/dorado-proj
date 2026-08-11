# Runbook de despliegue — servidor de casa

Todo el sistema (10 servicios backend + los 3 frontends + Postgres + RabbitMQ)
corriendo **en una máquina de tu red local**, 24/7, sin nube, sin dominio y sin
costo mensual. La familia entra desde el celu o la laptop por WiFi.

> Otras dos variantes, para cuando haga falta salir a internet:
> `docs/runbook-deploy-vps.md` (VPS + Vercel) y `docs/runbook-deploy.md`
> (Render + CloudAMQP). Esta es la única que no depende de nada externo.

**No confundir con `pnpm dev:casa`** (`scripts/home-up.mjs`): ese levanta lo
mismo desde el código en tu PC de desarrollo y se cae cuando cerrás la terminal.
Este runbook deja el sistema como contenedores que arrancan solos con la
máquina.

---

## 0. Lo que necesitás

- Una **máquina con Linux** que quede prendida: una PC vieja, un mini-PC, un
  NAS. Sirve **Ubuntu Server 24.04, Debian 13, Linux Mint o Alpine** — el SO casi
  no interviene, porque cada contenedor trae su propio userspace (las imágenes
  son Debian slim por dentro). Ver "Notas por distro" al final.
- **4 GB de RAM** para construir las imágenes la primera vez (después corre
  cómodo en 2 GB). Si tenés menos, sumá swap:
  ```bash
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
- **~8 GB de disco** para imágenes y datos.
- **Docker** con el plugin `compose`.
- Arquitectura **x86-64 o ARM64**: las imágenes se construyen en tu propia
  máquina, así que una Raspberry Pi 4/5 con 4 GB también sirve (a diferencia del
  runbook del VPS, que baja imágenes amd64 pre-armadas).

Lo que **no** necesitás: dominio, DNS, certificados, IP fija, abrir puertos en
el router, ni cuenta en ninguna nube.

## 1. Instalar Docker

```bash
curl -fsSL https://get.docker.com | sh          # Ubuntu / Debian / Mint
sudo usermod -aG docker "$USER"                 # para no usar sudo en cada comando
newgrp docker
```
(En Alpine es distinto — ver "Notas por distro".)

## 2. Clonar el repo

```bash
git clone https://github.com/mariosoto1551/dorado-proj.git
cd dorado-proj
```

## 3. Claves y secretos

Las claves JWT se generan **una sola vez**. Se puede hacer en el mismo servidor
(necesita Node 24) o en tu PC y copiar los valores:

```bash
node tools/generar-claves-jwt.mjs      # imprime JWT_PUBLIC_KEY y JWT_PRIVATE_KEY
```

```bash
cp infra/docker/.env.casa.example infra/docker/.env.casa
nano infra/docker/.env.casa
```

Completá:

| Variable | Cómo |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `RABBITMQ_PASS` | `openssl rand -hex 24` |
| `GATEWAY_INTERNAL_SECRET` | `openssl rand -hex 32` |
| `JWT_PUBLIC_KEY` / `JWT_PRIVATE_KEY` | del comando de arriba |
| `OPENAI_API_KEY` | **opcional** — sin ella el asistente de IA queda apagado y nada más cambia |

No hay ninguna URL ni IP que anotar: eso se resuelve solo (ver paso 6).

## 4. Levantar todo

```bash
docker compose -f infra/docker/docker-compose.casa.yml \
  --env-file infra/docker/.env.casa up -d --build
```

La primera vez construye 13 imágenes y tarda un rato largo (10–30 min según la
máquina); las siguientes reusan caché.

> **Si la máquina tiene 4 GB o menos**, construí de a una antes de levantar, o
> los builds en paralelo se pelean por la RAM:
> ```bash
> CASA="-f infra/docker/docker-compose.casa.yml --env-file infra/docker/.env.casa"
> for s in $(docker compose $CASA config --services); do
>   docker compose $CASA build "$s" || exit 1
> done
> docker compose $CASA up -d
> ```

Después de eso:

- Postgres crea las 9 bases solo (incluida `ai_db`).
- Cada servicio corre sus migraciones al arrancar (`prisma migrate deploy`).
- Todo queda con `restart: unless-stopped`: **arranca solo cuando prendés la
  máquina**, sin configurar systemd.

Verificar:

```bash
curl http://localhost:3000/api/health     # status ok, con los 10 servicios
docker compose -f infra/docker/docker-compose.casa.yml ps
```

## 5. Entrar desde los celulares

Averiguá el nombre o la IP del servidor:

```bash
hostname                                   # ej. "dorado"  → http://dorado.local:4200
hostname -I | awk '{print $1}'             # ej. 192.168.1.50
```

| Qué | Dónde |
|---|---|
| App de la familia (`app-web`) | `http://<servidor>:4200` |
| Sitio público / registro (`public-site`) | `http://<servidor>:4321` |
| Panel de plataforma (`admin-web`) | `http://<servidor>:4300` |
| API (Gateway) | `http://<servidor>:3000/api` |

Conviene usar **el nombre y no la IP** (`http://dorado.local:4200`): la IP la
cambia el router cuando renueva el DHCP, el nombre no. En Linux el nombre `.local`
lo publica `avahi-daemon` (`sudo apt install avahi-daemon`); Android, iOS,
Windows y macOS lo resuelven sin instalar nada.

Que cada uno lo guarde con **"Agregar a pantalla de inicio"** y le queda como un
ícono más.

## 6. Por qué no hay que configurar la dirección en ningún lado

Es la parte que suele romperse en un despliegue casero, y acá está resuelta de
las dos puntas:

- **Los frontends** se compilan con la configuración `casa`, que es la de
  producción **sin** el reemplazo de `environment.prod.ts`. Queda el
  `environment.ts`, que deriva la URL del Gateway del host desde el que se abrió
  la app: si entrás por `http://192.168.1.50:4200`, le pega a
  `http://192.168.1.50:3000/api`; si entrás por `http://dorado.local:4200`, a
  `http://dorado.local:3000/api`. El mismo build sirve para todos.
- **El Gateway** va con `CORS_ALLOW_LAN=true`, que refleja cualquier origen de
  red local — IP privada, `dorado.local`, `dorado.lan` o un nombre solo (ver
  `apps/gateway/src/proxy/cors-origin.ts`).

Si el servidor cambia de IP, no hay que reconstruir ni reconfigurar nada.

## 7. Alta de los datos reales

1. Registrás la organización en `http://<servidor>:4321` (public-site).
2. Entrás a `http://<servidor>:4200`, creás el grupo y configurás Sesión/Sección.
3. Cargás umbrales, actividades, conductas y recompensas por pantalla.
4. Invitás al resto de la familia; canjean la invitación con su `username`.

## 8. Operación

```bash
CASA="-f infra/docker/docker-compose.casa.yml --env-file infra/docker/.env.casa"

docker compose $CASA logs -f scoring-service     # logs de un servicio
docker compose $CASA restart gateway             # reiniciar uno
docker compose $CASA down                        # bajar todo (los datos quedan)
git pull && docker compose $CASA up -d --build   # actualizar a la última versión
```

### Backups

Los datos de la familia viven en el volumen `pgdata` de una sola máquina que
está en tu casa: no hay snapshots de ningún proveedor ni nadie mirando si algo
se rompió. Por eso el backup **no es un paso que tengas que acordarte de hacer**
— el servicio `backup` del compose corre todos los días a las 03:00 y guarda un
`.sql.gz` por base, verificado, con 14 días de retención.

```bash
docker compose $CASA exec backup ls -1 /backups                        # qué hay
docker compose $CASA exec backup /usr/local/bin/backup-postgres.sh     # uno ahora
```

Una carpeta terminada en **`_INCOMPLETO`** es un backup al que le faltó alguna
base. La retención nunca las borra, para que se noten.

**Sacá una copia de la máquina cada tanto** (un pendrive, otra compu, tu Drive).
Es el paso que hace que el backup sirva de verdad: si se quema el disco, todo lo
que estaba en ese disco se fue con él.

```bash
docker compose $CASA exec backup tar -cz -C /backups . > ~/dorado-backups-$(date +%F).tar.gz
```

**Restaurar** (dropea y recrea la base — pide confirmación):

```bash
docker compose $CASA exec backup \
  /usr/local/bin/restore-postgres.sh /backups/2026-08-10_0300          # las 9 bases
docker compose $CASA exec backup \
  /usr/local/bin/restore-postgres.sh /backups/2026-08-10_0300 scoring_db   # solo una
```

## 9. Seguridad en la red de casa

Esto corre en **HTTP plano**, sin certificados, y por eso la cookie de refresh va
sin el flag `Secure` (`REFRESH_COOKIE_SECURE=false`). Es la misma decisión que
toma `scripts/home-up.mjs` y es razonable **dentro de tu WiFi**, no fuera.

- **No expongas estos puertos a internet** (no hagas port-forwarding en el
  router). Si algún día querés entrar desde afuera, la opción sana es una VPN
  (Tailscale/WireGuard) o pasar al runbook del VPS, que sí tiene HTTPS.
- Postgres y RabbitMQ **no publican puertos**: solo se los alcanza desde adentro
  de la red de contenedores.

## Notas por distro

| Distro | Qué cambia |
|---|---|
| **Ubuntu Server 24.04 / Debian 13** | Nada: los pasos de arriba se siguen tal cual. Es lo más probado. |
| **Linux Mint** | Igual que Ubuntu. Única trampa: si agregás el repo oficial de Docker a mano, Mint reporta su propio codename (`xia`, `wilma`…) y hay que forzar el de Ubuntu base (`noble`). El `curl get.docker.com \| sh` del paso 1 ya lo maneja. |
| **Alpine** | Los contenedores corren igual (traen Debian adentro), pero el host va distinto: `apk add docker docker-cli-compose` y `rc-update add docker default` (OpenRC, no systemd). El firewall es `awall`, no `ufw`. Para mDNS, `apk add avahi`. No intentes compilar el proyecto **fuera** de Docker en Alpine: los módulos nativos (`argon2`, motores de Prisma) están armados para glibc y ahí es donde musl duele. |
| **Raspberry Pi OS (ARM64)** | Funciona porque las imágenes se construyen localmente. Poné 4 GB de swap o el build de Angular se queda sin memoria. |

## Si algo no arranca

```bash
docker compose $CASA ps                    # ¿quién está caído?
docker compose $CASA logs <servicio> | tail -50
```

- **Un servicio reiniciándose en loop** suele ser env faltante: los servicios
  validan sus variables al arrancar y mueren con el detalle en el log (ADR-00
  §8). Revisá `.env.casa`.
- **`/api/ai/*` devuelve 503**: es el comportamiento esperado si `ai-service` no
  levantó. Nada más se ve afectado — el asistente nunca está en el camino
  crítico. Si no cargaste `OPENAI_API_KEY`, el servicio igual levanta y el 503
  no debería aparecer; si aparece, mirá `docker compose $CASA logs ai-service`.
- **Desde el celu no carga pero desde el servidor sí**: es el firewall del
  servidor. Abrí los cuatro puertos en la red local, ej. en Ubuntu:
  `sudo ufw allow from 192.168.0.0/16 to any port 3000,4200,4300,4321 proto tcp`.
