import { describe, expect, it, vi } from 'vitest';

import type { ActivityClientService } from '../clientes/activity-client.service';
import type { IdentityClientService } from '../clientes/identity-client.service';
import type { RewardsClientService } from '../clientes/rewards-client.service';
import type { ScoringClientService } from '../clientes/scoring-client.service';
import type { ContextoHerramienta } from '../comun/acceso-grupo.service';
import { HerramientasService } from './herramientas.service';

const CONTEXTO: ContextoHerramienta = { organizacionId: 'org-1', grupoId: 'grupo-1' };

function crearMocks() {
  const activity = {
    actividades: vi.fn(async () => [{ id: 'act-1', nombre: 'Tender la cama' }]),
    conductas: vi.fn(async () => [{ id: 'con-1', nombre: 'Gritar' }]),
    resumenCumplimiento: vi.fn(async (grupoId: string, dias: number) => ({
      grupoId,
      dias,
      actividades: [],
    })),
  } as unknown as ActivityClientService;

  const identity = {
    participantes: vi.fn(async () => [
      {
        id: 'u-1',
        nombre: 'Luciana',
        username: 'luciana',
        rolGrupo: { id: 'rol-1', nombre: 'cocina', colorHex: '#fff' },
      },
      { id: 'u-2', nombre: 'José', username: 'jose', rolGrupo: null },
    ]),
    roles: vi.fn(async () => [
      { id: 'rol-1', nombre: 'cocina', estado: 'ACTIVO' },
      { id: 'rol-2', nombre: 'viejo', estado: 'INACTIVO' },
    ]),
    equipos: vi.fn(async () => [
      {
        equipoId: 'eq-1',
        nombre: 'Cocina',
        estado: 'ACTIVO',
        jefeUsuarioId: 'u-1',
        miembros: [
          { usuarioId: 'u-1', rol: 'JEFE' },
          { usuarioId: 'u-2', rol: 'MIEMBRO' },
        ],
      },
      { equipoId: 'eq-2', nombre: 'Disuelto', estado: 'INACTIVO', jefeUsuarioId: 'u-2', miembros: [] },
    ]),
  } as unknown as IdentityClientService;

  const scoring = {
    umbrales: vi.fn(async () => [{ id: 'z-1', nombreZona: 'Verde' }]),
    resumenPuntajes: vi.fn(async () => ({
      grupoId: 'grupo-1',
      seccionId: 'sec-1',
      origen: 'EN_VIVO' as const,
      puntajes: [
        { usuarioId: 'u-1', puntajeTotal: 27, nombreZona: 'Verde', descalificado: false },
        { usuarioId: 'fantasma', puntajeTotal: 3, nombreZona: null, descalificado: true },
      ],
    })),
  } as unknown as ScoringClientService;

  const rewards = {
    recompensas: vi.fn(async () => [{ id: 'r-1', nombre: 'Helado' }]),
    rendimientos: vi.fn(async () => [{ origenId: 'act-1', monedas: 5 }]),
  } as unknown as RewardsClientService;

  return {
    activity,
    identity,
    scoring,
    rewards,
    servicio: new HerramientasService(activity, identity, scoring, rewards),
  };
}

