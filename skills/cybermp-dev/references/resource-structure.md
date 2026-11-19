# CyberMP Resource Structure & Toolchain Reference

This guide details the standard layout, TypeScript configurations, dependencies, and build pipelines for developing multiplayer resources for CyberMP.

---

## 1. Standard Resource Directory Layout

CyberMP resources isolate execution scopes into dedicated directories:

```
my-resource/
├── package.json
├── tsconfig.json
├── tsconfig.server.json
├── tsconfig.client.json
├── build.js                      # (Optional) esbuild or tsc bundler script
├── src/
│   ├── server/                   # Node.js server scripts
│   │   ├── index.ts
│   │   ├── commands.ts
│   │   └── database.ts
│   ├── client/                   # V8 client scripts running inside game
│   │   ├── index.ts
│   │   ├── hud.ts
│   │   └── vehicle-streamer.ts
│   └── cef/                      # Web UI (HTML / CSS / TS / React)
│       ├── index.html
│       ├── style.css
│       └── app.ts
└── dist/                         # Compiled runtime files loaded by CyberMP
    ├── server/
    │   └── index.js
    ├── client/
    │   └── index.js
    └── cef/
        ├── index.html
        ├── style.css
        └── app.js
```

---

## 2. Standard `package.json` Configuration

A standard resource package file defines scripts for building server, client, and CEF bundles, alongside the official CyberMP type packages:

```json
{
  "name": "my-resource",
  "version": "1.0.0",
  "description": "CyberMP Multiplayer Resource",
  "type": "module",
  "scripts": {
    "build:server": "tsc -p tsconfig.server.json",
    "build:client": "node build-client.js",
    "build:cef": "vite build --outDir dist/cef",
    "build": "npm run build:server && npm run build:client && npm run build:cef",
    "watch": "node watch.js"
  },
  "devDependencies": {
    "@cybermp/server-types": "^3.2.8",
    "@cybermp/client-types": "^2.7.1",
    "@cybermp/browser-types": "^2.0.1",
    "esbuild": "^0.25.0",
    "typescript": "^5.7.3"
  }
}
```

---

## 3. TypeScript Configurations

Because Server and Client execute in distinct JavaScript runtimes with different globals, splitting `tsconfig` prevents global symbol contamination.

### Unified Base `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  }
}
```

### Server Configuration (`tsconfig.server.json`)
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist/server",
    "rootDir": "./src/server",
    "types": ["node", "@cybermp/server-types"]
  },
  "include": ["src/server/**/*"]
}
```

### Client Configuration (`tsconfig.client.json`)
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist/client",
    "rootDir": "./src/client",
    "types": ["@cybermp/client-types"]
  },
  "include": ["src/client/**/*"]
}
```

---

## 4. Bundling Client & CEF Scripts with esbuild

Game clients require bundled JavaScript without runtime Node module resolution. An `esbuild` build script provides instant compilation (<50ms):

```javascript
// build.js
import esbuild from 'esbuild';

// 1. Build Server (Node.js ESM)
await esbuild.build({
  entryPoints: ['src/server/index.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['@cybermp/server-types'],
  sourcemap: true,
});

// 2. Build Client (In-game V8 ESM bundle)
await esbuild.build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'dist/client/index.js',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  external: ['@cybermp/client-types'],
  sourcemap: true,
});

console.log('✅ Resource built successfully!');
```

---

## 5. Server Resource Manifest (`server.toml`)

In CyberMP, resources are registered in the main `server.toml` under the `resources` array:

```toml
[server]
tcp_host = "0.0.0.0"
udp_host = "0.0.0.0"
connection_host_addr = "127.0.0.1"
max_players = 32
resources = ["my-resource"]

[core]
nametags = true
files = ["dist/client/index.js"]
```
