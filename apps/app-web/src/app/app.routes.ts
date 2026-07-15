import { Route } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { soloTutorGuard } from './core/auth/solo-tutor.guard';

export const appRoutes: Route[] = [
  {
    path: 'registro',
    loadComponent: () =>
      import('./paginas/registro/registro-organizacion-page.component').then(
        (m) => m.RegistroOrganizacionPageComponent
      ),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./paginas/login/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: 'invitacion/:codigo',
    loadComponent: () =>
      import('./paginas/invitacion/invitacion-page.component').then(
        (m) => m.InvitacionPageComponent
      ),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./paginas/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: 'onboarding',
        canActivate: [soloTutorGuard],
        loadComponent: () =>
          import('./paginas/onboarding/onboarding-crear-grupo-page.component').then(
            (m) => m.OnboardingCrearGrupoPageComponent
          ),
      },
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./paginas/inicio/inicio-page.component').then(
            (m) => m.InicioPageComponent
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
