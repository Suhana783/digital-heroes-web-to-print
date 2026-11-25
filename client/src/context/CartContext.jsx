import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const CartContext = createContext(null);

function readCart(storageKey) {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((item) => item && typeof item.id === 'string' && typeof item.productId === 'string'
      && Number.isInteger(item.quantity) && Array.isArray(item.selectedOptions) && Array.isArray(item.customInputs))
      .map((item) => ({ ...item, designId: typeof item.designId === 'string' ? item.designId : null,
        designName: typeof item.designName === 'string' ? item.designName : null,
        designTemplateName: typeof item.designTemplateName === 'string' ? item.designTemplateName : null }));
  } catch { return []; }
}

function configurationKey(item) {
  return JSON.stringify({ productId: item.productId, selectedOptions: item.selectedOptions, customInputs: item.customInputs, designId: item.designId || null });
}

export function CartProvider({ children }) {
  const { user } = useAuth();
  const storageKey = `digital-heroes-cart:${user?.id || 'guest'}`;
  const [cartState, setCartState] = useState({ storageKey: null, items: [] });
  const ready = cartState.storageKey === storageKey;
  const items = ready ? cartState.items : [];

  useEffect(() => {
    setCartState({ storageKey, items: readCart(storageKey) });
  }, [storageKey]);

  useEffect(() => {
    if (ready) {
      try { localStorage.setItem(storageKey, JSON.stringify(items)); } catch { /* Cart remains usable for this session. */ }
    }
  }, [items, ready, storageKey]);

  function updateItems(updater) {
    setCartState((current) => current.storageKey === storageKey
      ? { ...current, items: updater(current.items) }
      : current);
  }

  const value = useMemo(() => ({
    items,
    ready,
    itemCount: items.reduce((count, item) => count + item.quantity, 0),
    addItem(item) {
      const matchKey = configurationKey(item);
      updateItems((current) => {
        const existing = current.find((candidate) => configurationKey(candidate) === matchKey);
        if (existing) return current.map((candidate) => candidate.id === existing.id ? { ...candidate, quantity: candidate.quantity + item.quantity } : candidate);
        return [...current, { ...item, id: globalThis.crypto.randomUUID() }];
      });
    },
    updateQuantity(itemId, quantity) {
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2_147_483_647) return;
      updateItems((current) => current.map((item) => item.id === itemId ? { ...item, quantity } : item));
    },
    updateDesign(itemId, design) {
      updateItems((current) => current.map((item) => item.id === itemId ? {
        ...item,
        designId: design?.id || null,
        designName: design?.name || null,
        designTemplateName: design?.template?.name || null,
      } : item));
    },
    removeItem(itemId) { updateItems((current) => current.filter((item) => item.id !== itemId)); },
    clearCart() { updateItems(() => []); },
  }), [items, storageKey]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
}
