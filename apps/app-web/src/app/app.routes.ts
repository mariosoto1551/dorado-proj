import { Route } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { inicioUsuarioGuard } from './core/auth/inicio-usuario.guard';
import { soloOrgAdminGuard } from './core/auth/solo-org-admin.guard';
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

      // ===== Panel de organización (solo ORG_ADMIN) =====
      {
        path: 'organizacion',
        pathMatch: 'full',
        canActivate: [soloOrgAdminGuard],
        loadComponent: () =>
          import('./paginas/admin/panel-organizacion.page').then((m) => m.PanelOrganizacionPage),
      },

      // ===== Área Tutor / ORG_ADMIN =====
      {
        path: 'grupos',
        pathMatch: 'full',
        canActivate: [soloTutorGuard],
        loadComponent: () =>
          import('./paginas/tutor/selector-grupo.page').then((m) => m.SelectorGrupoPage),
      },
      {
        path: 'grupos/:grupoId',
        canActivate: [soloTutorGuard],
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./paginas/tutor/resumen-grupo.page').then((m) => m.ResumenGrupoPage),
          },
          {
            path: 'guia',
            loadComponent: () =>
              import('./paginas/tutor/guia-primeros-pasos.page').then(
                (m) => m.GuiaPrimerosPasosPage
              ),
          },
          {
            path: 'actividades',
            loadComponent: () =>
              import('./paginas/tutor/actividades.page').then((m) => m.ActividadesPage),
          },
          {
            path: 'conductas',
            loadComponent: () =>
              import('./paginas/tutor/conductas.page').then((m) => m.ConductasPage),
          },
          {
            path: 'umbrales',
            loadComponent: () =>
              import('./paginas/tutor/umbrales.page').then((m) => m.UmbralesPage),
          },
          {
            path: 'recompensas',
            loadComponent: () =>
              import('./paginas/tutor/recompensas.page').then((m) => m.RecompensasPage),
          },
          {
            path: 'invitaciones',
            loadComponent: () =>
              import('./paginas/tutor/invitaciones.page').then((m) => m.InvitacionesPage),
          },
          {
            path: 'usuarios',
            loadComponent: () =>
              import('./paginas/tutor/usuarios.page').then((m) => m.UsuariosPage),
          },
          {
            path: 'equipos',
            loadComponent: () =>
              import('./paginas/tutor/equipos.page').then((m) => m.EquiposPage),
          },
          {
            path: 'reportes',
            loadComponent: () =>
              import('./paginas/tutor/reportes.page').then((m) => m.ReportesPage),
          },
          {
            path: 'tutores',
            loadComponent: () =>
              import('./paginas/tutor/tutores.page').then((m) => m.TutoresPage),
          },
          {
            path: 'configuracion-sesion',
            loadComponent: () =>
              import('./paginas/tutor/configuracion-sesion.page').then(
                (m) => m.ConfiguracionSesionPage
              ),
          },
          {
            path: 'secciones/actual',
            loadComponent: () =>
              import('./paginas/tutor/panel-operativo.page').then((m) => m.PanelOperativoPage),
          },
          {
            path: 'secciones/:seccionId/evaluacion',
            loadComponent: () =>
              import('./paginas/tutor/panel-evaluacion.page').then((m) => m.PanelEvaluacionPage),
          },
        ],
      },

      // ===== Área Usuario =====
      {
        path: 'mi-conducta',
        loadComponent: () =>
          import('./paginas/usuario/mi-conducta.page').then((m) => m.MiConductaPage),
      },
      {
        path: 'mi-progreso',
        loadComponent: () =>
          import('./paginas/usuario/mi-progreso.page').then((m) => m.MiProgresoPage),
      },
      {
        path: 'mis-recompensas',
        loadComponent: () =>
          import('./paginas/usuario/mis-recompensas.page').then((m) => m.MisRecompensasPage),
      },
      {
        path: 'mi-equipo',
        loadComponent: () =>
          import('./paginas/usuario/mi-equipo.page').then((m) => m.MiEquipoPage),
      },
      {
        path: '',
        pathMatch: 'full',
        canActivate: [inicioUsuarioGuard],
        loadComponent: () =>
          import('./paginas/usuario/home-usuario.page').then((m) => m.HomeUsuarioPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
