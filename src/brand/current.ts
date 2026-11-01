import identity from './adapters/mimi-pip.json';
import { validateBrand, type BrandAdapter, type IsolationPolicy } from './contract';
// This one explicit import is selected per isolated checkout; no host inference.
export const brand = validateBrand(identity as BrandAdapter);
export const isolation: IsolationPolicy = {
  mode: 'offline',
  services: { database:null, storage:null, ai:null, payments:null, email:null, messaging:null, analytics:null, publishing:null, dns:null, os:null },
};
