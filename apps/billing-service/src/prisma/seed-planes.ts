import { CodigoPlan } from '../generated/prisma/enums';

/**
 * Catálogo de Planes (spec fase-04, "Seed de Planes"). Fuente única de estos
 * valores: se aplica por upsert idempotente al arrancar el servicio (y vía
 * `prisma db seed`), así el catálogo en base siempre refleja este archivo.
 *
 * Los números de límite FREE no vienen de los documentos fuente — son el
 * default de la spec, a confirmar antes de Fase 13 (alta del piloto real).
 */
export const PLANES_SEED = [
  {
    codigo: CodigoPlan.FREE,
    nombre: 'Free',
    limiteTutores: 2,
    limiteUsuarios: 5,
    limiteGrupos: 1,
    limiteActividadesPorGrupo: 15,
    whiteLabel: false,
    reportesAvanzados: false,
  },
  {
    codigo: CodigoPlan.PRO,
    nombre: 'Pro',
    limiteTutores: null,
    limiteUsuarios: null,
    limiteGrupos: null,
    limiteActividadesPorGrupo: null,
    whiteLabel: true,
    reportesAvanzados: true,
  },
] as const;

interface DatosPlan {
  nombre: string;
  limiteTutores: number | null;
  limiteUsuarios: number | null;
  limiteGrupos: number | null;
  limiteActividadesPorGrupo: number | null;
  whiteLabel: boolean;
  reportesAvanzados: boolean;
}

/**
 * Forma mínima del delegate de `plan` que necesita el seed: así acepta tanto
 * el PrismaClient crudo (CLI de seed) como el cliente extendido del servicio
 * (cuyo tipo `$extends` no es asignable a `Pick<PrismaClient, 'plan'>`).
 */
interface DelegatePlan {
  upsert(args: {
    where: { codigo: CodigoPlan };
    create: DatosPlan & { codigo: CodigoPlan };
    update: DatosPlan;
  }): Promise<unknown>;
}

export async function seedPlanes(client: { plan: DelegatePlan }): Promise<void> {
  for (const plan of PLANES_SEED) {
    const { codigo, ...datos } = plan;

    await client.plan.upsert({
      where: { codigo },
      create: { codigo, ...datos },
      update: datos,
    });
  }
}
