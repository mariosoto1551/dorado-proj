import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  UrlTree,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';

import { Rol, type PlatformAdminDto } from '@dorado/shared-types';

import { adminGuard } from './admin.guard';
import { SesionAdminService } from './sesion-admin.service';

const PERFIL: PlatformAdminDto = {
  id: 'admin-1',
  email: 'jose@plataforma.dorado',
  nombre: 'José',
  estado: 'ACTIVO',
  createdAt: '2026-07-22T10:00:00.000Z',
};

function tokenCon(rol: Rol): string {
  const base64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${base64url({ alg: 'RS256' })}.${base64url({ sub: 'admin-1', rol })}.firma`;
}

function ejecutarGuard(): boolean | UrlTree {
  return TestBed.runInInjectionContext(() =>
    adminGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
  ) as boolean | UrlTree;
}

function loguearCon(rol: Rol): void {
  TestBed.inject(SesionAdminService).login({ email: PERFIL.email, password: 'x' }).subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('http://localhost:3000/api/auth/admin/login')
    .flush({ accessToken: tokenCon(rol), perfil: PERFIL });
}

describe('adminGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('sin sesión redirige a /login', () => {
    const resultado = ejecutarGuard();

    expect(resultado).toBeInstanceOf(UrlTree);
    expect(String(resultado)).toBe('/login');
  });

  it('con sesión de PLATFORM_ADMIN deja pasar', () => {
    loguearCon(Rol.PLATFORM_ADMIN);

    expect(ejecutarGuard()).toBe(true);
  });

  /**
   * El caso que justifica que el guard mire el rol y no solo si hay token.
   * El backend igual responde 403 en /api/admin/*, pero sin esto el panel se
   * abriría vacío y con errores en vez de mandar al login: la defensa del
   * servidor está, la del cliente tiene que acompañar.
   */
  it('con sesión de otro rol NO deja pasar, aunque el token sea válido', () => {
    loguearCon(Rol.TUTOR);

    const resultado = ejecutarGuard();

    expect(resultado).toBeInstanceOf(UrlTree);
    expect(String(resultado)).toBe('/login');
  });
});
