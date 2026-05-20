import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UploadPageComponent } from './upload-page.component';
import { FunctionsStore } from '@core/stores/functions.store';
import { UploadStore } from '@core/stores/upload.store';
import type {
  FunctionCatalogEntry,
  UploadDefinitionOption,
  UploadDefinitionView,
  UploadResponse,
} from '@core/models/run.models';
import { makeFunctionEntry as makeCatalogEntry } from '@testing/factories';

// --- Spec-local factories ----------------------------------------------------
// makeOption and makeDefinition are upload-specific: the local makeDefinition
// takes a positional `options` record (not a Partial override), so it differs
// from the shared makeDefinition and stays here.

function makeOption(
  over: Partial<UploadDefinitionOption> = {},
): UploadDefinitionOption {
  return {
    type: 'boolean',
    default: false,
    userEditable: true,
    label: 'An option',
    ...over,
  };
}

function makeDefinition(
  options: Record<string, UploadDefinitionOption> = {},
): UploadDefinitionView {
  return {
    function: 'PID_RECALC',
    version: '1',
    displayName: 'PID Recalculation',
    description: 'Recalculates PID values.',
    file: { format: 'csv', namingPattern: '*.csv' },
    columns: [],
    options,
  };
}

/** A cached-definition entry shaped like FunctionsStore's entity. */
interface CachedDefinition {
  id: string;
  definition: UploadDefinitionView | null;
  loading: boolean;
  error: string | null;
}

/** Stand-in for FunctionsStore — writable signals for the catalog/definitions. */
interface FakeFunctionsStore {
  loadCatalog: Mock;
  loadDefinition: Mock;
  catalog: WritableSignal<readonly FunctionCatalogEntry[]>;
  definitionsEntityMap: WritableSignal<Record<string, CachedDefinition>>;
  catalogLoading: () => boolean;
  catalogError: () => string | null;
  catalogLoaded: () => boolean;
}

function makeFakeFunctionsStore(): FakeFunctionsStore {
  return {
    loadCatalog: vi.fn(),
    loadDefinition: vi.fn(),
    catalog: signal<readonly FunctionCatalogEntry[]>([]),
    definitionsEntityMap: signal<Record<string, CachedDefinition>>({}),
    catalogLoading: () => false,
    catalogError: () => null,
    catalogLoaded: () => false,
  };
}

/** Stand-in for UploadStore — writable signals for progress/result. */
interface FakeUploadStore {
  submit: Mock;
  reset: Mock;
  uploading: WritableSignal<boolean>;
  percent: WritableSignal<number>;
  error: WritableSignal<string | null>;
  lastResponse: WritableSignal<UploadResponse | null>;
}

function makeFakeUploadStore(): FakeUploadStore {
  return {
    submit: vi.fn(),
    reset: vi.fn(),
    uploading: signal(false),
    percent: signal(0),
    error: signal<string | null>(null),
    lastResponse: signal<UploadResponse | null>(null),
  };
}

/** Typed view of the component's protected members the tests touch. */
interface Internals {
  selectedFunction: WritableSignal<string | null>;
  uploadedBy: WritableSignal<string>;
  file: WritableSignal<File | null>;
  fileDragOver: WritableSignal<boolean>;
  optionValues: WritableSignal<Record<string, boolean>>;
  currentDefinition: () => CachedDefinition | null;
  definitionLoading: () => boolean;
  editableOptions: () => ReadonlyArray<{
    key: string;
    label: string;
    defaultValue: boolean;
  }>;
  canSubmit: () => boolean;
  toggleOption: (key: string, checked: boolean) => void;
  clearFile: () => void;
  submit: () => void;
  retryCatalog: () => void;
}

function aFile(name = 'data.csv'): File {
  return new File(['x'], name, { type: 'text/csv' });
}

