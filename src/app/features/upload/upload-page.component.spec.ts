import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { computed, signal, WritableSignal } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UploadPageComponent } from './upload-page.component';
import { FunctionsStore } from '@core/stores/functions.store';
import { UploadStore } from '@core/stores/upload.store';
import type {
  FunctionCatalogEntry,
  UploadDefinitionOption,
  UploadResponse,
} from '@core/models/run.models';
import { makeFunctionEntry as makeCatalogEntry } from '@testing/factories';

// --- Spec-local factories ----------------------------------------------------
// makeOption is upload-page-specific and overlays partials onto a sensible boolean default.

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

/**
 * Builds a catalog entry pre-wired with an options dictionary. The component
 * now reads options straight from the catalog, so seeding the catalog is
 * sufficient — there's no separate definitions map to populate.
 */
function entryWithOptions(
  fn: string,
  options: Record<string, UploadDefinitionOption>,
): FunctionCatalogEntry {
  return makeCatalogEntry({ function: fn, options });
}

/**
 * Stand-in for FunctionsStore. catalog and catalogByFunction are writable
 * signals so each test can stage a different scenario; loadCatalog/loadDefinition
 * are mocks so we can assert on calls.
 */
interface FakeFunctionsStore {
  loadCatalog: Mock;
  loadDefinition: Mock;
  catalog: WritableSignal<readonly FunctionCatalogEntry[]>;
  catalogByFunction: () => Readonly<Record<string, FunctionCatalogEntry>>;
  catalogLoading: () => boolean;
  catalogError: () => string | null;
  catalogLoaded: () => boolean;
  optionsFor: (fn: string | null) => Readonly<Record<string, UploadDefinitionOption>>;
}

