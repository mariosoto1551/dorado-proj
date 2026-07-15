import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';

const PERFIL_TUTOR = {
  id: 'tutor-1',
  organizacionId: 'org-1',
  email: 'admin@test.dev',
  nombre: 'Admin',
  rol: 'ORG_ADMIN',
  grupoIds: [],
  estado: 'ACTIVO',
  createdAt: '2026-07-15T00:00:00.000Z',
};

describe('AuthService', () => {
  let servicio: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    servicio = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('login guarda el token SOLO en memoria (signal), nunca en storage', () => {
    servicio.login({ identificador: 'admin@test.dev', password: 'password123' }).subscribe();

    const req = httpMock.expectOne('http://localhost:3000/api/auth/login');

    expect(req.request.withCredentials).toBe(true);

    req.flush({ accessToken: 'token-123', principalType: 'TUTOR', perfil: PERFIL_TUTOR });

    expect(servicio.accessToken()).toBe('token-123');
    expect(servicio.sesionActiva()).toBe(true);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('refrescar hidrata la sesión con la cookie (200) y devuelve true', () => {
    let resultado: boolean | undefined;

    servicio.refrescar().subscribe((valor) => (resultado = valor));

    const req = httpMock.expectOne('http://localhost:3000/api/auth/refresh');

    expect(req.request.withCredentials).toBe(true);

    req.flush({ accessToken: 'token-nuevo', principalType: 'TUTOR', perfil: PERFIL_TUTOR });

    expect(resultado).toBe(true);
    expect(servicio.accessToken()).toBe('token-nuevo');
  });

  it('refrescar con 401 limpia la sesión y devuelve false (sin explotar)', () => {
    let resultado: boolean | undefined;

    servicio.refrescar().subscribe((valor) => (resultado = valor));

    httpMock
      .expectOne('http://localhost:3000/api/auth/refresh')
      .flush(
        { statusCode: 401, code: 'REFRESH_TOKEN_INVALIDO', message: 'x', correlationId: '' },
        { status: 401, statusText: 'Unauthorized' }
      );

    expect(resultado).toBe(false);
    expect(servicio.accessToken()).toBeNull();
    expect(servicio.sesionActiva()).toBe(false);
  });

  it('dos suscripciones simultáneas a refrescar comparten UNA llamada HTTP (el token rota)', () => {
    servicio.refrescar().subscribe();
    servicio.refrescar().subscribe();

    const requests = httpMock.match('http://localhost:3000/api/auth/refresh');

    expect(requests).toHaveLength(1);

    requests[0].flush({
      accessToken: 'token-unico',
      principalType: 'TUTOR',
      perfil: PERFIL_TUTOR,
    });
  });

  it('logout limpia la sesión aunque el POST falle', () => {
    servicio.login({ identificador: 'a', password: 'b' }).subscribe();
    httpMock
      .expectOne('http://localhost:3000/api/auth/login')
      .flush({ accessToken: 't', principalType: 'TUTOR', perfil: PERFIL_TUTOR });

    servicio.logout().subscribe();
    httpMock
      .expectOne('http://localhost:3000/api/auth/logout')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(servicio.accessToken()).toBeNull();
  });
});
