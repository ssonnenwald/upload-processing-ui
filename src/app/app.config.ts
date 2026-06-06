import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  provideHttpClient,
  withInterceptors,
  withXhr,
} from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { errorInterceptor } from '@core/api/error-interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    // Angular v22 makes the Fetch backend the default. Fetch cannot report
    // upload progress, and the upload flow depends on it (see RunsApi.uploadFile),
    // so we explicitly opt back into the XHR backend with withXhr().
    provideHttpClient(withXhr(), withInterceptors([errorInterceptor])),
    provideAnimationsAsync(),
  ],
};
