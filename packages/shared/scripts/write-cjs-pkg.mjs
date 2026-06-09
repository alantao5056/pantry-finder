// The package root is `"type": "module"`, so Node would treat the CommonJS
// build under dist/cjs as ESM and choke. Dropping a `{"type":"commonjs"}`
// marker scopes that subtree back to CommonJS for the `require` consumers
// (the CommonJS API). Run as the last step of the shared build.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cjsDir = fileURLToPath(new URL('../dist/cjs/', import.meta.url));
mkdirSync(cjsDir, { recursive: true });
writeFileSync(`${cjsDir}package.json`, `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);