describe('UploadPageComponent', () => {
  let functions: FakeFunctionsStore;
  let upload: FakeUploadStore;
  let router: { navigate: Mock };
  let snackBar: { open: Mock };

  beforeEach(() => {
    functions = makeFakeFunctionsStore();
    upload = makeFakeUploadStore();
    router = { navigate: vi.fn() };
    snackBar = { open: vi.fn() };

    TestBed.configureTestingModule({
      imports: [UploadPageComponent],
      providers: [
        // FunctionsStore is root-provided; module-level override is enough.
        { provide: FunctionsStore, useValue: functions },
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });
    // UploadStore is component-scoped — override it on the component.
    TestBed.overrideComponent(UploadPageComponent, {
      set: { providers: [{ provide: UploadStore, useValue: upload }] },
    });
  });

  /** Creates the component and returns its internals plus a re-render hook. */
  function render(): { c: Internals; detect: () => void } {
    const fixture = TestBed.createComponent(UploadPageComponent);
    fixture.detectChanges();
    return {
      c: fixture.componentInstance as unknown as Internals,
      detect: () => fixture.detectChanges(),
    };
  }

  describe('catalog kick-off', () => {
    it('loads the catalog on construction', () => {
      render();
      expect(functions.loadCatalog).toHaveBeenCalledTimes(1);
    });

    it('feeds the selected-function signal into loadDefinition', () => {
      render();
      // loadDefinition is fed the signal directly (not called per-value).
      expect(functions.loadDefinition).toHaveBeenCalledTimes(1);
    });

    it('retryCatalog re-issues the catalog load', () => {
      const { c } = render();
      c.retryCatalog();
      expect(functions.loadCatalog).toHaveBeenCalledTimes(2);
    });
  });

  describe('single-function auto-select', () => {
    it('auto-selects the only function when the catalog has exactly one', () => {
      const { c, detect } = render();
      functions.catalog.set([makeCatalogEntry({ function: 'ONLY_FN' })]);
      detect();

      expect(c.selectedFunction()).toBe('ONLY_FN');
    });

    it('does not auto-select when the catalog has multiple functions', () => {
      const { c, detect } = render();
      functions.catalog.set([
        makeCatalogEntry({ function: 'A' }),
        makeCatalogEntry({ function: 'B' }),
      ]);
      detect();

      expect(c.selectedFunction()).toBeNull();
    });

    it('does not override an existing selection', () => {
      const { c, detect } = render();
      c.selectedFunction.set('CHOSEN');
      functions.catalog.set([makeCatalogEntry({ function: 'ONLY_FN' })]);
      detect();

      expect(c.selectedFunction()).toBe('CHOSEN');
    });
  });

  describe('currentDefinition / definitionLoading', () => {
    it('is null when no function is selected', () => {
      const { c } = render();
      expect(c.currentDefinition()).toBeNull();
      expect(c.definitionLoading()).toBe(false);
    });

    it('resolves the cached definition entry for the selected function', () => {
      const { c, detect } = render();
      const entry: CachedDefinition = {
        id: 'PID_RECALC',
        definition: makeDefinition(),
        loading: false,
        error: null,
      };
      functions.definitionsEntityMap.set({ PID_RECALC: entry });
      c.selectedFunction.set('PID_RECALC');
      detect();

      expect(c.currentDefinition()).toBe(entry);
    });

    it('reports definitionLoading from the cached entry', () => {
      const { c, detect } = render();
      functions.definitionsEntityMap.set({
        PID_RECALC: {
          id: 'PID_RECALC',
          definition: null,
          loading: true,
          error: null,
        },
      });
      c.selectedFunction.set('PID_RECALC');
      detect();

      expect(c.definitionLoading()).toBe(true);
    });
  });

  describe('editableOptions', () => {
    it('is empty when there is no definition', () => {
      const { c } = render();
      expect(c.editableOptions()).toEqual([]);
    });

    it('includes only user-editable boolean options', () => {
      const { c, detect } = render();
      functions.definitionsEntityMap.set({
        PID_RECALC: {
          id: 'PID_RECALC',
          definition: makeDefinition({
            editableBool: makeOption({ label: 'Editable', userEditable: true }),
            lockedBool: makeOption({ userEditable: false }),
            editableString: makeOption({ type: 'string', userEditable: true }),
          }),
          loading: false,
          error: null,
        },
      });
      c.selectedFunction.set('PID_RECALC');
      detect();

      // Only the editable boolean survives the filter.
      expect(c.editableOptions().map((o) => o.key)).toEqual(['editableBool']);
    });

    it('carries each option label and default value', () => {
      const { c, detect } = render();
      functions.definitionsEntityMap.set({
        PID_RECALC: {
          id: 'PID_RECALC',
          definition: makeDefinition({
            flag: makeOption({ label: 'Recalc all', default: true }),
          }),
          loading: false,
          error: null,
        },
      });
      c.selectedFunction.set('PID_RECALC');
      detect();

      expect(c.editableOptions()[0]).toEqual({
        key: 'flag',
        label: 'Recalc all',
        defaultValue: true,
      });
    });
  });

  describe('option-default seeding', () => {
    /** Wires a definition with one boolean option defaulting to true. */
    function seedDefinition(): void {
      functions.definitionsEntityMap.set({
        PID_RECALC: {
          id: 'PID_RECALC',
          definition: makeDefinition({
            flag: makeOption({ default: true }),
          }),
          loading: false,
          error: null,
        },
      });
    }

    it('seeds option values from the definition defaults when it arrives', () => {
      const { c, detect } = render();
      seedDefinition();
      c.selectedFunction.set('PID_RECALC');
      detect();

      expect(c.optionValues()).toEqual({ flag: true });
    });

    it('does not reset a user edit once the function is already seeded', () => {
      const { c, detect } = render();
      seedDefinition();
      c.selectedFunction.set('PID_RECALC');
      detect();

      // User unchecks the option.
      c.toggleOption('flag', false);
      expect(c.optionValues()).toEqual({ flag: false });

      // An unrelated store change re-runs the effect — the edit must survive.
      functions.definitionsEntityMap.update((m) => ({ ...m }));
      detect();

      expect(c.optionValues()).toEqual({ flag: false });
    });

    it('clears option values when the function is unselected', () => {
      const { c, detect } = render();
      seedDefinition();
      c.selectedFunction.set('PID_RECALC');
      detect();
      expect(c.optionValues()).toEqual({ flag: true });

      c.selectedFunction.set(null);
      detect();

      expect(c.optionValues()).toEqual({});
    });
  });

  describe('canSubmit', () => {
    /** Puts the form in a fully valid state. */
    function validForm(c: Internals): void {
      c.selectedFunction.set('PID_RECALC');
      c.file.set(aFile());
      c.uploadedBy.set('jdoe');
    }

    it('is false on a blank form', () => {
      const { c } = render();
      expect(c.canSubmit()).toBe(false);
    });

    it('is true when function, file, and uploadedBy are all set', () => {
      const { c } = render();
      validForm(c);
      expect(c.canSubmit()).toBe(true);
    });

    it('is false when uploadedBy is only whitespace', () => {
      const { c } = render();
      validForm(c);
      c.uploadedBy.set('   ');
      expect(c.canSubmit()).toBe(false);
    });

    it('is false while an upload is in flight', () => {
      const { c } = render();
      validForm(c);
      upload.uploading.set(true);
      expect(c.canSubmit()).toBe(false);
    });

    it('is false with no file selected', () => {
      const { c } = render();
      c.selectedFunction.set('PID_RECALC');
      c.uploadedBy.set('jdoe');
      expect(c.canSubmit()).toBe(false);
    });
  });

  describe('submit', () => {
    it('does nothing when the form is incomplete', () => {
      const { c } = render();
      c.submit();
      expect(upload.submit).not.toHaveBeenCalled();
    });

    it('submits the assembled upload request when the form is valid', () => {
      const { c } = render();
      const file = aFile('upload.csv');
      c.selectedFunction.set('PID_RECALC');
      c.file.set(file);
      c.uploadedBy.set('  jdoe  ');
      c.optionValues.set({ flag: true });

      c.submit();

      expect(upload.submit).toHaveBeenCalledWith({
        function: 'PID_RECALC',
        file,
        uploadedBy: 'jdoe', // trimmed
        options: { flag: true },
      });
    });
  });

  describe('file handling', () => {
    it('toggleOption updates a single option value', () => {
      const { c } = render();
      c.optionValues.set({ a: false, b: false });
      c.toggleOption('a', true);
      expect(c.optionValues()).toEqual({ a: true, b: false });
    });

    it('clearFile resets the selected file to null', () => {
      const { c } = render();
      c.file.set(aFile());
      c.clearFile();
      expect(c.file()).toBeNull();
    });
  });

  describe('navigate on successful upload', () => {
    it('navigates to the watcher and resets the store when a response arrives', () => {
      const { detect } = render();

      upload.lastResponse.set({
        runId: 'RUN#new',
        function: 'PID_RECALC',
        status: 'Pending',
      });
      detect();

      expect(router.navigate).toHaveBeenCalledWith([
        '/runs',
        'RUN#new',
        'watch',
      ]);
      expect(snackBar.open).toHaveBeenCalled();
      // Reset prevents a re-navigation when returning to the upload page.
      expect(upload.reset).toHaveBeenCalled();
    });

    it('does not navigate while lastResponse is null', () => {
      render();
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });
});
