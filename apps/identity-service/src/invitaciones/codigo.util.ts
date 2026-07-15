import { randomInt } from 'node:crypto';

// 8 chars, alfanumérico mayúsculas, sin 0/O/1/I (spec fase-02, modelo Invitacion).
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LARGO_CODIGO = 8;

export function generarCodigoInvitacion(): string {
  let codigo = '';

  for (let i = 0; i < LARGO_CODIGO; i++) {
    codigo += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
  }

  return codigo;
}
