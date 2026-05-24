import { computed, inject } from '@angular/core';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import {
  patchState,
  signalStore,
  type,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import {
  entityConfig,
  setAllEntities,
  setEntity,
  withEntities,
} from '@ngrx/signals/entities';
import { filter, pipe, switchMap, tap } from 'rxjs';
import { tapResponse } from '@ngrx/operators';
import { RunsApi } from '../api/runs-api.service';
import {
  FunctionCatalogEntry,
  UploadDefinitionOption,
  UploadDefinitionView,
} from '../models/run.models';
import { friendlyApiError } from '@core/api/friendly-error';

/**
 * Each cached definition is wrapped so we can key it by `function` and store
 * the load state alongside the data. SignalStore's withEntities requires an
 * `id` field on every entity — we use the function name.
 */
interface CachedDefinition {
  readonly id: string; // function name
  readonly definition: UploadDefinitionView | null;
  readonly loading: boolean;
  readonly error: string | null;
}

const definitionConfig = entityConfig({
  entity: type<CachedDefinition>(),
  collection: 'definitions',
});

interface FunctionsState {
  readonly catalog: readonly FunctionCatalogEntry[];
  readonly catalogLoading: boolean;
  readonly catalogError: string | null;
}

const initialState: FunctionsState = {
  catalog: [],
  catalogLoading: false,
  catalogError: null,
};

/**
 * Global store for the upload-type catalog and per-function definitions.
 * Provided at root because both the upload page and (if we later add it) the
 * history page filter can share the same fetched catalog without re-hitting
 * the API on every navigation.
 *
 * Definitions are cached forever for the session — they're tied to the backend
 * build and only change on redeploy.
 *
 * The catalog now carries each function's user-editable options inline
 * (FunctionCatalogEntry.options), so pages that only need to render the
 * option controls don't have to call loadDefinition. The full UploadDefinitionView
 * (columns, version, file shape) is still available via loadDefinition for
 * callers that need it.
 */
export const FunctionsStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withEntities(definitionConfig),
  withComputed((store) => ({
    /** True if the catalog has been fetched at least once. */
    catalogLoaded: computed(
      () => store.catalog().length > 0 || store.catalogError() !== null,
    ),

    /**
     * Map of function name → catalog entry, for O(1) lookup by name without
     * scanning the array on every selection change. Built lazily off the
     * catalog signal, so it only recomputes when the catalog itself changes.
     */
    catalogByFunction: computed(() => {
      const map: Record<string, FunctionCatalogEntry> = {};
      for (const entry of store.catalog()) {
        map[entry.function] = entry;
      }
      return map;
    }),
  })),
  withMethods((store, api = inject(RunsApi)) => ({
    /**
     * Catalog loader. Idempotent on success and while a request is in flight:
     * once the catalog is populated, or a fetch is already running, further
     * calls are a no-op. After a *failure* (catalog still empty, error set) a
     * subsequent call is allowed through and re-attempts the fetch — this is
     * what the Retry button, and the automatic retry on SignalR reconnect,
     * rely on.
     */
    loadCatalog: rxMethod<void>(
      pipe(
        // Real short-circuit: if we're already loading, or the catalog is
        // already populated, drop the emission so the switchMap never runs.
        // (The previous version returned out of tap() only, which left the
        // API call firing without a loading-state transition — so a retry
        // looked frozen.)
        filter(() => !store.catalogLoading() && store.catalog().length === 0),
        tap(() =>
          patchState(store, { catalogLoading: true, catalogError: null }),
        ),
        switchMap(() =>
          api.listFunctions().pipe(
            tapResponse({
              next: (catalog) =>
                patchState(store, {
                  catalog,
                  catalogLoading: false,
                }),
              error: (err: Error) =>
                patchState(store, {
                  catalogError: friendlyApiError(
                    err,
                    'The function catalog could not be loaded.',
                  ),
                  catalogLoading: false,
                }),
            }),
          ),
        ),
      ),
    ),

    /**
     * Returns the options dictionary for a given function from the catalog,
     * or an empty object if the function isn't known. Pure read — does not
     * trigger a fetch. Components should ensure loadCatalog() has been called
     * (catalogLoaded() / catalogLoading()) before relying on the result.
     */
    optionsFor(fn: string | null): Readonly<Record<string, UploadDefinitionOption>> {
      if (!fn) return {};
      return store.catalogByFunction()[fn]?.options ?? {};
    },

    /**
     * Load a single function's full definition (columns, version, etc.), with
     * per-function caching. The upload page does NOT need this any more — the
     * options it renders come from the catalog directly. Kept on the store for
     * future callers (e.g. an admin page that wants to show column hints).
     *
     * Accepts `string | null` so it can be fed a signal directly. A `null`
     * selection is filtered out, and already-loaded or in-flight definitions
     * short-circuit before any request, so a repeated emission of the same
     * function name is a genuine no-op.
     */
    loadDefinition: rxMethod<string | null>(
      pipe(
        filter((fn): fn is string => fn !== null && fn.length > 0),
        filter((fn) => {
          const existing = store.definitionsEntityMap()[fn];
          return !existing?.definition && !existing?.loading;
        }),
        tap((fn) => {
          const entry: CachedDefinition = {
            id: fn,
            definition: null,
            loading: true,
            error: null,
          };
          patchState(store, setEntity(entry, definitionConfig));
        }),
        switchMap((fn) =>
          api.getDefinition(fn).pipe(
            tapResponse({
              next: (def) => {
                const entry: CachedDefinition = {
                  id: fn,
                  definition: def,
                  loading: false,
                  error: null,
                };
                patchState(store, setEntity(entry, definitionConfig));
              },
              error: (err: Error) => {
                const entry: CachedDefinition = {
                  id: fn,
                  definition: null,
                  loading: false,
                  error: friendlyApiError(
                    err,
                    'The definition could not be loaded.',
                  ),
                };
                patchState(store, setEntity(entry, definitionConfig));
              },
            }),
          ),
        ),
      ),
    ),

    /** Clears the cached definitions — exposed mostly for tests. */
    reset(): void {
      patchState(
        store,
        { ...initialState },
        setAllEntities([] as CachedDefinition[], definitionConfig),
      );
    },
  })),
);
