import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import { JsonTreeComponent } from './json-tree.component';

/** An entry as produced by the `entries` computed. */
interface TreeEntry {
  key: string;
  value: unknown;
  errorKey: boolean;
  leaf: boolean;
  valueType: string;
  display: string;
}

/** An item as produced by the `items` computed. */
interface TreeItem {
  value: unknown;
  leaf: boolean;
  valueType: string;
  display: string;
}

/** Typed view of the component's protected computed members. */
interface Internals {
  kind: () => 'object' | 'array' | 'scalar';
  entries: () => readonly TreeEntry[];
  items: () => readonly TreeItem[];
  scalarType: () => string;
  scalarDisplay: () => string;
}

describe('JsonTreeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [JsonTreeComponent] });
  });

  /** Creates the component with the given value and returns its internals. */
  function render(value: unknown): Internals {
    const fixture = TestBed.createComponent(JsonTreeComponent);
    const ref = fixture.componentRef as ComponentRef<JsonTreeComponent>;
    ref.setInput('value', value);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Internals;
  }

  describe('kind', () => {
    it('classifies a plain object as "object"', () => {
      expect(render({ a: 1 }).kind()).toBe('object');
    });

    it('classifies an array as "array"', () => {
      expect(render([1, 2, 3]).kind()).toBe('array');
    });

    it('classifies an empty array as "array"', () => {
      expect(render([]).kind()).toBe('array');
    });

    it('classifies a string as "scalar"', () => {
      expect(render('hello').kind()).toBe('scalar');
    });

    it('classifies a number as "scalar"', () => {
      expect(render(42).kind()).toBe('scalar');
    });

    it('classifies null as "scalar"', () => {
      // null is typeof 'object' but must not be treated as an object node.
      expect(render(null).kind()).toBe('scalar');
    });
  });

  describe('scalar values', () => {
    it('quotes a string value in its display', () => {
      const c = render('hello');
      expect(c.scalarType()).toBe('string');
      expect(c.scalarDisplay()).toBe('"hello"');
    });

    it('renders a number without quotes', () => {
      const c = render(7);
      expect(c.scalarType()).toBe('number');
      expect(c.scalarDisplay()).toBe('7');
    });

    it('renders a boolean as its string form', () => {
      const c = render(true);
      expect(c.scalarType()).toBe('boolean');
      expect(c.scalarDisplay()).toBe('true');
    });

    it('renders null with the "null" type and display', () => {
      const c = render(null);
      expect(c.scalarType()).toBe('null');
      expect(c.scalarDisplay()).toBe('null');
    });
  });

  describe('entries (object rendering)', () => {
    it('returns an empty list for a non-object value', () => {
      expect(render('not an object').entries()).toEqual([]);
      expect(render([1, 2]).entries()).toEqual([]);
      expect(render(null).entries()).toEqual([]);
    });

    it('produces one entry per object key', () => {
      const c = render({ a: 1, b: 'two', c: true });
      expect(c.entries().map((e) => e.key)).toEqual(['a', 'b', 'c']);
    });

    it('classifies a scalar entry as a leaf with the right type/display', () => {
      const c = render({ count: 5, name: 'run' });
      const byKey = new Map(c.entries().map((e) => [e.key, e]));

      expect(byKey.get('count')).toMatchObject({
        leaf: true,
        valueType: 'number',
        display: '5',
      });
      expect(byKey.get('name')).toMatchObject({
        leaf: true,
        valueType: 'string',
        display: '"run"',
      });
    });

    it('classifies a nested object entry as a non-leaf node', () => {
      const c = render({ nested: { x: 1 } });
      const entry = c.entries()[0];
      expect(entry.leaf).toBe(false);
      expect(entry.valueType).toBe('object');
    });

    it('classifies a nested array entry as a non-leaf node', () => {
      const c = render({ list: [1, 2] });
      expect(c.entries()[0].leaf).toBe(false);
    });
  });

  describe('error-key flagging', () => {
    it('flags the "exception" key as an error key', () => {
      const c = render({ exception: 'boom' });
      expect(c.entries()[0].errorKey).toBe(true);
    });

    it('flags "stackTrace" and "error" keys regardless of casing', () => {
      const c = render({ StackTrace: 'at ...', ERROR: 'failed' });
      expect(c.entries().every((e) => e.errorKey)).toBe(true);
    });

    it('does not flag an ordinary key', () => {
      const c = render({ message: 'all good', count: 1 });
      expect(c.entries().every((e) => e.errorKey)).toBe(false);
    });

    it('does not flag a key that merely contains an error word', () => {
      // ERROR_KEYS membership is exact (lower-cased), not substring.
      const c = render({ errorCount: 3, hasException: false });
      expect(c.entries().every((e) => e.errorKey)).toBe(false);
    });
  });

  describe('items (array rendering)', () => {
    it('returns an empty list for a non-array value', () => {
      expect(render({ a: 1 }).items()).toEqual([]);
      expect(render('string').items()).toEqual([]);
    });

    it('produces one item per array element', () => {
      const c = render([1, 'two', false]);
      expect(c.items()).toHaveLength(3);
    });

    it('classifies each array item by type', () => {
      const c = render([10, 'text', null, { nested: true }]);
      const items = c.items();

      expect(items[0]).toMatchObject({
        leaf: true,
        valueType: 'number',
        display: '10',
      });
      expect(items[1]).toMatchObject({
        leaf: true,
        valueType: 'string',
        display: '"text"',
      });
      expect(items[2]).toMatchObject({
        leaf: true,
        valueType: 'null',
        display: 'null',
      });
      expect(items[3]).toMatchObject({ leaf: false, valueType: 'object' });
    });

    it('handles an empty array as zero items', () => {
      expect(render([]).items()).toEqual([]);
    });
  });

  describe('cross-checks', () => {
    it('an object value yields entries but no items', () => {
      const c = render({ a: 1 });
      expect(c.entries()).toHaveLength(1);
      expect(c.items()).toHaveLength(0);
    });

    it('an array value yields items but no entries', () => {
      const c = render([1]);
      expect(c.items()).toHaveLength(1);
      expect(c.entries()).toHaveLength(0);
    });
  });
});
