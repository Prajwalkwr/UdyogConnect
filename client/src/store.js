import { configureStore } from '@reduxjs/toolkit';
import { containsItemById } from './utils/duplicateUtils';

const readStoredCart = () => {
  return [];
};

export const initialState = {
  user: null,
  businesses: [],
  cart: readStoredCart(),
};

export function appReducer(state = initialState, action) {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_BUSINESSES':
      return { ...state, businesses: action.payload };
    case 'SET_CART':
      return { ...state, cart: Array.isArray(action.payload) ? action.payload : [] };
    case 'ADD_TO_CART': {
      const incomingItem = action.payload;

      if (containsItemById(state.cart, incomingItem.id)) {
        return {
          ...state,
          cart: state.cart.map((item) => {
            if (String(item.id) !== String(incomingItem.id)) return item;
            const maxAllowed = Math.min(20, item.stock || 20);
            if (item.quantity >= maxAllowed) return item;
            const nextQuantity = item.quantity + 1;
            return {
              ...item,
              quantity: nextQuantity > maxAllowed ? maxAllowed : nextQuantity,
              price: item.price || incomingItem.price,
              name: item.name || incomingItem.name,
              seller: item.seller || incomingItem.seller,
              businessId: item.businessId || incomingItem.businessId || '',
            };
          }),
        };
      }

      if (incomingItem.stock === 0) {
        return state;
      }

      return {
        ...state,
        cart: [...state.cart, { ...incomingItem, quantity: 1, id: incomingItem.id, stock: incomingItem.stock }],
      };
    }
    case 'REMOVE_FROM_CART':
      return { ...state, cart: state.cart.filter((item) => item.id !== action.payload) };
    case 'UPDATE_CART_QUANTITY':
      return {
        ...state,
        cart: state.cart.flatMap((item) => {
          if (item.id !== action.payload.id) return [item];
          const maxAllowed = Math.min(20, item.stock || 20);
          let nextQuantity = action.payload.quantity;
          if (nextQuantity > maxAllowed) nextQuantity = maxAllowed;
          return nextQuantity > 0 ? [{ ...item, quantity: nextQuantity }] : [];
        }),
      };
    case 'CLEAR_CART':
      return { ...state, cart: [] };
    default:
      return state;
  }
}

const store = configureStore({ reducer: appReducer });

export default store;
