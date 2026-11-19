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

    it('indexes all real-world mechanics reference guides in SKILL.md', () => {
      const skillContent = fs.readFileSync(skillPath, 'utf-8');
      expect(skillContent).toContain('references/game-natives.md');
      expect(skillContent).toContain('references/vehicles-physics.md');
      expect(skillContent).toContain('references/player-mechanics.md');
      expect(skillContent).toContain('references/cameras-input-cef.md');
      expect(skillContent).toContain('references/server-mechanics.md');
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
      expect(content).toContain('anyServerResourceStart');
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
      expect(content).toContain('in_world_navigation.archive');
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
      expect(content).toContain('GetMappinSystem');
      expect(content).toContain('GetFxSystem');
      expect(content).toContain('mp.local.spawnObject');
      expect(content).toContain('GetTargetingSystem');
      expect(content).toContain('GetLookAtObject');
      expect(content).toContain('GetMultiplayerSystem');
      expect(content).toContain('getStreamedPool');
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
      expect(content).toContain('IsOnGround');
      expect(content).toContain('mp.game.LerpF');
      expect(content).toContain('speed_to_multiplier');
    });

    it('provides comprehensive player-mechanics reference', () => {
      const playerMechPath = path.join(rootDir, 'skills/cybermp-dev/references/player-mechanics.md');
      expect(fs.existsSync(playerMechPath)).toBe(true);
      const content = fs.readFileSync(playerMechPath, 'utf-8');
      expect(content.length).toBeGreaterThan(500);
      expect(content).toContain('spawnPlayer');
      expect(content).toContain('GetTeleportationFacility');
      expect(content).toContain('GetStatPoolsSystem');
      expect(content).toContain('GetStatusEffectSystem');
      expect(content).toContain('GameplayRestriction.NoCombat');
      expect(content).toContain('AddToInventory');
      expect(content).toContain('MenuScenario_CharacterCustomizationMirror');
      expect(content).toContain('PlayerDevelopmentSystem');
      expect(content).toContain('SetPlayerGender');
      expect(content).toContain('Ammo.HandgunAmmo');
      expect(content).toContain('gameDrawItemRequest');
      expect(content).toContain('RequestUnequipItem');
      expect(content).toContain('AnimFeature_SwimmingData');
      expect(content).toContain('GameplayRestriction.VehicleCombatBlockExit');
    });

    it('provides comprehensive cameras-input-cef reference', () => {
      const camInputPath = path.join(rootDir, 'skills/cybermp-dev/references/cameras-input-cef.md');
      expect(fs.existsSync(camInputPath)).toBe(true);
      const content = fs.readFileSync(camInputPath, 'utf-8');
      expect(content.length).toBeGreaterThan(500);
      expect(content).toContain('GetFPPCameraComponent');
      expect(content).toContain('simple_free_camera.ent');
      expect(content).toContain('spectateCamera');
      expect(content).toContain('onInputKeyEvent');
      expect(content).toContain('mp.cef.setFocus');
      expect(content).toContain('mp.events.onCef');
      expect(content).toContain('inkTextWidget');
      expect(content).toContain('inkHUDLayer');
    });

    it('provides comprehensive server-mechanics reference', () => {
      const serverMechPath = path.join(rootDir, 'skills/cybermp-dev/references/server-mechanics.md');
      expect(fs.existsSync(serverMechPath)).toBe(true);
      const content = fs.readFileSync(serverMechPath, 'utf-8');
      expect(content.length).toBeGreaterThan(500);
      expect(content).toContain('mp.objects.create');
      expect(content).toContain('player.dimension');
      expect(content).toContain('player.setMeta');
      expect(content).toContain('isPointInPolygon2D');
      expect(content).toContain('Safezone');
      expect(content).toContain('mp.cancelEvent');
      expect(content).toContain('mp.players.toArray');
      expect(content).toContain('mp.hashes.tweakdbid');
      expect(content).toContain('mp.peds.toArray');
      expect(content).toContain('mp.resources.restart');
      expect(content).toContain('mp.exports');
      expect(content).toContain('mp.pickups.create');
      expect(content).toContain('mp.isServer');
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
