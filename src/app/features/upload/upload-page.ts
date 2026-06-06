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
import { FunctionsStore } from '@core/stores/functions-store';
import { UploadStore } from '@core/stores/upload-store';
import {
  UploadDefinitionOption,
  UploadDefinitionOptionValidation,
} from '@core/models/run.models';

/**
 * Shape used to drive the @for in the template. `kind` collapses the option type +
 * the allowed-values presence into a single discriminator the template can switch on,
 * so the template doesn't have to repeat the "string with allowedValues -> dropdown"
 * logic inline. `validation` is non-null only when there are rules to enforce.
 */
interface OptionRow {
  readonly key: string;
  readonly label: string;
  readonly hint: string | null;
  readonly kind: 'boolean' | 'number' | 'text' | 'select';
  readonly allowedValues: readonly string[] | null;
  readonly validation: UploadDefinitionOptionValidation | null;
}

/**
 * Form state for the upload page lives in component signals — it's transient
 * UI state (file picker, drag state, free-text uploadedBy) that doesn't need
 * to outlive the component. The submission flow and the catalog cache go
 * through SignalStores instead.
 *
 * Options come straight from the FunctionsStore catalog (which now embeds each
 * function's options dictionary), so there's no second fetch per selection.
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
  // stays cached across navigations.
  providers: [UploadStore],
  templateUrl: './upload-page.html',
  styleUrl: './upload-page.scss',
})
export class UploadPage {
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
  /**
   * Map of option key → current value. Heterogeneous because options can be
   * booleans, numbers, or strings (with or without an allowedValues dropdown).
   * Components reading this should narrow based on the option's `type`.
   */
  protected readonly optionValues = signal<Record<string, unknown>>({});
  /** Per-option validation messages. Empty string = valid. */
  protected readonly optionErrors = signal<Record<string, string>>({});

  // ---------------------------------------------------------------------------
  // Derived view models pulling from the FunctionsStore
  // ---------------------------------------------------------------------------
  /** Current catalog entry for the selected function (null if nothing selected). */
  protected readonly currentEntry = computed(() => {
    const fn = this.selectedFunction();
    if (!fn) return null;
    return this.functions.catalogByFunction()[fn] ?? null;
  });

  /**
   * Projects the selected function's user-editable options into the row shape the
   * template iterates over. Non-editable options are filtered out here so the
   * default values are still submitted (seeded below) but never shown to the user.
   */
  protected readonly editableOptions = computed<OptionRow[]>(() => {
    const entry = this.currentEntry();
    if (!entry) return [];
    return Object.entries(entry.options)
      .filter(([, opt]) => opt.userEditable)
      .map(([key, opt]) => this.toRow(key, opt));
  });

  /** True iff any visible option currently has a non-empty error message. */
  protected readonly hasOptionErrors = computed(() => {
    const errors = this.optionErrors();
    return Object.values(errors).some((msg) => msg.length > 0);
  });

  protected readonly canSubmit = computed(
    () =>
      !this.upload.uploading() &&
      this.selectedFunction() !== null &&
      this.file() !== null &&
      this.uploadedBy().trim().length > 0 &&
      !this.hasOptionErrors(),
  );

  constructor() {
    // Kick off the catalog load on first render. FunctionsStore.loadCatalog is
    // idempotent so calling it again later (e.g. after a hot reload) is safe.
    this.functions.loadCatalog();

    // Auto-select the only function if the catalog has exactly one entry.
    effect(() => {
      const catalog = this.functions.catalog();
      if (catalog.length === 1 && this.selectedFunction() === null) {
        this.selectedFunction.set(catalog[0].function);
      }
    });

    // Seed option defaults whenever the selected function changes. We only seed
    // once per function — otherwise this effect would reset the user's edits any
    // time anything on the FunctionsStore changes. Tracking lastSeededFunction
    // in a closure variable (rather than a signal) keeps this effect from
    // depending on its own writes.
    let lastSeededFunction: string | null = null;
    effect(() => {
      const fn = this.selectedFunction();
      const entry = this.currentEntry();

      if (!fn || !entry) {
        if (lastSeededFunction !== null) {
          this.optionValues.set({});
          this.optionErrors.set({});
          lastSeededFunction = null;
        }
        return;
      }

      if (lastSeededFunction === fn) return;

      // Seed every option (editable or not) with its default so the submitted
      // options object is complete — server-side handlers can rely on every
      // key being present.
      const seeded: Record<string, unknown> = {};
      for (const [k, opt] of Object.entries(entry.options)) {
        seeded[k] = this.coerceDefault(opt);
      }
      this.optionValues.set(seeded);
      this.optionErrors.set({});
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

  // ---------------------------------------------------------------------------
  // File picker handlers
  // ---------------------------------------------------------------------------
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

  protected clearFile(): void {
    this.file.set(null);
  }

  // ---------------------------------------------------------------------------
  // Option change handlers — one per kind so the template stays simple and the
  // typing is honest. Each one writes the new value into optionValues and
  // recomputes the error message for that key.
  // ---------------------------------------------------------------------------
  protected setBoolean(key: string, value: boolean): void {
    this.optionValues.update((curr) => ({ ...curr, [key]: value }));
    this.revalidate(key);
  }

  protected setText(key: string, value: string): void {
    this.optionValues.update((curr) => ({ ...curr, [key]: value }));
    this.revalidate(key);
  }

  protected setNumber(key: string, raw: string): void {
    // Number inputs deliver a string; convert to a number (or null if empty)
    // and validate. Storing null lets the validator distinguish "left blank"
    // from "typed 0".
    const trimmed = raw.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    this.optionValues.update((curr) => ({ ...curr, [key]: value }));
    this.revalidate(key);
  }

  /**
   * Re-runs validation for a single option key. Called from every change handler
   * so error messages stay in sync without us re-validating the whole form on
   * every keystroke of an unrelated input.
   */
  private revalidate(key: string): void {
    const entry = this.currentEntry();
    const opt = entry?.options[key];
    if (!opt) return;
    const value = this.optionValues()[key];
    const message = this.validateOption(opt, value);
    this.optionErrors.update((curr) => {
      // Avoid producing a new object identity when nothing changed — the
      // template's @if guard on hasOptionErrors() and canSubmit() both depend
      // on this map, so unnecessary writes would trigger unnecessary work.
      if ((curr[key] ?? '') === message) return curr;
      return { ...curr, [key]: message };
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  /**
   * Builds an OptionRow for a single option. `kind` collapses (type, allowedValues)
   * into a single discriminator: string + allowedValues -> 'select', otherwise the
   * type maps 1:1.
   */
  private toRow(key: string, opt: UploadDefinitionOption): OptionRow {
    const allowed = opt.validation?.allowedValues ?? null;
    let kind: OptionRow['kind'];
    if (opt.type === 'boolean') {
      kind = 'boolean';
    } else if (opt.type === 'number') {
      kind = 'number';
    } else if (allowed && allowed.length > 0) {
      kind = 'select';
    } else {
      kind = 'text';
    }

    return {
      key,
      label: opt.label,
      hint: opt.hint ?? null,
      kind,
      allowedValues: allowed,
      validation: opt.validation ?? null,
    };
  }

  /**
   * Coerces an option's `default` (loosely typed as `unknown` on the wire) into
   * the right runtime shape for its declared type. Missing defaults fall back to
   * sensible empties so the controls always render in a clean state.
   */
  private coerceDefault(opt: UploadDefinitionOption): unknown {
    if (opt.type === 'boolean') return Boolean(opt.default);
    if (opt.type === 'number') {
      return typeof opt.default === 'number' ? opt.default : null;
    }
    // string
    return typeof opt.default === 'string' ? opt.default : '';
  }

  /**
   * Validates a single option value against its declared rules. Returns the empty
   * string when valid — the empty string is what the template treats as "no error".
   * Validation is best-effort and mirrors the rules declared in the definition JSON
   * (min/max for numbers, maxLength/pattern/allowedValues for strings). The server
   * doesn't currently re-validate options, so this is the only line of defense.
   */
  private validateOption(opt: UploadDefinitionOption, value: unknown): string {
    const v = opt.validation;
    if (opt.type === 'number') {
      // Disallow blanks for number options — a number option that's editable is
      // expected to have a value. (If we ever need optional numbers, add an
      // `optional: true` flag to the definition rather than special-casing here.)
      if (value === null || value === undefined) return 'Required.';
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return 'Must be a number.';
      }
      if (v?.min !== null && v?.min !== undefined && value < v.min) {
        return `Must be at least ${v.min}.`;
      }
      if (v?.max !== null && v?.max !== undefined && value > v.max) {
        return `Must be at most ${v.max}.`;
      }
      return '';
    }

    if (opt.type === 'string') {
      const str = typeof value === 'string' ? value : '';
      if (v?.allowedValues && v.allowedValues.length > 0) {
        // Dropdown is bound to the same allowedValues list, so an out-of-range
        // value would only happen if a default in the JSON doesn't match — still
        // worth catching so the user sees why submit is disabled.
        if (!v.allowedValues.includes(str)) {
          return 'Pick one of the allowed values.';
        }
        return '';
      }
      if (v?.maxLength !== null && v?.maxLength !== undefined && str.length > v.maxLength) {
        return `Must be ${v.maxLength} characters or fewer.`;
      }
      if (v?.pattern) {
        try {
          const re = new RegExp(v.pattern);
          if (str.length > 0 && !re.test(str)) {
            return 'Value does not match the expected format.';
          }
        } catch {
          // A malformed pattern in the definition shouldn't block the user —
          // log nothing (this validates every keystroke), just skip the check.
        }
      }
      return '';
    }

    // Booleans are always valid.
    return '';
  }

  protected submit(): void {
    const fn = this.selectedFunction();
    const file = this.file();
    const uploadedBy = this.uploadedBy().trim();
    if (!fn || !file || !uploadedBy || this.hasOptionErrors()) return;

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
