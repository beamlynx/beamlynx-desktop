import { createContext, useContext } from 'react';
import { Store as Store } from './store';

class StoreContainer {
  store = new Store();

}
const container = new StoreContainer();
const StoresContext = createContext(container);
export const useStores = () => useContext(StoresContext);
