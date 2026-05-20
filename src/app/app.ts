import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Application root. The visible shell now lives in `MainLayout`, wired as the
 * parent route in `app.routes.ts`; this component only hosts the top-level
 * router outlet so non-shell routes (e.g. a future login or error page) can
 * sit as siblings of the layout.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  templateUrl: './app.html',
})
export class App {}
