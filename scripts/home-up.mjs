#!/usr/bin/env node
// @ts-check
/**
 * "Modo casa": levanta TODO el sistema en tu PC para que tu familia lo use
 * desde sus celulares/laptops en la red de casa (WiFi). Gratis, sin nube.
 *
 *   node scripts/home-up.mjs
 *
 * Qué hace:
 *   1. Infra (Postgres + RabbitMQ) vía docker-compose.
 *   2. Migraciones de las 8 bases.
 *   3. Los 9 servicios backend (con CORS_ALLOW_LAN=true para aceptar la red local).
 *   4. app-web y public-site servidos en 0.0.0.0 (accesibles desde otros equipos).
 *   5. Te imprime un QR + el nombre de red de la PC para pasarle a tu familia.
 *
 * Tu familia escanea el QR con la cámara del celu, o entra por el nombre
 * `http://<nombre-de-tu-PC>.local:4200` — que, a diferencia de la IP, NO cambia
 * cuando el router renueva el DHCP. Conviene que cada uno lo guarde con
 * "Agregar a pantalla de inicio" y le quede como un ícono más.
 *
 * Requisitos: Docker corriendo + `pnpm install` hecho. Dejá esta ventana abierta
 * mientras la usen; Ctrl+C para bajar todo.
 *
 * Nota Windows: la primera vez el Firewall puede preguntar si permitís Node en
 * la red — hay que decir "Permitir acceso" (redes privadas) para que los otros
 * equipos puedan conectarse.
 */
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

import QRCode from 'qrcode';

const esWindows = process.platform === 'win32';
const COMPOSE = ['compose', '-f', 'infra/docker-compose.yml'];

const SERVICIOS_DB = [
  'identity-service',
  'billing-service',
  'activity-service',
  'session-service',
  'scoring-service',
  'rewards-service',
  'notification-service',
  'audit-service',
];
const BACKEND = ['gateway', ...SERVICIOS_DB];

/**
 * Puerto de cada pieza. Se usa para dos cosas: el healthcheck del final y la
 * limpieza de procesos huérfanos del arranque.
 */
const PUERTOS = {
  gateway: 3000,
  'identity-service': 3001,
  'billing-service': 3002,
  'activity-service': 3003,
  'session-service': 3004,
  'scoring-service': 3005,
  'rewards-service': 3006,
  'notification-service': 3007,
  'audit-service': 3008,
};

/** Puertos de los frontends, que también quedan tomados por huérfanos. */
const PUERTOS_FRONT = [4200, 4321];

/** El gateway expone /api/health; los servicios internos, /internal/health. */
function urlHealth(servicio) {
  const ruta = servicio === 'gateway' ? '/api/health' : '/internal/health';

  return `http://localhost:${PUERTOS[servicio]}${ruta}`;
}

const hijos = [];

/**
 * `true` una vez que empezamos a levantar cosas. Antes de eso (diagnóstico,
 * limpieza, puerto ajeno) un error NO debe disparar el teardown: no hay nada
 * que bajar y `docker compose stop` sería un efecto no pedido.
 */
let arrancamos = false;

function log(msg) {
  console.log(`\x1b[36m[casa]\x1b[0m ${msg}`);
}

/**
 * IPs candidatas de la red de casa. Descarta adaptadores virtuales (WSL,
 * VirtualBox, Docker, Hyper-V…) que NO son la WiFi/Ethernet real, y prioriza
 * WiFi > Ethernet. Devuelve la lista ordenada (la [0] es la mejor apuesta).
 */
function ipsCandidatas() {
  const virtual = /vethernet|\bwsl\b|virtualbox|hyper-?v|docker|vmware|loopback|npcap/i;
  const candidatas = [];

  for (const [nombre, nets] of Object.entries(os.networkInterfaces())) {
    if (virtual.test(nombre)) {
      continue;
    }
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        candidatas.push({ nombre, address: net.address });
      }
    }
  }

  const prioridad = (n) => (/wi-?fi|wireless|wlan/i.test(n) ? 0 : /ethernet/i.test(n) ? 1 : 2);
  candidatas.sort((a, b) => prioridad(a.nombre) - prioridad(b.nombre));

  return candidatas;
}

