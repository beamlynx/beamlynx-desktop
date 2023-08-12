import { createContext, useContext } from 'react';
import { Store } from './store';
import { SettingsStore } from './settings-store';

class StoreContainer {
  store = new Store();
  settings = new SettingsStore();

}
const container = new StoreContainer();
const StoresContext = createContext(container);
export const useStores = () => useContext(StoresContext);
