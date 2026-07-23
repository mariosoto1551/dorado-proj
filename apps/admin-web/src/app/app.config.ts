import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { appRoutes } from './app.routes';
import { adminInterceptor } from './core/auth/admin.interceptor';
import { SesionAdminService } from './core/auth/sesion-admin.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([adminInterceptor])),
    provideRouter(appRoutes, withComponentInputBinding()),
    // Refresh silencioso al bootear (mismo patrón que app-web, fase-03): el
    // access token vive solo en memoria y se pierde al recargar — la cookie
    // httpOnly rehidrata la sesión ANTES de que el router evalúe los guards.
    provideAppInitializer(() => {
      const sesion = inject(SesionAdminService);

      return firstValueFrom(sesion.refrescar()).then(() => undefined);
    }),
  ],
};