/**
 * Nombre mDNS de esta PC (`http://<nombre>.local`), o `null` si el nombre del
 * equipo no es una etiqueta DNS usable. Windows 11, macOS, iOS y las distros
 * modernas responden y resuelven `.local` sin instalar nada; Android tiene
 * soporte irregular según versión — por eso el QR con la IP va igual, como
 * respaldo que funciona siempre.
 */
function nombreMdns() {
  const etiqueta = os.hostname().split('.')[0].toLowerCase();

  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(etiqueta) ? `${etiqueta}.local` : null;
}

/** QR ASCII para escanear con la cámara del celu, o `null` si no se pudo generar. */
async function qrDe(url) {
  try {
    return await QRCode.toString(url, { type: 'terminal', small: true, errorCorrectionLevel: 'L' });
  } catch {
    return null;
  }
}

/**
 * PIDs que están ESCUCHANDO en un puerto. Solo LISTENING: las conexiones
 * salientes o en TIME_WAIT no bloquean el bind y no hay que tocarlas.
 */
function pidsEscuchando(puerto) {
  const pids = new Set();

  if (esWindows) {
    const res = spawnSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });

    for (const linea of (res.stdout ?? '').split('\n')) {
      const campos = linea.trim().split(/\s+/);
      // TCP  <local>  <remoto>  LISTENING  <pid>
      if (campos.length >= 5 && campos[3] === 'LISTENING' && campos[1].endsWith(`:${puerto}`)) {
        pids.add(campos[4]);
      }
    }
  } else {
    const res = spawnSync('lsof', ['-ti', `tcp:${puerto}`, '-s', 'TCP:LISTEN'], {
      encoding: 'utf8',
    });

    for (const linea of (res.stdout ?? '').split('\n')) {
      if (linea.trim()) {
        pids.add(linea.trim());
      }
    }
  }

  return [...pids];
}

/** Nombre del ejecutable de un PID ('node.exe', 'node'…), o null si ya no existe. */
function nombreProceso(pid) {
  if (esWindows) {
    const res = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'], {
      encoding: 'utf8',
    });

    return (res.stdout ?? '').match(/^"([^"]+)"/)?.[1] ?? null;
  }

  const res = spawnSync('ps', ['-p', pid, '-o', 'comm='], { encoding: 'utf8' });

  return (res.stdout ?? '').trim() || null;
}

function matarPid(pid) {
  if (esWindows) {
    spawnSync('taskkill', ['/PID', pid, '/F', '/T'], { stdio: 'ignore' });
  } else {
    spawnSync('kill', ['-9', pid], { stdio: 'ignore' });
  }
}

/**
 * Mata los procesos Node huérfanos de una corrida anterior.
 *
 * Hace falta porque el teardown no siempre alcanza a los nietos: cada `serve`
 * corre vía el executor `@nx/js:node`, que forkea su propio proceso; si el
 * padre (`nx run-many`) muere primero, el nieto queda huérfano y el
 * `taskkill /T` del árbol ya no lo encuentra. Ese huérfano se queda con el
 * puerto y, en la corrida siguiente, el servicio nuevo no puede bindear y muere
 * — que es exactamente el síntoma de "algunos servicios no arrancaron".
 *
 * Solo mata procesos `node`: si el puerto lo tiene otra cosa (otro proyecto,
 * un Docker publicado), avisa y aborta en vez de romper algo ajeno.
 */
function liberarPuertos() {
  const puertos = [...Object.values(PUERTOS), ...PUERTOS_FRONT];
  const ajenos = [];
  let matados = 0;

  for (const puerto of puertos) {
    for (const pid of pidsEscuchando(puerto)) {
      const nombre = nombreProceso(pid);

      if (!nombre) {
        continue;
      }

      if (/^node(\.exe)?$/i.test(nombre)) {
        log(`liberando puerto ${puerto} (había un ${nombre} viejo, pid ${pid})`);
        matarPid(pid);
        matados++;
      } else {
        ajenos.push(`  puerto ${puerto}: ocupado por ${nombre} (pid ${pid})`);
      }
    }
  }

  if (ajenos.length > 0) {
    throw new Error(
      `hay puertos tomados por procesos que NO son de este proyecto:\n${ajenos.join('\n')}\n` +
        `Cerrá esos programas (o cambiá sus puertos) y volvé a intentar.`
    );
  }

  if (matados > 0) {
    log(`limpié ${matados} proceso(s) huérfano(s) de una corrida anterior`);
  }
}

