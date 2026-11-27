import sources from '../data/type-sources.json' with { type: 'json' };
import type { TypeRecord } from '../types/index.js';

export function declarationSource(environment: TypeRecord['env']): string {
  return environment === 'shared' ? Object.values(sources).join(', ') : sources[environment];
}
