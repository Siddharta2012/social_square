import { createContext, useContext } from 'react';

export const HudContext = createContext<Record<string, any> | null>(null);

export function useHudContext<T extends Record<string, any> = Record<string, any>>(): T {
  const context = useContext(HudContext);
  if (!context) throw new Error('HudContext missing');
  return context as T;
}
