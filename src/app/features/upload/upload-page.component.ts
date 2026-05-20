import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FunctionsStore } from '@core/stores/functions.store';
import { UploadStore } from '@core/stores/upload.store';
import { UploadDefinitionOption } from '@core/models/run.models';

interface OptionRow {
  readonly key: string;
  readonly label: string;
  readonly defaultValue: boolean;
}

/**
 * Form state for the upload page lives in component signals — it's transient
 * UI state (file picker, drag state, free-text uploadedBy) that doesn't need
 * to outlive the component. The submission flow and the catalog/definition
 * caches go through SignalStores instead.
 */
@Component({
  selector: 'app-upload-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  // UploadStore is page-scoped; FunctionsStore is root-scoped so the catalog
  // and definitions stay cached across navigations.
  providers: [UploadStore],
  templateUrl: './upload-page.component.html',
  styleUrl: './upload-page.component.scss',
})
export class UploadPageComponent {
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly functions = inject(FunctionsStore);
  protected readonly upload = inject(UploadStore);

  // ---------------------------------------------------------------------------
  // Form state (transient, component-local)
  // ---------------------------------------------------------------------------
  protected readonly selectedFunction = signal<string | null>(null);
  protected readonly uploadedBy = signal('');
  protected readonly file = signal<File | null>(null);
  protected readonly fileDragOver = signal(false);
  protected readonly optionValues = signal<Record<string, boolean>>({});

  // ---------------------------------------------------------------------------
  // Derived view models pulling from the FunctionsStore
  // ---------------------------------------------------------------------------
  protected readonly currentDefinition = computed(() => {
    const fn = this.selectedFunction();
    if (!fn) return null;
    return this.functions.definitionsEntityMap()[fn] ?? null;
  });

  protected readonly definitionLoading = computed(
    () => this.currentDefinition()?.loading ?? false,
  );

  protected readonly editableOptions = computed<OptionRow[]>(() => {
    const cached = this.currentDefinition();
    const def = cached?.definition;
    if (!def) return [];
    return Object.entries(def.options)
      .filter(([, opt]) => opt.userEditable && opt.type === 'boolean')
      .map(([key, opt]) => ({
        key,
        label: opt.label,
        defaultValue: Boolean((opt as UploadDefinitionOption).default),
      }));
  });

  protected readonly canSubmit = computed(
    () =>
      !this.upload.uploading() &&
      this.selectedFunction() !== null &&
      this.file() !== null &&
      this.uploadedBy().trim().length > 0,
  );

  constructor() {
    // Kick off the catalog load on first render. FunctionsStore.loadCatalog is
    // idempotent so calling it again later (e.g. after a hot reload) is safe.
    this.functions.loadCatalog();

    // Feed the selected-function signal straight into loadDefinition. rxMethod
    // subscribes to the signal once and re-runs only when its value actually
    // changes — so picking a function fetches its definition exactly once
    // (cached thereafter), and a null selection is ignored inside the method.
    //
    // IMPORTANT: this is intentionally NOT wrapped in an effect(). Calling
    // loadDefinition from inside an effect makes the effect depend on the
    // store's `definitions` entity map (loadDefinition reads it in its guard),
    // and loadDefinition also *writes* that map — so the write retriggers the
    // effect, which calls loadDefinition again, looping forever and firing the
    // API endlessly. Feeding the signal directly avoids the effect entirely.
    this.functions.loadDefinition(this.selectedFunction);

    // Auto-select the only function if the catalog has exactly one entry.
    effect(() => {
      const catalog = this.functions.catalog();
      if (catalog.length === 1 && this.selectedFunction() === null) {
        this.selectedFunction.set(catalog[0].function);
      }
    });

    // Seed option defaults the first time a definition arrives for the currently selected
    // function. We only seed once per function — otherwise this effect re-fires whenever
    // anything on the FunctionsStore changes and resets the user's checkbox edits back to
    // defaults. This effect ONLY touches optionValues; it never calls loadDefinition, so
    // it cannot create the write/re-run loop described above.
    let lastSeededFunction: string | null = null;
    effect(() => {
      const fn = this.selectedFunction();
      const cached = this.currentDefinition();
      const def = cached?.definition;

      if (!fn || !def) {
        // Function unselected or definition not yet loaded — clear and reset tracker so a
        // future load for the same function will re-seed.
        if (lastSeededFunction !== null) {
          this.optionValues.set({});
          lastSeededFunction = null;
        }
        return;
      }

      // Already seeded for this function — preserve the user's current edits.
      if (lastSeededFunction === fn) return;

      const seeded: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(def.options)) {
        if (v.userEditable && v.type === 'boolean') {
          seeded[k] = Boolean(v.default);
        }
      }
      this.optionValues.set(seeded);
      lastSeededFunction = fn;
    });

    // Watch for a successful upload and navigate to the watcher. effect() runs
    // whenever lastResponse changes, so we only navigate on the transition to
    // a non-null response.
    effect(() => {
      const response = this.upload.lastResponse();
      if (response) {
        this.snackBar.open(
          'Upload accepted — redirecting to live view.',
          undefined,
          {
            duration: 3000,
          },
        );
        void this.router.navigate(['/runs', response.runId, 'watch']);
        // Reset so navigating back to the upload page doesn't redirect again.
        this.upload.reset();
      }
    });
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
  }

  protected onFileDropped(event: DragEvent): void {
    event.preventDefault();
    this.fileDragOver.set(false);
    const f = event.dataTransfer?.files?.[0] ?? null;
    if (f) this.file.set(f);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.fileDragOver.set(true);
  }

  protected onDragLeave(): void {
    this.fileDragOver.set(false);
  }

  protected toggleOption(key: string, checked: boolean): void {
    this.optionValues.update((curr) => ({ ...curr, [key]: checked }));
  }

  protected clearFile(): void {
    this.file.set(null);
  }

  protected submit(): void {
    const fn = this.selectedFunction();
    const file = this.file();
    const uploadedBy = this.uploadedBy().trim();
    if (!fn || !file || !uploadedBy) return;

    this.upload.submit({
      function: fn,
      file,
      uploadedBy,
      options: this.optionValues(),
    });
  }

  protected retryCatalog(): void {
    this.functions.loadCatalog();
  }
}
