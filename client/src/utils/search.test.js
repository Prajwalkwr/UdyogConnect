import { describe, expect, it } from 'vitest';
import { matchesSearchQuery, normalizeSearchText } from './search';

describe('search helpers', () => {
  it('normalizes search text for case-insensitive matching', () => {
    expect(normalizeSearchText('  Coffee Shop  ')).toBe('coffee shop');
  });

  it('matches across multiple fields for a business-like item', () => {
    const item = {
      name: 'Sunar Craft House',
      description: 'Handmade baskets and gifts',
      category: 'Gift Shop',
    };

    expect(matchesSearchQuery(item, 'basket', ['name', 'description', 'category'])).toBe(true);
    expect(matchesSearchQuery(item, 'gift', ['name', 'description', 'category'])).toBe(true);
    expect(matchesSearchQuery(item, 'electronics', ['name', 'description', 'category'])).toBe(false);
  });

  it('matches multi-word queries and array values', () => {
    const item = {
      name: 'Himalayan Spice Market',
      description: 'Fresh groceries and daily essentials',
      tags: ['groceries', 'spices', 'organic'],
    };

    expect(matchesSearchQuery(item, 'fresh groceries', ['name', 'description', 'tags'])).toBe(true);
    expect(matchesSearchQuery(item, 'organic spice', ['name', 'description', 'tags'])).toBe(true);
  });
});
