import type { UsuarioDto } from '@dorado/shared-types';

/**
 * Quién cuenta como integrante del grupo **hoy**.
 *
 * `GET /identity/grupos/:grupoId/usuarios` devuelve también a los INACTIVO, y
 * eso es correcto: la pantalla de Integrantes es la que los da de baja y la que
 * los reactiva, así que ahí tienen que estar. El endpoint INTERNO
 * (`internal.controller.ts`) ya filtra por ACTIVO, así que el backend nunca les
 * asigna un turno ni les cuenta una obligatoria.
 *
 * El problema es del lado del navegador: toda pantalla que use esa lista para
 * **elegir a alguien** —a quién le corresponde una actividad, a quién se le
 * registra algo, quién entra en la rotación— tiene que descartar a los dados de
 * baja. Un desactivado ofrecido en un selector se elige sin querer y queda
 * guardado en `usuariosPermitidos` o en una secuencia de turnos, donde no hace
 * nada salvo confundir la próxima vez que se abre el formulario.
 *
 * La regla es la separación, no el filtro en sí:
 *
 * - **elegir** a alguien → `soloActivos(...)`.
 * - **nombrar** a alguien (chips, historial, ranking, un turno ya guardado) →
 *   la lista completa. Un id sin nombre se muestra como «(sin nombre)» o se
 *   omite, y esconder a Ana de una actividad que sigue asignada a Ana es peor
 *   que mostrarla dada de baja.
 */
export function soloActivos(usuarios: readonly UsuarioDto[]): UsuarioDto[] {
  return usuarios.filter((usuario) => usuario.estado === 'ACTIVO');
}
