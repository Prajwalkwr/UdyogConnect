import { configureStore } from '@reduxjs/toolkit';

export const initialState = {
  user: null,
  businesses: [],
  cart: [],
};

export function appReducer(state = initialState, action) {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_BUSINESSES':
      return { ...state, businesses: action.payload };
    case 'ADD_TO_CART': {
      const existingItem = state.cart.find((item) => item.id === action.payload.id);
      if (existingItem) {
        return {
          ...state,
          cart: state.cart.map((item) =>
            item.id === action.payload.id ? { ...item, quantity: item.quantity + 1 } : item
          ),
        };
      }
      return { ...state, cart: [...state.cart, { ...action.payload, quantity: 1 }] };
    }
    case 'REMOVE_FROM_CART':
      return { ...state, cart: state.cart.filter((item) => item.id !== action.payload) };
    case 'UPDATE_CART_QUANTITY':
      return {
        ...state,
        cart: state.cart.flatMap((item) => {
          if (item.id !== action.payload.id) return [item];
          const nextQuantity = action.payload.quantity;
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
