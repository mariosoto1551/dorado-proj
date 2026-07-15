import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { appRoutes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(appRoutes),
    // Refresh silencioso al bootear (spec fase-03): el access token vive solo
    // en memoria y se pierde al recargar — la cookie httpOnly dorado_refresh
    // rehidrata la sesión ANTES de que el router evalúe los guards. Si el
    // refresh falla (sin cookie o vencida), la app arranca deslogueada.
    provideAppInitializer(() => {
      const auth = inject(AuthService);

      return firstValueFrom(auth.refrescar()).then(() => undefined);
    }),
  ],
};
