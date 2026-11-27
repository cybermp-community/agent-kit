import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const { version: packageVersion } = require('#package-info') as { version: string };
