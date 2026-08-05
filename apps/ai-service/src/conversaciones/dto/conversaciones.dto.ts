import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

import { CrearConversacionIaRequest, EnviarMensajeIaRequest } from '@dorado/shared-types';

/**
 * Techo del mensaje del usuario. No es una restricción de producto: es que
 * cada carácter que entra se paga como token, y un pegado accidental de tres
 * páginas cuesta dinero real de la plataforma (decisión 1).
 */
const LARGO_MAXIMO_MENSAJE = 4_000;

export class CrearConversacionBody implements CrearConversacionIaRequest {
  @IsUUID()
  grupoId!: string;

  @IsString()
  @IsNotEmpty({ message: 'El mensaje no puede estar vacío' })
  @MaxLength(LARGO_MAXIMO_MENSAJE)
  primerMensaje!: string;
}

export class EnviarMensajeBody implements EnviarMensajeIaRequest {
  @IsString()
  @IsNotEmpty({ message: 'El mensaje no puede estar vacío' })
  @MaxLength(LARGO_MAXIMO_MENSAJE)
  texto!: string;
}