function makeFakeFunctionsStore(): FakeFunctionsStore {
  const catalog = signal<readonly FunctionCatalogEntry[]>([]);
  // Derive catalogByFunction the same way the real store does, so the
  // component's currentEntry() lookup behaves identically under test.
  const byFn = computed(() => {
    const map: Record<string, FunctionCatalogEntry> = {};
    for (const e of catalog()) map[e.function] = e;
    return map;
  });
  return {
    loadCatalog: vi.fn(),
    loadDefinition: vi.fn(),
    catalog,
    catalogByFunction: byFn,
    catalogLoading: () => false,
    catalogError: () => null,
    catalogLoaded: () => false,
    optionsFor: (fn) => (fn ? byFn()[fn]?.options ?? {} : {}),
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
  optionValues: WritableSignal<Record<string, unknown>>;
  optionErrors: WritableSignal<Record<string, string>>;
  currentEntry: () => FunctionCatalogEntry | null;
  editableOptions: () => ReadonlyArray<{
    key: string;
    label: string;
    hint: string | null;
    kind: 'boolean' | 'number' | 'text' | 'select';
    allowedValues: readonly string[] | null;
  }>;
  hasOptionErrors: () => boolean;
  canSubmit: () => boolean;
  setBoolean: (key: string, value: boolean) => void;
  setText: (key: string, value: string) => void;
  setNumber: (key: string, raw: string) => void;
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
        { provide: FunctionsStore, useValue: functions },
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });
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

    it('does NOT call loadDefinition (options come from the catalog)', () => {
      render();
      // The component no longer needs the per-function definition fetch — the
      // catalog carries every function's options inline.
      expect(functions.loadDefinition).not.toHaveBeenCalled();
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

  describe('currentEntry', () => {
    it('is null when no function is selected', () => {
      const { c } = render();
      expect(c.currentEntry()).toBeNull();
    });

    it('resolves the catalog entry for the selected function', () => {
      const { c, detect } = render();
      const entry = entryWithOptions('PID_RECALC', {});
      functions.catalog.set([entry]);
      // catalog has one entry → auto-select picks it up.
      detect();

      expect(c.currentEntry()).toBe(entry);
    });
  });

  describe('editableOptions', () => {
    it('is empty when no function is selected', () => {
      const { c } = render();
      expect(c.editableOptions()).toEqual([]);
    });

    it('filters out non-editable options', () => {
      const { c, detect } = render();
      functions.catalog.set([
        entryWithOptions('PID_RECALC', {
          editable: makeOption({ userEditable: true, label: 'Visible' }),
          locked: makeOption({ userEditable: false, label: 'Hidden' }),
        }),
      ]);
      detect();

      expect(c.editableOptions().map((o) => o.key)).toEqual(['editable']);
    });

    it('maps each option type to the correct kind', () => {
      const { c, detect } = render();
      functions.catalog.set([
        entryWithOptions('PID_RECALC', {
          flag: makeOption({ type: 'boolean' }),
          count: makeOption({ type: 'number', default: 1 }),
          name: makeOption({ type: 'string', default: '' }),
          mode: makeOption({
            type: 'string',
            default: 'A',
            validation: { allowedValues: ['A', 'B'] },
          }),
        }),
      ]);
      detect();

      const byKey = Object.fromEntries(
        c.editableOptions().map((o) => [o.key, o.kind]),
      );
      expect(byKey).toEqual({
        flag: 'boolean',
        count: 'number',
        name: 'text',
        mode: 'select',
      });
    });

    it('exposes hint and allowedValues alongside the row', () => {
      const { c, detect } = render();
      functions.catalog.set([
        entryWithOptions('PID_RECALC', {
          mode: makeOption({
            type: 'string',
            default: 'A',
            label: 'Mode',
            hint: 'Pick one',
            validation: { allowedValues: ['A', 'B'] },
          }),
        }),
      ]);
      detect();

      const row = c.editableOptions()[0];
      expect(row.label).toBe('Mode');
      expect(row.hint).toBe('Pick one');
      expect(row.allowedValues).toEqual(['A', 'B']);
    });
  });

  describe('option-default seeding', () => {
    it('seeds every option from its declared default when a function is selected', () => {
      const { c, detect } = render();
      functions.catalog.set([
        entryWithOptions('PID_RECALC', {
          flag: makeOption({ default: true }),
          count: makeOption({ type: 'number', default: 7 }),
          name: makeOption({ type: 'string', default: 'hello' }),
          // Non-editable options still get seeded so they're submitted.
          locked: makeOption({ userEditable: false, default: false }),
        }),
      ]);
      detect();

      expect(c.optionValues()).toEqual({
        flag: true,
        count: 7,
        name: 'hello',
        locked: false,
      });
    });

    it('does not reset a user edit once the function is already seeded', () => {
      const { c, detect } = render();
      const entry = entryWithOptions('PID_RECALC', {
        flag: makeOption({ default: true }),
      });
      functions.catalog.set([entry]);
      detect();

      // User unchecks the option.
      c.setBoolean('flag', false);
      expect(c.optionValues()).toEqual({ flag: false });

      // An unrelated store change re-runs the effect — the edit must survive.
      functions.catalog.set([entry]);
      detect();

      expect(c.optionValues()).toEqual({ flag: false });
    });

    it('clears option values when the function is unselected', () => {
      const { c, detect } = render();
      // Use a 2-entry catalog so the auto-select doesn't immediately re-pick it.
      functions.catalog.set([
        entryWithOptions('PID_RECALC', { flag: makeOption({ default: true }) }),
        entryWithOptions('OTHER', {}),
      ]);
      c.selectedFunction.set('PID_RECALC');
      detect();
      expect(c.optionValues()).toEqual({ flag: true });

      c.selectedFunction.set(null);
      detect();

      expect(c.optionValues()).toEqual({});
    });
  });

  describe('option validation', () => {
    function setupNumberOption(): Internals {
      const { c, detect } = render();
      functions.catalog.set([
        entryWithOptions('PID_RECALC', {
          count: makeOption({
            type: 'number',
            default: 5,
            validation: { min: 1, max: 10 },
          }),
        }),
      ]);
      detect();
      return c;
    }

    it('rejects a number below the declared minimum', () => {
      const c = setupNumberOption();
      c.setNumber('count', '0');
      expect(c.optionErrors()['count']).toMatch(/at least/i);
      expect(c.hasOptionErrors()).toBe(true);
    });

    it('rejects a number above the declared maximum', () => {
      const c = setupNumberOption();
      c.setNumber('count', '99');
      expect(c.optionErrors()['count']).toMatch(/at most/i);
    });

    it('rejects a blank number option', () => {
      const c = setupNumberOption();
      c.setNumber('count', '');
      expect(c.optionErrors()['count']).toMatch(/required/i);
    });

    it('clears the error message when the value becomes valid again', () => {
      const c = setupNumberOption();
      c.setNumber('count', '0');
      expect(c.hasOptionErrors()).toBe(true);
      c.setNumber('count', '5');
      expect(c.optionErrors()['count']).toBe('');
      expect(c.hasOptionErrors()).toBe(false);
    });

    it('enforces maxLength on a string option', () => {
      const { c, detect } = render();
      functions.catalog.set([
        entryWithOptions('PID_RECALC', {
          name: makeOption({
            type: 'string',
            default: '',
            validation: { maxLength: 3 },
          }),
        }),
      ]);
      detect();

      c.setText('name', 'too long');
      expect(c.optionErrors()['name']).toMatch(/3 characters/);
    });

    it('enforces a regex pattern on a string option', () => {
      const { c, detect } = render();
      // Pattern requires uppercase A–Z only. Using a simple character-class
      // pattern keeps the test resilient against any future string-escape
      // changes in the spec authoring.
      functions.catalog.set([
        entryWithOptions('PID_RECALC', {
          sku: makeOption({
            type: 'string',
            default: '',
            validation: { pattern: '^[A-Z]+$' },
          }),
        }),
      ]);
      detect();

      c.setText('sku', 'abc');
      expect(c.optionErrors()['sku']).toMatch(/format/i);
      c.setText('sku', 'ABC');
      expect(c.optionErrors()['sku']).toBe('');
    });
  });

  describe('canSubmit', () => {
    /** Puts the form in a fully valid state (with no option errors). */
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
      const { c, detect } = render();
      functions.catalog.set([entryWithOptions('PID_RECALC', {})]);
      detect();
      validForm(c);
      expect(c.canSubmit()).toBe(true);
    });

    it('is false when uploadedBy is only whitespace', () => {
      const { c, detect } = render();
      functions.catalog.set([entryWithOptions('PID_RECALC', {})]);
      detect();
      validForm(c);
      c.uploadedBy.set('   ');
      expect(c.canSubmit()).toBe(false);
    });

    it('is false while an upload is in flight', () => {
      const { c, detect } = render();
      functions.catalog.set([entryWithOptions('PID_RECALC', {})]);
      detect();
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

    it('is false when any option has a validation error', () => {
      const { c, detect } = render();
      functions.catalog.set([
        entryWithOptions('PID_RECALC', {
          count: makeOption({
            type: 'number',
            default: 5,
            validation: { min: 1, max: 10 },
          }),
        }),
      ]);
      detect();
      validForm(c);
      c.setNumber('count', '99'); // out of range
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
      const { c, detect } = render();
      functions.catalog.set([
        entryWithOptions('PID_RECALC', {
          flag: makeOption({ default: true }),
        }),
      ]);
      detect();

      const file = aFile('upload.csv');
      c.file.set(file);
      c.uploadedBy.set('  jdoe  ');
      c.setBoolean('flag', true);

      c.submit();

      expect(upload.submit).toHaveBeenCalledWith({
        function: 'PID_RECALC',
        file,
        uploadedBy: 'jdoe', // trimmed
        options: { flag: true },
      });
    });

    it('does not submit while any option has a validation error', () => {
      const { c, detect } = render();
      functions.catalog.set([
        entryWithOptions('PID_RECALC', {
          count: makeOption({
            type: 'number',
            default: 5,
            validation: { min: 1, max: 10 },
          }),
        }),
      ]);
      detect();
      c.file.set(aFile());
      c.uploadedBy.set('jdoe');
      c.setNumber('count', '99');

      c.submit();
      expect(upload.submit).not.toHaveBeenCalled();
    });
  });

  describe('file handling', () => {
    it('setBoolean updates a single option value', () => {
      const { c, detect } = render();
      functions.catalog.set([
        entryWithOptions('PID_RECALC', {
          a: makeOption({ default: false }),
          b: makeOption({ default: false }),
        }),
      ]);
      detect();

      c.setBoolean('a', true);
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