describe('HerramientasService', () => {
  describe('el tenant nunca sale de los argumentos (decisión 9)', () => {
    it('ignora un grupoId inyectado por el modelo y usa el del contexto', async () => {
      const { servicio, activity } = crearMocks();

      // Esto es exactamente lo que haría un prompt injection exitoso: pedir el
      // catálogo de otro grupo. El argumento no se lee en ninguna línea.
      await servicio.ejecutar(
        'listar_actividades',
        { grupoId: 'grupo-de-otra-organizacion', organizacionId: 'org-hostil' },
        CONTEXTO
      );

      expect(activity.actividades).toHaveBeenCalledWith('grupo-1', undefined);
    });

    it('todas las herramientas leen del grupo del contexto', async () => {
      const { servicio, activity, identity, scoring, rewards } = crearMocks();
      const inyectado = { grupoId: 'grupo-ajeno' };

      await servicio.ejecutar('listar_conductas', inyectado, CONTEXTO);
      await servicio.ejecutar('listar_participantes', inyectado, CONTEXTO);
      await servicio.ejecutar('listar_umbrales_zona', inyectado, CONTEXTO);
      await servicio.ejecutar('resumen_puntajes', inyectado, CONTEXTO);
      await servicio.ejecutar('listar_recompensas', inyectado, CONTEXTO);
      await servicio.ejecutar('listar_rendimientos_monedas', inyectado, CONTEXTO);
      await servicio.ejecutar('resumen_cumplimiento', inyectado, CONTEXTO);

      const llamadas = [
        ...vi.mocked(activity.conductas).mock.calls,
        ...vi.mocked(activity.resumenCumplimiento).mock.calls,
        ...vi.mocked(identity.participantes).mock.calls,
        ...vi.mocked(identity.roles).mock.calls,
        ...vi.mocked(identity.equipos).mock.calls,
        ...vi.mocked(scoring.umbrales).mock.calls,
        ...vi.mocked(scoring.resumenPuntajes).mock.calls,
        ...vi.mocked(rewards.recompensas).mock.calls,
        ...vi.mocked(rewards.rendimientos).mock.calls,
      ];

      expect(llamadas.length).toBeGreaterThan(0);

      for (const llamada of llamadas) {
        expect(llamada[0]).toBe('grupo-1');
      }
    });
  });

  it('una herramienta inexistente devuelve error, no lanza', async () => {
    const { servicio } = crearMocks();

    // El modelo se equivoca de nombre a veces; con el error de vuelta se
    // corrige solo. Una excepción acá mataría el turno entero.
    const resultado = await servicio.ejecutar('borrar_todo', {}, CONTEXTO);

    expect(resultado).toEqual({
      ok: false,
      error: 'No existe una herramienta llamada "borrar_todo".',
    });
  });

  describe('listar_participantes', () => {
    it('compone gente, roles activos y equipos activos en una sola respuesta', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.ejecutar('listar_participantes', {}, CONTEXTO);

      expect(resultado.ok).toBe(true);
      expect((resultado as { datos: unknown }).datos).toEqual({
        participantes: [
          { usuarioId: 'u-1', nombre: 'Luciana', rol: 'cocina', rolId: 'rol-1' },
          { usuarioId: 'u-2', nombre: 'José', rol: null, rolId: null },
        ],
        roles: [{ rolId: 'rol-1', nombre: 'cocina' }],
        equipos: [
          {
            equipoId: 'eq-1',
            nombre: 'Cocina',
            jefeUsuarioId: 'u-1',
            miembros: ['u-1', 'u-2'],
          },
        ],
      });
    });

    it('no manda ningún dato de contacto hacia el proveedor (Parte E, punto 7)', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.ejecutar('listar_participantes', {}, CONTEXTO);
      const serializado = JSON.stringify((resultado as { datos: unknown }).datos);

      // `username` es credencial de acceso del participante: tampoco viaja,
      // aunque no sea un email.
      expect(serializado).not.toContain('username');
      expect(serializado).not.toContain('email');
      expect(serializado).not.toContain('@');
    });
  });

  describe('resumen_puntajes', () => {
    it('cruza los nombres por ID y marca si el resultado es definitivo', async () => {
      const { servicio } = crearMocks();

      const resultado = await servicio.ejecutar('resumen_puntajes', {}, CONTEXTO);

      expect(resultado).toEqual({
        ok: true,
        datos: {
          seccionId: 'sec-1',
          // origen EN_VIVO: la sección sigue abierta, los números pueden cambiar.
          definitivo: false,
          puntajes: [
            {
              nombre: 'Luciana',
              usuarioId: 'u-1',
              puntajeTotal: 27,
              zona: 'Verde',
              descalificado: false,
            },
            // Un usuarioId del ledger que ya no está en el grupo (se dio de
            // baja) no rompe nada: queda sin nombre, no desaparece la fila.
            {
              nombre: null,
              usuarioId: 'fantasma',
              puntajeTotal: 3,
              zona: null,
              descalificado: true,
            },
          ],
        },
      });
    });

    it('devuelve error legible si scoring no responde', async () => {
      const { servicio, scoring } = crearMocks();

      vi.mocked(scoring.resumenPuntajes).mockResolvedValueOnce(null);

      const resultado = await servicio.ejecutar('resumen_puntajes', {}, CONTEXTO);

      expect(resultado.ok).toBe(false);
    });
  });

  describe('saneamiento de los argumentos del modelo', () => {
    it('acepta estado ACTIVA/ARCHIVADA y descarta cualquier otra cosa', async () => {
      const { servicio, activity } = crearMocks();

      await servicio.ejecutar('listar_actividades', { estado: 'ACTIVA' }, CONTEXTO);
      await servicio.ejecutar('listar_actividades', { estado: "' OR 1=1 --" }, CONTEXTO);

      expect(vi.mocked(activity.actividades).mock.calls).toEqual([
        ['grupo-1', 'ACTIVA'],
        ['grupo-1', undefined],
      ]);
    });

    it('acota los días en vez de fallar cuando el modelo pide un absurdo', async () => {
      const { servicio, activity } = crearMocks();

      await servicio.ejecutar('resumen_cumplimiento', { dias: 100000 }, CONTEXTO);
      await servicio.ejecutar('resumen_cumplimiento', { dias: 0 }, CONTEXTO);
      await servicio.ejecutar('resumen_cumplimiento', { dias: '7' }, CONTEXTO);
      await servicio.ejecutar('resumen_cumplimiento', {}, CONTEXTO);
      await servicio.ejecutar('resumen_cumplimiento', { dias: 'muchos' }, CONTEXTO);

      expect(vi.mocked(activity.resumenCumplimiento).mock.calls.map((llamada) => llamada[1])).toEqual(
        [365, 1, 7, 30, 30]
      );
    });

    it('un servicio caído devuelve una lista vacía, no rompe la conversación', async () => {
      const { servicio, activity } = crearMocks();

      vi.mocked(activity.resumenCumplimiento).mockResolvedValueOnce(null);

      const resultado = await servicio.ejecutar('resumen_cumplimiento', {}, CONTEXTO);

      expect(resultado).toEqual({
        ok: true,
        datos: { grupoId: 'grupo-1', dias: 30, actividades: [] },
      });
    });
  });
});
