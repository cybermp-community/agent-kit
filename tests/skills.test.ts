import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

describe('Agent Skills & Plugins', () => {
  const rootDir = process.cwd();
  const skillPath = path.join(rootDir, 'skills/cybermp-dev/SKILL.md');
  const eventsRefPath = path.join(rootDir, 'skills/cybermp-dev/references/events.md');
  const rpcFlowsRefPath = path.join(rootDir, 'skills/cybermp-dev/references/rpc-flows.md');
  const resourceStructureRefPath = path.join(rootDir, 'skills/cybermp-dev/references/resource-structure.md');
  const serverExamplePath = path.join(rootDir, 'skills/cybermp-dev/examples/basic-resource/server.ts');
  const clientExamplePath = path.join(rootDir, 'skills/cybermp-dev/examples/basic-resource/client.ts');
  const pluginJsonPath = path.join(rootDir, 'plugins/cybermp/plugin.json');

  describe('SKILL.md', () => {
    it('has valid YAML frontmatter and required metadata', () => {
      expect(fs.existsSync(skillPath)).toBe(true);
      const content = fs.readFileSync(skillPath, 'utf-8');

      expect(content).toMatch(/^---\r?\n/);
      expect(content).toMatch(/^name:\s*cybermp-dev\s*$/m);
      expect(content).toMatch(/description:\s*Comprehensive developer guide and runbook for building CyberMP multiplayer resources \(Cyberpunk 2077\)\. Use when creating resources, writing server\/client scripts, wiring CEF web UIs, or configuring multiplayer TypeScript environments\./);
    });

    it('contains comprehensive guides covering core requirements', () => {
      const content = fs.readFileSync(skillPath, 'utf-8');

      // 3-tier architecture
      expect(content).toMatch(/3-Tier Architecture|Three-Tier Architecture/i);
      expect(content).toContain('Server');
      expect(content).toContain('Client');
      expect(content).toMatch(/CEF|Browser/);

      // Anti-hallucination rules
      expect(content).toMatch(/Anti-Hallucination/i);
      expect(content).toContain('FiveM');
      expect(content).toContain('alt:V');
      expect(content).toContain('RAGEMP');

      // Step-by-step resource creation
      expect(content).toMatch(/Resource Creation|Scaffolding/i);
      expect(content).toContain('tsconfig.json');
      expect(content).toContain('package.json');

      // CEF bridge
      expect(content).toMatch(/CEF|Web UI/i);
      expect(content).toContain('events.emitCef');
      expect(content).toContain('cybermp.events.on');

      // MCP tool call instructions
      expect(content).toContain('cybermp_get_event');
      expect(content).toContain('cybermp_get_type');
      expect(content).toContain('cybermp_get_rpc_flow');
      expect(content).toContain('cybermp_search_docs');

      // Offline fallback instructions
      expect(content).toMatch(/Offline Fallback|Without MCP/i);
      expect(content).toContain('references/');

      // Ensure no machine-specific absolute file links are used
      expect(content).not.toMatch(/file:\/\/\//);
      expect(content).not.toMatch(/\/Users\//);

      // Ensure portable relative links
      expect(content).toContain('[Core Events Catalog](references/events.md)');
      expect(content).toContain('[RPC Flows Matrix](references/rpc-flows.md)');
      expect(content).toContain('[Resource Structure & Toolchain](references/resource-structure.md)');
      expect(content).toContain('[Server Starter Example](examples/basic-resource/server.ts)');
      expect(content).toContain('[Client Starter Example](examples/basic-resource/client.ts)');
    });
  });

  describe('Offline References', () => {
    it('provides core events catalog in events.md', () => {
      expect(fs.existsSync(eventsRefPath)).toBe(true);
      const content = fs.readFileSync(eventsRefPath, 'utf-8');
      expect(content.length).toBeGreaterThan(100);

      // Listener signatures and environments
      expect(content).toContain('events.on');
      expect(content).toContain('events.onClient');
      expect(content).toContain('events.onServer');
      expect(content).toContain('events.onCef');
      expect(content).toContain('cybermp.events.on');

      // Sample core events
      expect(content).toContain('playerConnected');
      expect(content).toContain('damage');
    });

    it('provides full RPC flows matrix in rpc-flows.md', () => {
      expect(fs.existsSync(rpcFlowsRefPath)).toBe(true);
      const content = fs.readFileSync(rpcFlowsRefPath, 'utf-8');
      expect(content.length).toBeGreaterThan(100);

      // RPC pairs
      expect(content).toContain('events.emitClient');
      expect(content).toContain('events.onServer');
      expect(content).toContain('events.emitServer');
      expect(content).toContain('events.onClient');
      expect(content).toContain('events.emitCef');
      expect(content).toContain('cybermp.events.on');
      expect(content).toContain('cybermp.events.emit');
      expect(content).toContain('events.onCef');

      // Ensure events global is not imported as a value from type packages
      expect(content).not.toMatch(/import\s+\{[^}]*events[^}]*\}\s+from\s+['"]@cybermp\//);
      expect(content).toContain("import type { MpPlayer } from '@cybermp/server-types';");
    });

    it('provides standard resource structure and configs in resource-structure.md', () => {
      expect(fs.existsSync(resourceStructureRefPath)).toBe(true);
      const content = fs.readFileSync(resourceStructureRefPath, 'utf-8');
      expect(content.length).toBeGreaterThan(100);

      expect(content).toContain('package.json');
      expect(content).toContain('tsconfig.json');
      expect(content).toContain('resource.toml');
      expect(content).toContain('server.toml');
      expect(content).toContain('@cybermp/server-types');
      expect(content).toContain('@cybermp/client-types');
    });

    it('provides comprehensive game-natives reference', () => {
      const gameNativesPath = path.join(rootDir, 'skills/cybermp-dev/references/game-natives.md');
      expect(fs.existsSync(gameNativesPath)).toBe(true);
      const content = fs.readFileSync(gameNativesPath, 'utf-8');
      expect(content.length).toBeGreaterThan(500);
      expect(content).toContain('ScriptGameInstance');
      expect(content).toContain('onceGameLoaded');
      expect(content).toContain('QuestsSystem');
      expect(content).toContain('vvc_visual_customization_unlocked');
      expect(content).toContain('GetWeatherSystem');
      expect(content).toContain('GetTimeSystem');
      expect(content).toContain('GetLoadingScreenSystem');
      expect(content).toContain('world3dToScreen2d');
    });

    it('provides comprehensive vehicles-physics reference', () => {
      const vehPhysicsPath = path.join(rootDir, 'skills/cybermp-dev/references/vehicles-physics.md');
      expect(fs.existsSync(vehPhysicsPath)).toBe(true);
      const content = fs.readFileSync(vehPhysicsPath, 'utf-8');
      expect(content.length).toBeGreaterThan(500);
      expect(content).toContain('GetMountingFacility');
      expect(content).toContain('gamemountingMountingRequest');
      expect(content).toContain('seat_front_left');
      expect(content).toContain('DestructionResetGrid');
      expect(content).toContain('entAnimationControllerComponent');
      expect(content).toContain('AddLinelyVelocity');
      expect(content).toContain('GetValueFromCurve');
    });
  });

  describe('Starter Examples', () => {
    it('provides basic-resource server.ts with events.on and events.onClient', () => {
      expect(fs.existsSync(serverExamplePath)).toBe(true);
      const content = fs.readFileSync(serverExamplePath, 'utf-8');
      expect(content.length).toBeGreaterThan(50);
      expect(content).toContain('events.on');
      expect(content).toContain('events.onClient');
    });

    it('provides basic-resource client.ts with events.onServer and events.emitServer', () => {
      expect(fs.existsSync(clientExamplePath)).toBe(true);
      const content = fs.readFileSync(clientExamplePath, 'utf-8');
      expect(content.length).toBeGreaterThan(50);
      expect(content).toContain('events.onServer');
      expect(content).toContain('events.emitServer');
    });
  });

  describe('Antigravity Plugin Manifest', () => {
    it('has valid Antigravity plugin.json', () => {
      expect(fs.existsSync(pluginJsonPath)).toBe(true);
      const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
      expect(pluginJson.name).toBe('cybermp');
      expect(pluginJson.version).toBe('1.0.0');
      expect(pluginJson.description).toBeDefined();
      expect(pluginJson.skills).toContain('skills/cybermp-dev');
      expect(pluginJson.mcp).toBeDefined();
      expect(pluginJson.mcp.servers).toBeDefined();
      expect(pluginJson.mcp.servers.cybermp).toBeDefined();
    });
  });
});
