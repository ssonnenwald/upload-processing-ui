import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { FunctionsStore } from './functions.store';
import { RunsApi } from '../api/runs-api.service';
import { makeFunctionEntry, makeDefinition } from '@testing/factories';

/** A RunsApi test double exposing just the two methods the store calls. */
interface RunsApiMock {
  listFunctions: Mock;
  getDefinition: Mock;
}

describe('FunctionsStore', () => {
  let store: InstanceType<typeof FunctionsStore>;
  let api: RunsApiMock;

  beforeEach(() => {
    api = {
      listFunctions: vi.fn(),
      getDefinition: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: RunsApi, useValue: api }],
    });
    store = TestBed.inject(FunctionsStore);
  });

  it('starts empty with no catalog and not loading', () => {
    expect(store.catalog()).toEqual([]);
    expect(store.catalogLoading()).toBe(false);
    expect(store.catalogError()).toBeNull();
    expect(store.catalogLoaded()).toBe(false);
  });

  describe('loadCatalog', () => {
    it('fetches the catalog and populates state on success', () => {
      const catalog = [
        makeFunctionEntry({ function: 'PID_RECALC' }),
        makeFunctionEntry({ function: 'OTHER' }),
      ];
      api.listFunctions.mockReturnValue(of(catalog));

      store.loadCatalog();

      expect(api.listFunctions).toHaveBeenCalledTimes(1);
      expect(store.catalog()).toEqual(catalog);
      expect(store.catalogLoading()).toBe(false);
      expect(store.catalogError()).toBeNull();
      expect(store.catalogLoaded()).toBe(true);
    });

    it('does not re-fetch once the catalog is populated', () => {
      api.listFunctions.mockReturnValue(of([makeFunctionEntry()]));

      store.loadCatalog();
      store.loadCatalog();

      // The filter() short-circuit drops the second emission.
      expect(api.listFunctions).toHaveBeenCalledTimes(1);
    });

    it('sets a friendly error and clears loading on failure', () => {
      api.listFunctions.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 500,
              statusText: 'Internal Server Error',
            }),
        ),
      );

      store.loadCatalog();

      expect(store.catalogError()).not.toBeNull();
      expect(store.catalogLoading()).toBe(false);
      expect(store.catalog()).toEqual([]);
    });

    it('marks the catalog as "loaded" even after a failure', () => {
      api.listFunctions.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 0, statusText: 'Unknown' }),
        ),
      );

      store.loadCatalog();

      // catalogLoaded is true when catalog is non-empty OR an error is set.
      expect(store.catalogLoaded()).toBe(true);
    });

    it('allows a retry after a failure left the catalog empty', () => {
      api.listFunctions.mockReturnValueOnce(
        throwError(
          () => new HttpErrorResponse({ status: 503, statusText: 'Down' }),
        ),
      );
      store.loadCatalog();
      expect(store.catalogError()).not.toBeNull();

      // Catalog is still empty, so a second call is allowed through.
      const catalog = [makeFunctionEntry()];
      api.listFunctions.mockReturnValueOnce(of(catalog));
      store.loadCatalog();

      expect(api.listFunctions).toHaveBeenCalledTimes(2);
      expect(store.catalog()).toEqual(catalog);
      expect(store.catalogError()).toBeNull();
    });
  });

  describe('loadDefinition', () => {
    it('ignores a null selection without calling the API', () => {
      store.loadDefinition(null);
      expect(api.getDefinition).not.toHaveBeenCalled();
    });

    it('ignores an empty-string selection', () => {
      store.loadDefinition('');
      expect(api.getDefinition).not.toHaveBeenCalled();
    });

    it('fetches and caches a definition for a selected function', () => {
      const def = makeDefinition({ function: 'PID_RECALC' });
      api.getDefinition.mockReturnValue(of(def));

      store.loadDefinition('PID_RECALC');

      expect(api.getDefinition).toHaveBeenCalledWith('PID_RECALC');
      const cached = store.definitionsEntityMap()['PID_RECALC'];
      expect(cached.definition).toEqual(def);
      expect(cached.loading).toBe(false);
      expect(cached.error).toBeNull();
    });

    it('does not re-fetch a definition that is already cached', () => {
      api.getDefinition.mockReturnValue(of(makeDefinition()));

      store.loadDefinition('PID_RECALC');
      store.loadDefinition('PID_RECALC');

      // Second emission is dropped because the definition is already loaded.
      expect(api.getDefinition).toHaveBeenCalledTimes(1);
    });

    it('fetches separately for two different functions', () => {
      api.getDefinition.mockImplementation((fn: string) =>
        of(makeDefinition({ function: fn })),
      );

      store.loadDefinition('PID_RECALC');
      store.loadDefinition('OTHER_FN');

      expect(api.getDefinition).toHaveBeenCalledTimes(2);
      expect(
        store.definitionsEntityMap()['PID_RECALC'].definition?.function,
      ).toBe('PID_RECALC');
      expect(
        store.definitionsEntityMap()['OTHER_FN'].definition?.function,
      ).toBe('OTHER_FN');
    });

    it('records a friendly error on the cached entry when the fetch fails', () => {
      api.getDefinition.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 404, statusText: 'Not Found' }),
        ),
      );

      store.loadDefinition('PID_RECALC');

      const cached = store.definitionsEntityMap()['PID_RECALC'];
      expect(cached.definition).toBeNull();
      expect(cached.loading).toBe(false);
      expect(cached.error).not.toBeNull();
    });
  });

  describe('reset', () => {
    it('clears the catalog state and all cached definitions', () => {
      api.listFunctions.mockReturnValue(of([makeFunctionEntry()]));
      api.getDefinition.mockReturnValue(of(makeDefinition()));
      store.loadCatalog();
      store.loadDefinition('PID_RECALC');

      // Sanity: state is populated before the reset.
      expect(store.catalog().length).toBeGreaterThan(0);
      expect(store.definitionsEntityMap()['PID_RECALC']).toBeDefined();

      store.reset();

      expect(store.catalog()).toEqual([]);
      expect(store.catalogLoading()).toBe(false);
      expect(store.catalogError()).toBeNull();
      expect(store.definitionsEntityMap()['PID_RECALC']).toBeUndefined();
    });

    it('allows the catalog to be loaded again after a reset', () => {
      api.listFunctions.mockReturnValue(of([makeFunctionEntry()]));
      store.loadCatalog();
      store.reset();
      store.loadCatalog();

      // The reset emptied the catalog, so loadCatalog runs again.
      expect(api.listFunctions).toHaveBeenCalledTimes(2);
    });
  });
});
