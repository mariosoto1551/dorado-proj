#!/usr/bin/env node
// @ts-check
/**
 * Orquestador de la suite E2E de la Fase 12 (ver docs/phases/fase-12-qa-hardening.md).
 *
 * Levanta el STACK COMPLETO reutilizando el flujo de dev — no dockeriza los
 * servicios (eso es Fase 13):
 *
 *   1. Infra vía docker-compose (Postgres + RabbitMQ).
 *   2. `prisma migrate deploy` en las 9 bases.
 *   3. `nx run-many -t serve` de gateway + 9 servicios (billing siembra planes
 *      FREE/PRO en su bootstrap).
 *   4. Espera healthchecks (/internal/health de cada servicio + /api/health).
 *   5. Corre Playwright (`nx e2e e2e`).
 *   6. Teardown: mata el árbol de procesos serve y baja la infra.
 *
 * Uso:
 *   node scripts/e2e-up.mjs                 # ciclo completo (recomendado)
 *   node scripts/e2e-up.mjs --keep-up       # deja el stack arriba al terminar
 *   node scripts/e2e-up.mjs --no-infra      # asume infra ya levantada
 *   node scripts/e2e-up.mjs --serve-only    # solo levanta el stack y espera
 *
 * Windows/PowerShell y bash: usa taskkill /T en Windows y SIGTERM al grupo en
 * POSIX para bajar el árbol de `nx run-many`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const esWindows = process.platform === 'win32';
const args = new Set(process.argv.slice(2));
const KEEP_UP = args.has('--keep-up');
const NO_INFRA = args.has('--no-infra');
const SERVE_ONLY = args.has('--serve-only');

const COMPOSE = ['compose', '-f', 'infra/docker-compose.yml'];

/** Servicios backend con base propia (orden no importa para migrate). */
const SERVICIOS_DB = [
  'identity-service',
  'billing-service',
  'activity-service',
  'session-service',
  'scoring-service',
  'rewards-service',
  'notification-service',
  'audit-service',
  // fase-14-29: base ai_db. Va acá y no como caso aparte porque migra igual
  // que los otros ocho.
  'ai-service',
];

const SERVICIOS_SERVE = ['gateway', ...SERVICIOS_DB];

/**
 * Puerto del stub del proveedor de IA (fase-14-29 tanda 7).
 *
 * `ai-service` arranca apuntado acá vía `OPENAI_BASE_URL`, así que **la suite
 * no llama a OpenAI ni gasta un centavo**, y el servidor lo levanta cada
 * escenario con el guion que necesita. Si nadie lo levanta, las llamadas al
 * proveedor fallan con ECONNREFUSED → 503 `PROVEEDOR_NO_DISPONIBLE`, que es
 * exactamente el comportamiento que se quiere para las suites que no hablan
 * con el asistente.
 */
const PUERTO_STUB_IA = 4999;

/** puerto de healthcheck por servicio. */
const HEALTH = {
  gateway: 'http://localhost:3000/api/health',
  'identity-service': 'http://localhost:3001/internal/health',
  'billing-service': 'http://localhost:3002/internal/health',
  'activity-service': 'http://localhost:3003/internal/health',
  'session-service': 'http://localhost:3004/internal/health',
  'scoring-service': 'http://localhost:3005/internal/health',
  'rewards-service': 'http://localhost:3006/internal/health',
  'notification-service': 'http://localhost:3007/internal/health',
  'audit-service': 'http://localhost:3008/internal/health',
  'ai-service': 'http://localhost:3009/internal/health',
};

function log(etapa, msg) {
  console.log(`\x1b[36m[e2e:${etapa}]\x1b[0m ${msg}`);
}

function fatal(msg) {
  console.error(`\x1b[31m[e2e:error]\x1b[0m ${msg}`);
  process.exitCode = 1;
}

/** Corre un comando y espera; lanza si el exit code no es 0. */
function correr(cmd, cmdArgs, opciones = {}) {
  const res = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: esWindows, ...opciones });

  if (res.status !== 0) {
    throw new Error(`"${cmd} ${cmdArgs.join(' ')}" salió con código ${res.status}`);
  }
}

async function esperarHealth(url, timeoutMs) {
  const limite = Date.now() + timeoutMs;

  while (Date.now() < limite) {
    try {
      const res = await fetch(url);

      if (res.ok) {
        return true;
      }
    } catch {
      // todavía no responde
    }
    await sleep(1000);
  }

  return false;
}