/**
 * `--diagnostico`: reporta quién tiene cada puerto y si responde el health, sin
 * tocar nada. Sirve para responder "¿por qué no arrancó tal servicio?" sobre un
 * stack ya levantado, o para ver qué quedó vivo después de un Ctrl+C.
 */
async function diagnostico() {
  log('estado de los puertos del proyecto:\n');

  for (const [servicio, puerto] of Object.entries(PUERTOS)) {
    const pids = pidsEscuchando(puerto);
    const responde = pids.length > 0 && (await esperar(urlHealth(servicio), 1500));
    const marca = responde ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    const quien =
      pids.length === 0
        ? 'nadie escuchando'
        : `${nombreProceso(pids[0]) ?? '?'} (pid ${pids.join(', ')})${responde ? '' : ' — NO responde el health'}`;

    console.log(`     ${marca} ${servicio.padEnd(22)} :${puerto}  ${quien}`);
  }

  for (const puerto of PUERTOS_FRONT) {
    const pids = pidsEscuchando(puerto);
    const nombre = puerto === 4200 ? 'app-web' : 'public-site';
    const marca = pids.length > 0 ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';

    console.log(
      `     ${marca} ${nombre.padEnd(22)} :${puerto}  ${
        pids.length === 0 ? 'nadie escuchando' : `${nombreProceso(pids[0]) ?? '?'} (pid ${pids.join(', ')})`
      }`
    );
  }

  console.log('');
}

function correr(cmd, args, opciones = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: esWindows, ...opciones });
  if (res.status !== 0) {
    throw new Error(`"${cmd} ${args.join(' ')}" salió con código ${res.status}`);
  }
}

async function esperar(url, timeoutMs) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    try {
      if ((await fetch(url)).ok) {
        return true;
      }
    } catch {
      /* todavía no responde */
    }
    await sleep(1000);
  }

  return false;
}

/**
 * Espera el healthcheck de LOS 9 servicios, no solo el del gateway, y aborta si
 * alguno no levantó. Chequear solo el gateway (como se hacía antes) esconde el
 * problema: los otros 8 pueden estar caídos y el script igual anuncia "LISTO".
 *
 * En paralelo y con un único deadline: en serie, 9 timeouts de 180s podrían
 * sumar media hora antes de avisar.
 */
async function esperarBackend(timeoutMs = 180_000) {
  log(`esperando a que respondan los ${BACKEND.length} servicios…`);

  const resultados = await Promise.all(
    BACKEND.map(async (servicio) => ({
      servicio,
      ok: await esperar(urlHealth(servicio), timeoutMs),
    }))
  );

  console.log('');
  for (const { servicio, ok } of resultados) {
    const marca = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`     ${marca} ${servicio.padEnd(22)} :${PUERTOS[servicio]}`);
  }
  console.log('');

  const caidos = resultados.filter((r) => !r.ok).map((r) => r.servicio);

  if (caidos.length > 0) {
    throw new Error(
      `no arrancaron ${caidos.length} de ${BACKEND.length} servicios: ${caidos.join(', ')}.\n` +
        `Buscá el error de esos servicios en los logs de arriba (Nx los prefija con el nombre\n` +
        `del proyecto). Las causas más comunes: una migración que falló, una variable de\n` +
        `entorno que falta en .env, o el puerto tomado por otro programa.`
    );
  }
}

/** Reemite las líneas de un stream prefijadas con el nombre del servicio. */
function prefijar(stream, servicio) {
  let resto = '';

  stream.setEncoding('utf8');
  stream.on('data', (trozo) => {
    const lineas = (resto + trozo).split('\n');
    resto = lineas.pop() ?? '';

    for (const linea of lineas) {
      console.log(`\x1b[35m[${servicio}]\x1b[0m ${linea}`);
    }
  });
}

