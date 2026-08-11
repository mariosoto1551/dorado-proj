import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Rol, type PlatformAdminDto } from '@dorado/shared-types';

import { SesionAdminService } from './sesion-admin.service';

const BASE = 'http://localhost:3000/api/auth/admin';

const PERFIL: PlatformAdminDto = {
  id: 'admin-1',
  email: 'jose@plataforma.dorado',
  nombre: 'José Rodríguez',
  estado: 'ACTIVO',
  createdAt: '2026-07-22T10:00:00.000Z',
};

function tokenCon(rol: Rol): string {
  const base64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${base64url({ alg: 'RS256' })}.${base64url({ sub: 'admin-1', rol })}.firma`;
}

describe('SesionAdminService', () => {
  let sesion: SesionAdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    sesion = TestBed.inject(SesionAdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('arranca sin sesión', () => {
    expect(sesion.sesionActiva()).toBe(false);
    expect(sesion.accessToken()).toBeNull();
    expect(sesion.esPlatformAdmin()).toBe(false);
  });

  describe('login', () => {
    it('guarda token y perfil, y manda credentials (la cookie de refresh)', () => {
      sesion.login({ email: PERFIL.email, password: 'x' }).subscribe();

      const pedido = http.expectOne(`${BASE}/login`);

      expect(pedido.request.withCredentials).toBe(true);
      pedido.flush({ accessToken: tokenCon(Rol.PLATFORM_ADMIN), perfil: PERFIL });

      expect(sesion.sesionActiva()).toBe(true);
      expect(sesion.perfil()).toEqual(PERFIL);
      expect(sesion.esPlatformAdmin()).toBe(true);
    });

    /**
     * `sesionActiva` mira si hay token; `esPlatformAdmin` mira el rol adentro
     * del token. Son cosas distintas y el guard exige las DOS: un token válido
     * de otro rol no puede abrir el panel de plataforma. Si alguien alguna vez
     * "simplifica" el guard a `sesionActiva()`, este test es el que se cae.
     */
    it('un token que no es de PLATFORM_ADMIN da sesión pero NO privilegio', () => {
      sesion.login({ email: 'tutor@x.com', password: 'x' }).subscribe();
      http.expectOne(`${BASE}/login`).flush({
        accessToken: tokenCon(Rol.TUTOR),
        perfil: PERFIL,
      });

      expect(sesion.sesionActiva()).toBe(true);
      expect(sesion.esPlatformAdmin()).toBe(false);
    });
  });

  describe('refrescar', () => {
    it('rehidrata la sesión y devuelve true', () => {
      let resultado: boolean | undefined;

      sesion.refrescar().subscribe((r) => (resultado = r));
      http
        .expectOne(`${BASE}/refresh`)
        .flush({ accessToken: tokenCon(Rol.PLATFORM_ADMIN), perfil: PERFIL });

      expect(resultado).toBe(true);
      expect(sesion.sesionActiva()).toBe(true);
    });

    it('si falla limpia la sesión y devuelve false, sin propagar el error', () => {
      let resultado: boolean | undefined;

      sesion.refrescar().subscribe((r) => (resultado = r));
      http.expectOne(`${BASE}/refresh`).flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(resultado).toBe(false);
      expect(sesion.sesionActiva()).toBe(false);
      expect(sesion.perfil()).toBeNull();
    });

    /**
     * El refresh token ROTA en cada uso (ADR-00 §3): si dos requests que
     * recibieron 401 disparan dos refresh, el segundo llega con un token ya
     * consumido y desloguea al admin. Por eso la llamada en vuelo se comparte.
     */
    it('dos llamadas simultáneas comparten UN solo request', () => {
      sesion.refrescar().subscribe();
      sesion.refrescar().subscribe();

      http
        .expectOne(`${BASE}/refresh`)
        .flush({ accessToken: tokenCon(Rol.PLATFORM_ADMIN), perfil: PERFIL });
    });

    it('terminada la primera, una llamada posterior sí pide de nuevo', () => {
      sesion.refrescar().subscribe();
      http
        .expectOne(`${BASE}/refresh`)
        .flush({ accessToken: tokenCon(Rol.PLATFORM_ADMIN), perfil: PERFIL });

      sesion.refrescar().subscribe();
      http
        .expectOne(`${BASE}/refresh`)
        .flush({ accessToken: tokenCon(Rol.PLATFORM_ADMIN), perfil: PERFIL });
    });
  });

  describe('logout', () => {
    function loguear(): void {
      sesion.login({ email: PERFIL.email, password: 'x' }).subscribe();
      http
        .expectOne(`${BASE}/login`)
        .flush({ accessToken: tokenCon(Rol.PLATFORM_ADMIN), perfil: PERFIL });
    }

    it('limpia la sesión', () => {
      loguear();
      sesion.logout().subscribe();
      http.expectOne(`${BASE}/logout`).flush(null);

      expect(sesion.sesionActiva()).toBe(false);
    });

    /**
     * Si el backend no contesta, la sesión del navegador tiene que irse
     * IGUAL: quedarse logueado en pantalla porque falló la red es lo peor de
     * los dos mundos (el usuario cree que salió y no salió).
     */
    it('también limpia cuando el backend falla', () => {
      loguear();
      sesion.logout().subscribe();
      http.expectOne(`${BASE}/logout`).flush(null, { status: 500, statusText: 'Boom' });

      expect(sesion.sesionActiva()).toBe(false);
      expect(sesion.perfil()).toBeNull();
    });
  });

  describe('presentación', () => {
    it('sin perfil usa los textos por defecto', () => {
      expect(sesion.nombreMostrable()).toBe('Administrador');
      expect(sesion.iniciales()).toBe('A');
    });

    it('con perfil muestra el email y arma iniciales de las dos primeras palabras', () => {
      sesion.login({ email: PERFIL.email, password: 'x' }).subscribe();
      http
        .expectOne(`${BASE}/login`)
        .flush({ accessToken: tokenCon(Rol.PLATFORM_ADMIN), perfil: PERFIL });

      expect(sesion.nombreMostrable()).toBe(PERFIL.email);
      expect(sesion.iniciales()).toBe('JR');
    });
  });
});
