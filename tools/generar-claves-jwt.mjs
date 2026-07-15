// Genera el par de claves RS256 para desarrollo local (ADR-00 §3) y lo imprime
// en el formato que esperan los .env (PEM codificado en base64, una línea).
//
//   node tools/generar-claves-jwt.mjs
//
// JWT_PRIVATE_KEY va SOLO en apps/identity-service/.env (único emisor).
// JWT_PUBLIC_KEY va en el .env de todos los servicios que validan tokens.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const privadaPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicaPem = publicKey.export({ type: 'spki', format: 'pem' });

console.log(`JWT_PRIVATE_KEY=${Buffer.from(privadaPem).toString('base64')}`);
console.log(`JWT_PUBLIC_KEY=${Buffer.from(publicaPem).toString('base64')}`);