/**
 * Arranca un servicio ya compilado, directo con node.
 *
 * NO se usa `nx run-many -t serve` para esto: los 9 `serve` son tareas
 * `continuous` y lanzarlas juntas hace que Nx crea ver un ciclo entre ellas
 * ("Recursive task invocation detected") y aborte el batch entero a mitad de
 * camino — dejando algunos servicios arriba, otros no, y procesos huérfanos
 * ocupando puertos. El build sí va por Nx (tarea normal, cacheada); el arranque
 * es un `node dist/apps/<servicio>/main.js` por servicio.
 *
 * Cada servicio resuelve su `.env` con rutas relativas al cwd del workspace
 * (`ConfigModule.forRoot({ envFilePath: ['apps/<s>/.env', '.env'] })`), y este
 * script corre desde la raíz, así que la config le llega igual que antes.
 */
function spawnServicio(servicio, env) {
  const hijo = spawn('node', [`dist/apps/${servicio}/main.js`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });

  hijos.push(hijo);
  prefijar(hijo.stdout, servicio);
  prefijar(hijo.stderr, servicio);

  hijo.on('exit', (codigo) => {
    if (codigo) {
      console.log(`\x1b[31m[${servicio}] se cerró con código ${codigo}\x1b[0m`);
    }
  });

  return hijo;
}

function spawnPersistente(cmd, args, env, extra = {}) {
  const hijo = spawn(cmd, args, {
    stdio: 'inherit',
    shell: esWindows,
    detached: !esWindows,
    env: { ...process.env, ...env },
    ...extra,
  });
  hijos.push(hijo);

  return hijo;
}

function bajarTodo(codigoSalida = 0) {
  log('bajando…');
  for (const h of hijos) {
    if (h && !h.killed) {
      if (esWindows) {
        spawnSync('taskkill', ['/pid', String(h.pid), '/f', '/t'], { stdio: 'ignore' });
      } else {
        try {
          process.kill(-h.pid, 'SIGTERM');
        } catch {
          h.kill('SIGTERM');
        }
      }
    }
  }

  // Segunda pasada por puerto: matar el árbol no alcanza a los nietos que ya
  // quedaron huérfanos (ver liberarPuertos). Sin esto, los sobrevivientes se
  // quedan con el puerto y rompen el arranque siguiente.
  for (const puerto of [...Object.values(PUERTOS), ...PUERTOS_FRONT]) {
    for (const pid of pidsEscuchando(puerto)) {
      if (/^node(\.exe)?$/i.test(nombreProceso(pid) ?? '')) {
        matarPid(pid);
      }
    }
  }

  spawnSync('docker', [...COMPOSE, 'stop'], { stdio: 'ignore', shell: esWindows });
  process.exit(codigoSalida);
}

