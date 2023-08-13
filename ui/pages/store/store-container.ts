import { createContext, useContext } from 'react';
import { GlobalStore } from './global.store';
import { GraphStore } from './graph.store';

class StoreContainer {
  global = new GlobalStore();
  graph = new GraphStore();
}

const container = new StoreContainer();
const StoresContext = createContext(container);
export const useStores = () => useContext(StoresContext);
