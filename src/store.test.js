import { describe, expect, it } from 'vitest';
import { appReducer, initialState } from './store';

describe('appReducer', () => {
  it('adds an item to cart and increments quantity', () => {
    const afterAdd = appReducer(initialState, {
      type: 'ADD_TO_CART',
      payload: { id: 1, name: 'Test item', price: 500 },
    });

    expect(afterAdd.cart).toHaveLength(1);
    expect(afterAdd.cart[0].quantity).toBe(1);

    const afterSecondAdd = appReducer(afterAdd, {
      type: 'ADD_TO_CART',
      payload: { id: 1, name: 'Test item', price: 500 },
    });

    expect(afterSecondAdd.cart[0].quantity).toBe(2);
  });
});
