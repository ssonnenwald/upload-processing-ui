import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * Recursively renders a parsed JSON value with indentation and type-aware
 * coloring — the UI counterpart of the Write-JsonNode function in
 * Get-UploadProcessingLogs.ps1.
 *
 * The API has already parsed the structured-log block, so `value` is a real
 * object/array/scalar, never a string to re-parse. The component walks it and
 * renders each node; objects and arrays recurse into a nested instance.
 *
 * Exception/StackTrace/Error keys render in the error color, mirroring the
 * script's special-casing, so a stack trace stands out inside a log block.
 */
@Component({
  selector: 'app-json-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './json-tree.html',
  styleUrl: './json-tree.scss',
})
export class JsonTree {
  /** The parsed JSON value to render — object, array, or scalar. */
  readonly value = input.required<unknown>();

  /** Keys that should render in the error color, matching the script. */
  private static readonly ERROR_KEYS = new Set([
    'exception',
    'stacktrace',
    'error',
  ]);

  protected readonly kind = computed<'object' | 'array' | 'scalar'>(() => {
    const v = this.value();
    if (Array.isArray(v)) return 'array';
    if (v !== null && typeof v === 'object') return 'object';
    return 'scalar';
  });

  /** Object entries, each pre-classified as a leaf scalar or a nested node. */
  protected readonly entries = computed(() => {
    const v = this.value();
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return [];
    return Object.entries(v as Record<string, unknown>).map(([key, value]) => ({
      key,
      value,
      errorKey: JsonTree.ERROR_KEYS.has(key.toLowerCase()),
      ...JsonTree.classify(value),
    }));
  });

  /** Array items, each pre-classified the same way. */
  protected readonly items = computed(() => {
    const v = this.value();
    if (!Array.isArray(v)) return [];
    return (v as unknown[]).map((value) => ({
      value,
      ...JsonTree.classify(value),
    }));
  });

  protected readonly scalarType = computed(
    () => JsonTree.classify(this.value()).valueType,
  );
  protected readonly scalarDisplay = computed(
    () => JsonTree.classify(this.value()).display,
  );

  /**
   * Decides whether a value is a leaf (rendered inline) or a nested node
   * (rendered via a recursive instance), and produces its display string and
   * type tag for coloring.
   */
  private static classify(value: unknown): {
    leaf: boolean;
    valueType: string;
    display: string;
  } {
    if (value === null) {
      return { leaf: true, valueType: 'null', display: 'null' };
    }
    if (Array.isArray(value) || typeof value === 'object') {
      return { leaf: false, valueType: 'object', display: '' };
    }
    if (typeof value === 'string') {
      return { leaf: true, valueType: 'string', display: `"${value}"` };
    }
    if (typeof value === 'number') {
      return { leaf: true, valueType: 'number', display: String(value) };
    }
    if (typeof value === 'boolean') {
      return { leaf: true, valueType: 'boolean', display: String(value) };
    }
    return { leaf: true, valueType: 'string', display: String(value) };
  }
}
