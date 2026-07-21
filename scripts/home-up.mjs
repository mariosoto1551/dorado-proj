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
 *   5. Te imprime la dirección para pasarle a tu familia.
 *
 * Tu familia entra desde el navegador de su celu a  http://<IP-de-tu-PC>:4200
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

const hijos = [];

function log(msg) {
  console.log(`\x1b[36m[casa]\x1b[0m ${msg}`);
}

/** Primera IPv4 no interna = la IP de tu PC en la red de casa. */
function ipDeLaRed() {
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }

  return 'localhost';
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

function spawnPersistente(cmd, args, env) {
  const hijo = spawn(cmd, args, {
    stdio: 'inherit',
    shell: esWindows,
    detached: !esWindows,
    env: { ...process.env, ...env },
  });
  hijos.push(hijo);

  return hijo;
}

function bajarTodo() {
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
  spawnSync('docker', [...COMPOSE, 'stop'], { stdio: 'ignore', shell: esWindows });
  process.exit(0);
}

async function main() {
  const ip = ipDeLaRed();

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

  // Backend: CORS_ALLOW_LAN deja entrar a los equipos de la red local.
  log('iniciando los 9 servicios backend…');
  spawnPersistente(
    'pnpm',
    ['nx', 'run-many', '-t', 'serve', '--projects', BACKEND.join(','), '--output-style', 'stream'],
    { CORS_ALLOW_LAN: 'true', REFRESH_COOKIE_SECURE: 'false' }
  );

  log('esperando el gateway…');
  if (!(await esperar('http://localhost:3000/api/health', 180_000))) {
    throw new Error('el gateway no respondió a tiempo');
  }

  // Frontends en 0.0.0.0 para que los alcance la red local.
  log('sirviendo app-web y public-site en la red…');
  spawnPersistente('pnpm', ['nx', 'serve', 'app-web', '--host', '0.0.0.0']);
  spawnPersistente('npx', ['astro', 'dev', '--root', 'apps/public-site', '--host', '0.0.0.0']);

  await sleep(4000);
  console.log('\n' + '='.repeat(64));
  log('¡LISTO! El sistema está corriendo en tu PC.');
  console.log('');
  console.log(`  Tu familia entra desde el navegador de su celu/laptop a:`);
  console.log(`     \x1b[32mhttp://${ip}:4200\x1b[0m        (la app)`);
  console.log('');
  console.log(`  Vos, para registrar la organización la primera vez:`);
  console.log(`     \x1b[32mhttp://${ip}:4321/registro\x1b[0m (el sitio de registro)`);
  console.log('');
  console.log(`  (Todos los equipos tienen que estar en el MISMO WiFi que esta PC.)`);
  console.log('='.repeat(64) + '\n');
  log('Dejá esta ventana abierta mientras la usen. Ctrl+C para bajar todo.');
}

process.on('SIGINT', bajarTodo);
process.on('SIGTERM', bajarTodo);

main().catch((error) => {
  console.error(`\x1b[31m[casa:error]\x1b[0m ${error instanceof Error ? error.message : error}`);
  bajarTodo();
});
