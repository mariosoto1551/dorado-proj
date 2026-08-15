#!/usr/bin/env node
// @ts-check
/**
 * Orquestador de la suite E2E de la Fase 12 (ver docs/phases/fase-12-qa-hardening.md).
 *
 * Levanta el STACK COMPLETO reutilizando el flujo de dev — no dockeriza los
 * servicios (eso es Fase 13):
 *
 *   0. Genera los `apps/<servicio>/.env` que falten (clon limpio / CI).
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
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

/**
 * Crea los `apps/<servicio>/.env` que falten, a partir de su `.env.example`.
 *
 * **Por qué existe.** Los `.env` están gitignoreados (y tiene que seguir siendo
 * así), pero todo el stack depende de ellos: el CLI de Prisma lee `DATABASE_URL`
 * de ahí vía `prisma.config.ts`, y cada servicio valida su entorno al arrancar.
 * En un clon limpio —o sea, en CI— no existe ninguno, y el síntoma no dice nada
 * de eso: `prisma migrate deploy` se conecta al placeholder que deja
 * `prisma.config.ts` cuando no hay `DATABASE_URL` y falla con
 * `P1000: Authentication failed ... database "placeholder"`. El job `e2e` del
 * workflow venía fallando así desde que se creó.
 *
 * **Nunca pisa un `.env` existente**: el de desarrollo puede tener la key real
 * de OpenAI, la cuenta de PLATFORM_ADMIN o una base distinta.
 *
 * Dos detalles que parecen de más y no lo son:
 *
 * 1. **Las claves JWT se comparten.** Identity firma y los otros nueve validan
 *    con la pública del mismo par. Si ya hay algún `.env`, se REUSA su par en
 *    vez de generar uno nuevo: generarlo dejaría a los servicios nuevos
 *    validando con una clave que no corresponde a la que firma, y el síntoma
 *    sería un 401 en todos lados sin ninguna pista de por qué.
 * 2. **Las líneas con valor vacío se descartan.** `@IsOptional()` de
 *    class-validator solo saltea `undefined`, no la cadena vacía, así que un
 *    `PLATFORM_ADMIN_EMAIL=` copiado tal cual del ejemplo entra al `@Matches`
 *    y **tira abajo el arranque de identity-service**. Ausente es opcional;
 *    vacío es inválido.
 */
function prepararEntorno() {
  const rutaEnv = (servicio) => `apps/${servicio}/.env`;
  const faltantes = SERVICIOS_SERVE.filter((s) => !existsSync(rutaEnv(s)));

  avisarClavesQueFaltan(SERVICIOS_SERVE.filter((s) => !faltantes.includes(s)));

  if (faltantes.length === 0) {
    log('env', 'todos los .env ya existen — no se toca ninguno');

    return;
  }

  const claves = clavesJwtExistentes() ?? generarClavesJwt();

  for (const servicio of faltantes) {
    const ejemplo = `apps/${servicio}/.env.example`;

    if (!existsSync(ejemplo)) {
      throw new Error(`Falta ${ejemplo} y tampoco hay ${rutaEnv(servicio)}`);
    }

    const lineas = readFileSync(ejemplo, 'utf8')
      .split(/\r?\n/)
      .filter((linea) => {
        const asignacion = linea.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);

        // Comentarios y líneas en blanco se conservan; las asignaciones sin
        // valor se van (ver punto 2 del comentario de arriba).
        return !asignacion || asignacion[2].trim() !== '';
      });

    lineas.push(`JWT_PUBLIC_KEY=${claves.publica}`);

    if (servicio === 'identity-service') {
      lineas.push(`JWT_PRIVATE_KEY=${claves.privada}`);
    }

    writeFileSync(rutaEnv(servicio), `${lineas.join('\n')}\n`);
  }

  log('env', `${faltantes.length} .env generados desde su .env.example: ${faltantes.join(', ')}`);
}

/**
 * Avisa qué claves tiene el `.env.example` y NO el `.env` de esa persona.
 *
 * **Por qué existe** (fase-14-34): el generador de arriba nunca pisa un `.env`
 * que ya existe —y está bien, puede tener la key real de OpenAI—, pero eso
 * significa que **una variable nueva llega a los clones limpios y no a las
 * máquinas donde se trabaja todos los días**. El ítem 34 agregó
 * `SCORING_INTERNAL_URL` a activity-service y el síntoma fue el de siempre: el
 * servicio no arranca, el healthcheck se cae por timeout, y el error real queda
 * enterrado en el log de `nx run-many` de diez procesos.
 *
 * Solo avisa; **no toca el archivo**. Y avisa por nombre de clave, que es lo
 * único que hace falta para arreglarlo en diez segundos.
 */
function avisarClavesQueFaltan(servicios) {
  const claves = (ruta) =>
    existsSync(ruta)
      ? readFileSync(ruta, 'utf8')
          .split(/\r?\n/)
          .map((linea) => linea.match(/^([A-Z_][A-Z0-9_]*)=/)?.[1])
          .filter((clave) => clave !== undefined)
      : [];

  for (const servicio of servicios) {
    const enEjemplo = claves(`apps/${servicio}/.env.example`);
    const enLocal = new Set(claves(`apps/${servicio}/.env`));
    const ausentes = enEjemplo.filter((clave) => !enLocal.has(clave));

    if (ausentes.length > 0) {
      console.warn(
        `\x1b[33mAVISO\x1b[0m: apps/${servicio}/.env no tiene ${ausentes.join(', ')} — ` +
          'está en su .env.example. Si es requerida, el servicio no va a arrancar ' +
          'y el healthcheck va a morir por timeout sin decir por qué.'
      );
    }
  }
}

/** Par RS256 ya en uso, leído de los `.env` que existan (o `null`). */
function clavesJwtExistentes() {
  const leer = (servicio, clave) => {
    const ruta = `apps/${servicio}/.env`;

    if (!existsSync(ruta)) {
      return undefined;
    }

    return readFileSync(ruta, 'utf8').match(new RegExp(`^${clave}=(.+)$`, 'm'))?.[1]?.trim();
  };

  const privada = leer('identity-service', 'JWT_PRIVATE_KEY');
  const publica = leer('identity-service', 'JWT_PUBLIC_KEY');

  if (privada && publica) {
    return { privada, publica };
  }

  // Hay .env de otros servicios pero no el de identity (o está incompleto): no
  // se puede recuperar la privada, y generar un par nuevo dejaría a los que ya
  // existen validando con otra clave. Se avisa en vez de romper en silencio.
  const ajena = SERVICIOS_SERVE.map((s) => leer(s, 'JWT_PUBLIC_KEY')).find(Boolean);

  if (ajena) {
    log(
      'env',
      '\x1b[33mAVISO\x1b[0m: hay .env con JWT_PUBLIC_KEY pero no se pudo leer el par completo ' +
        'de identity-service. Se genera uno nuevo y los .env viejos van a quedar desalineados ' +
        '(401 en todos lados). Borrá los apps/*/.env y volvé a correr para regenerarlos juntos.'
    );
  }

  return null;
}

function generarClavesJwt() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  return {
    privada: Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64'),
    publica: Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64'),
  };
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
    // Antes que la infra: si falta un .env, mejor enterarse en el primer
    // segundo que después de levantar Postgres y RabbitMQ para nada.
    prepararEntorno();
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
