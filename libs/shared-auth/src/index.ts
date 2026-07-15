// Autenticación/autorización multi-tenant compartida — ADR-00 §2–4 y §7.
// No reimplementar nada de esto por servicio: se importa desde acá.
export * from './lib/api-error';
export * from './lib/current-tenant.decorator';
export * from './lib/excepciones';
export * from './lib/http-exception.filter';
export * from './lib/internal-secret.guard';
export * from './lib/jwt-keys';
export * from './lib/prisma-tenant-extension';
export * from './lib/roles.decorator';
export * from './lib/roles.guard';
export * from './lib/tenant-context.guard';
export * from './lib/tenant.storage';