async function levantarInfra() {
  if (NO_INFRA) {
    log('infra', 'saltada (--no-infra)');

    return;
  }

  log('infra', 'docker compose up -d (postgres, rabbitmq)…');
  correr('docker', [...COMPOSE, 'up', '-d']);

  log('infra', 'esperando Postgres…');
  const limite = Date.now() + 60_000;
  while (Date.now() < limite) {
    const res = spawnSync(
      'docker',
      [...COMPOSE, 'exec', '-T', 'postgres', 'pg_isready', '-U', 'dorado'],
      { stdio: 'ignore', shell: esWindows }
    );
    if (res.status === 0) {
      break;
    }
    await sleep(1500);
  }

  log('infra', 'esperando RabbitMQ management (:15672)…');
  if (!(await esperarHealth('http://localhost:15672', 60_000))) {
    throw new Error('RabbitMQ management no respondió a tiempo');
  }
}

function migrar() {
  log('migrate', `prisma migrate deploy en ${SERVICIOS_DB.length} bases…`);
  for (const servicio of SERVICIOS_DB) {
    log('migrate', servicio);
    correr('npx', ['prisma', 'migrate', 'deploy'], { cwd: `apps/${servicio}` });
  }
}

/**
 * Levanta el stack con nx run-many; devuelve el ChildProcess.
 *
 * El rate limit del Gateway se afloja **solo acá** (fase-14-23 T4·2ª): la suite
 * tiene cinco escenarios de navegador que corren seguidos contra la misma IP y
 * comparten el presupuesto de 100 req/min, así que suites que están bien
 * empiezan a fallar por lo que gastaron las anteriores. El default del
 * middleware sigue siendo el de la spec — producción no define estas variables.
 */
function levantarStack() {
  log('serve', `nx run-many -t serve (${SERVICIOS_SERVE.length} procesos)…`);
  const hijo = spawn(
    'pnpm',
    ['nx', 'run-many', '-t', 'serve', '--projects', SERVICIOS_SERVE.join(','), '--output-style', 'stream'],
    {
      stdio: 'inherit',
      shell: esWindows,
      detached: !esWindows,
      env: {
        ...process.env,
        RATE_LIMIT_GLOBAL: '1000',
        RATE_LIMIT_AUTH: '100',
        // fase-14-29 tanda 7: el asistente habla con el stub, no con OpenAI.
        // La key se pisa con una de mentira: si acá quedara la real y alguien
        // cambiara la base sin querer, cada corrida de la suite gastaría plata.
        OPENAI_BASE_URL: `http://localhost:${PUERTO_STUB_IA}/v1`,
        OPENAI_API_KEY: 'sk-stub-para-la-suite-e2e-no-es-real',
      },
    }
  );

  return hijo;
}

async function esperarStack() {
  log('health', `esperando healthchecks de los ${SERVICIOS_SERVE.length} procesos (hasta 180s)…`);
  for (const [servicio, url] of Object.entries(HEALTH)) {
    const ok = await esperarHealth(url, 180_000);
    if (!ok) {
      throw new Error(`${servicio} no pasó el healthcheck (${url})`);
    }
    log('health', `${servicio} ✓`);
  }
}

function matarStack(hijo) {
  if (!hijo || hijo.killed) {
    return;
  }

  log('teardown', 'bajando el stack de serve…');
  if (esWindows) {
    spawnSync('taskkill', ['/pid', String(hijo.pid), '/f', '/t'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-hijo.pid, 'SIGTERM');
    } catch {
      hijo.kill('SIGTERM');
    }
  }
}

function bajarInfra() {
  if (NO_INFRA || KEEP_UP) {
    return;
  }
  log('teardown', 'docker compose down…');
  spawnSync('docker', [...COMPOSE, 'down'], { stdio: 'inherit', shell: esWindows });
}

async function main() {
  let stack;

  try {
    await levantarInfra();
    migrar();
    stack = levantarStack();
    await esperarStack();

    if (SERVE_ONLY) {
      log('serve', 'stack arriba. Ctrl+C para bajar. (--serve-only)');
      await new Promise((resolver) => {
        // Nunca resuelve: mantiene el stack arriba hasta Ctrl+C.
        void resolver;
      });
      return;
    }

    log('test', 'corriendo Playwright (nx e2e e2e)…');
    const res = spawnSync('pnpm', ['nx', 'e2e', 'e2e'], { stdio: 'inherit', shell: esWindows });
    process.exitCode = res.status ?? 1;
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  } finally {
    if (!KEEP_UP) {
      matarStack(stack);
      bajarInfra();
    } else {
      log('teardown', 'stack dejado arriba (--keep-up)');
    }
  }
}

main();