async function main() {
  if (process.argv.includes('--diagnostico')) {
    await diagnostico();

    return;
  }

  // `--limpiar`: mata lo que haya quedado vivo y sale, sin levantar nada.
  if (process.argv.includes('--limpiar')) {
    liberarPuertos();
    log('puertos liberados.');

    return;
  }

  const candidatas = ipsCandidatas();
  const ip = candidatas[0]?.address ?? 'localhost';

  // Antes que nada: si quedaron procesos de una corrida anterior, liberar sus
  // puertos. Si no, los servicios nuevos no pueden bindear y mueren en silencio.
  liberarPuertos();

  arrancamos = true;
  log('levantando infra (Postgres + RabbitMQ)…');
  correr('docker', [...COMPOSE, 'up', '-d']);

  log('esperando Postgres…');
  const limite = Date.now() + 60_000;
  while (Date.now() < limite) {
    const r = spawnSync('docker', [...COMPOSE, 'exec', '-T', 'postgres', 'pg_isready', '-U', 'dorado'], {
      stdio: 'ignore',
      shell: esWindows,
    });
    if (r.status === 0) {
      break;
    }
    await sleep(1500);
  }

  log('aplicando migraciones…');
  for (const s of SERVICIOS_DB) {
    correr('npx', ['prisma', 'migrate', 'deploy'], { cwd: `apps/${s}` });
  }

  log(`compilando los ${BACKEND.length} servicios (Nx cachea, suele ser instantáneo)…`);
  correr('pnpm', ['nx', 'run-many', '-t', 'build', '--projects', BACKEND.join(',')]);

  // Backend: CORS_ALLOW_LAN deja entrar a los equipos de la red local.
  log(`iniciando los ${BACKEND.length} servicios backend…`);
  for (const servicio of BACKEND) {
    spawnServicio(servicio, { CORS_ALLOW_LAN: 'true', REFRESH_COOKIE_SECURE: 'false' });
  }

  await esperarBackend();

  const nombre = nombreMdns();

  // Vite (que está abajo del dev server de Angular y del de Astro) rechaza con
  // 403 "Blocked request" cualquier Host que no reconozca — protección contra
  // DNS rebinding. Las IPs literales las acepta solas, pero un nombre como
  // `dorado.local` hay que declararlo o el atajo por nombre no sirve para nada.
  // CASA_HOSTS permite sumar otros (ej. el `dorado.casa` del DNS del router).
  const hostsPermitidos = [nombre, ...(process.env.CASA_HOSTS?.split(',') ?? [])]
    .map((h) => h?.trim())
    .filter(Boolean);

  // Frontends en 0.0.0.0 para que los alcance la red local.
  log('sirviendo app-web y public-site en la red…');
  spawnPersistente('pnpm', [
    'nx',
    'serve',
    'app-web',
    '--host',
    '0.0.0.0',
    ...hostsPermitidos.map((h) => `--allowed-hosts=${h}`),
  ]);
  // Astro 7: correr con cwd en la carpeta del sitio; `--root apps/public-site`
  // desde la raíz no resuelve el proyecto en esta versión. Astro no tiene flag
  // de CLI para esto, así que va por env y lo lee astro.config.mjs.
  spawnPersistente(
    'npx',
    ['astro', 'dev', '--host', '0.0.0.0'],
    { CASA_ALLOWED_HOSTS: hostsPermitidos.join(',') },
    { cwd: 'apps/public-site' }
  );

  await sleep(4000);

  const urlApp = `http://${ip}:4200`;
  const qr = await qrDe(urlApp);

  console.log('\n' + '='.repeat(64));
  log('¡LISTO! El sistema está corriendo en tu PC.');
  console.log('');
  console.log('  Que escaneen este QR con la cámara del celu:');
  console.log('');
  if (qr) {
    console.log(qr);
  } else {
    console.log(`     (no se pudo dibujar el QR — usá la dirección de abajo)`);
    console.log('');
  }
  if (nombre) {
    console.log(`  O que entren tipeando el nombre de esta PC:`);
    console.log(`     \x1b[32mhttp://${nombre}:4200\x1b[0m`);
    console.log('');
    console.log(`     Ese nombre NO cambia aunque el router les dé otra IP, así que`);
    console.log(`     conviene que cada uno lo guarde con "Agregar a pantalla de inicio"`);
    console.log(`     y le quede como un ícono. Si en algún celu no abre (pasa en varios`);
    console.log(`     Android), que use el QR o la IP directa: \x1b[32m${urlApp}\x1b[0m`);
  } else {
    console.log(`  O que entren tipeando: \x1b[32m${urlApp}\x1b[0m`);
  }
  console.log('');
  console.log(`  Vos, para registrar la organización la primera vez:`);
  console.log(`     \x1b[32mhttp://${nombre ?? ip}:4321/registro\x1b[0m (el sitio de registro)`);
  console.log('');
  console.log(`  (Todos los equipos tienen que estar en el MISMO WiFi que esta PC.)`);
  if (candidatas.length > 1) {
    console.log('');
    console.log(`  Si esa dirección no funciona, probá con otra de tus redes:`);
    for (const c of candidatas.slice(1)) {
      console.log(`     http://${c.address}:4200   (${c.nombre})`);
    }
  }
  console.log('='.repeat(64) + '\n');
  log('Dejá esta ventana abierta mientras la usen. Ctrl+C para bajar todo.');
}

// Ctrl+C es una salida esperada, no un fallo → código 0.
process.on('SIGINT', () => bajarTodo(0));
process.on('SIGTERM', () => bajarTodo(0));

main().catch((error) => {
  console.error(`\x1b[31m[casa:error]\x1b[0m ${error instanceof Error ? error.message : error}`);

  if (arrancamos) {
    bajarTodo(1);
  }

  process.exit(1);
});
