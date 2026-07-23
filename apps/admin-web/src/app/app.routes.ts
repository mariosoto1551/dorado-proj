import { Route } from '@angular/router';

import { adminGuard } from './core/auth/admin.guard';

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () => import('./paginas/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [adminGuard],
    loadComponent: () => import('./paginas/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: 'organizaciones',
        pathMatch: 'full',
        loadComponent: () =>
          import('./paginas/organizaciones/organizaciones.page').then((m) => m.OrganizacionesPage),
      },
      {
        path: 'organizaciones/:id',
        loadComponent: () =>
          import('./paginas/organizacion-detalle/organizacion-detalle.page').then(
            (m) => m.OrganizacionDetallePage
          ),
      },
      { path: '', pathMatch: 'full', redirectTo: 'organizaciones' },
    ],
  },
  { path: '**', redirectTo: '' },
];
