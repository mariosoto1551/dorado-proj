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

import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

function ejecutarGuard(): boolean | UrlTree {
  return TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
  ) as boolean | UrlTree;
}

describe('authGuard', () => {
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

  it('con sesión activa deja pasar', () => {
    const auth = TestBed.inject(AuthService);

    auth.login({ identificador: 'a', password: 'b' }).subscribe();
    TestBed.inject(HttpTestingController)
      .expectOne('http://localhost:3000/api/auth/login')
      .flush({
        accessToken: 'token',
        principalType: 'TUTOR',
        perfil: { nombre: 'Admin' },
      });

    expect(ejecutarGuard()).toBe(true);
  });
});
