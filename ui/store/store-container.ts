import { createContext, useContext } from 'react';
import { GlobalStore } from './global.store';

class StoreContainer {
  global = new GlobalStore();
}

const container = new StoreContainer();
const StoresContext = createContext(container);
export const useStores = () => useContext(StoresContext);
