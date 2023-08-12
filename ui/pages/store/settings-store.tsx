import { makeAutoObservable } from 'mobx';
import { initialEdges, initialNodes } from '../api/dummy-nodes-edges';
import {
    initialEdges as initialEdges2,
    initialNodes as initialNodes2,
} from '../api/dummy-nodes-edges-2';
import { Metadata } from '../components/model';
import { Http } from './http';

export class SettingsStore {
  metadata: Metadata = {
    nodes: initialNodes,
    edges: initialEdges,
  };

  constructor() {
    makeAutoObservable(this);
  }

  getDummyMetadata = async () => {
    this.metadata = {
      nodes: initialNodes,
      edges: initialEdges,
    };
    return this.metadata;
  };

  getDummyMetadata2 = async () => {
    this.metadata = {
      nodes: initialNodes2,
      edges: initialEdges2,
    };
    return this.metadata;
  };

  getMetadata = async () => {
    const response = await Http.get('connection');
    if (!response) return;
    this.metadata = response.result as Metadata;
    return this.metadata;
  };
}
