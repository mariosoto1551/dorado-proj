import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';

// POST /scoring/eventos-puntos/:id/corregir — el Response es EventoPuntosDto
// de shared-types (la fila NUEVA de corrección, no la original).
export class CorregirEventoPuntosRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motivo!: string;

  @IsInt()
  puntosAjuste!: number;
}
