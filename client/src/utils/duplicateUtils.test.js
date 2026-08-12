import { describe, expect, it } from 'vitest';
import { addUniqueItem, containsItemById } from './duplicateUtils';

describe('duplicateUtils', () => {
  it('adds an item only once when the same id already exists', () => {
    const list = [{ id: 'prod-1' }, { id: 'prod-2' }];

    const nextList = addUniqueItem(list, { id: 'prod-1', name: 'Duplicate' });

    expect(nextList).toHaveLength(2);
    expect(nextList.find((item) => item.id === 'prod-1')).toEqual({ id: 'prod-1' });
  });

  it('matches ids regardless of string or number formatting', () => {
    expect(containsItemById([{ id: '42' }], 42)).toBe(true);
    expect(containsItemById([{ id: '42' }], '42')).toBe(true);
  });
});
