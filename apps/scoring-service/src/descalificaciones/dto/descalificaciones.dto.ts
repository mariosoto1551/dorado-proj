import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// POST /scoring/secciones/:seccionId/usuarios/:usuarioId/descalificar
// El Response es DescalificacionDto de shared-types.
export class DescalificarUsuarioRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motivo!: string;
}
