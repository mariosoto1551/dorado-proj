// Seed CLI de billing-service (`prisma db seed`, corre también tras
// `prisma migrate dev`). La MISMA función corre al bootstrap del servicio
// (src/prisma/seed-planes.service.ts), así que este script es opcional en
// desarrollo — existe para poder sembrar sin levantar el servicio.
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';
import { seedPlanes } from '../src/prisma/seed-planes';

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];

  if (!url) {
    throw new Error('DATABASE_URL es requerida para correr el seed');
  }

  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    await seedPlanes(client);
    console.log('Seed de Planes aplicado (FREE/PRO)');
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
