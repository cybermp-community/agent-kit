import eventsData from '../data/events.json' with { type: 'json' };
import typesData from '../data/types.json' with { type: 'json' };
import type { EventRecord, TypeRecord } from '../types/index.js';

export interface ForeignApiInfo {
  platform: string;
  cybermpAlternative: string;
}

export const FOREIGN_MAP: Record<string, ForeignApiInfo> = {
  // FiveM
  registernetevent: {
    platform: 'FiveM',
    cybermpAlternative: 'mp.events.onClient(name, (player, ...args) => ...)',
  },
  triggerclientevent: {
    platform: 'FiveM',
    cybermpAlternative: 'mp.events.emitClient(player, name, ...args)',
  },
  triggerserverevent: {
    platform: 'FiveM',
    cybermpAlternative: 'mp.events.emitServer(name, ...args)',
  },
  triggerevent: {
    platform: 'FiveM',
    cybermpAlternative: 'mp.events.emit(name, ...args)',
  },
  onnet: {
    platform: 'FiveM',
    cybermpAlternative: 'mp.events.onClient(name, (player, ...args) => ...)',
  },
  emitnet: {
    platform: 'FiveM',
    cybermpAlternative: 'mp.events.emitServer(name, ...args) or mp.events.emitClient(player, name, ...args)',
  },
  addeventhandler: {
    platform: 'FiveM',
    cybermpAlternative: 'mp.events.on(name, callback)',
  },
  getplayerped: {
    platform: 'FiveM',
    cybermpAlternative: 'player (MpPlayer instance)',
  },
  setentitycoords: {
    platform: 'FiveM',
    cybermpAlternative: 'entity.position = new Vector3(x, y, z)',
  },

  // alt:V
  'alt.onclient': {
    platform: 'alt:V',
    cybermpAlternative: 'mp.events.onClient(name, (player, ...args) => ...)',
  },
  'alt.onserver': {
    platform: 'alt:V',
    cybermpAlternative: 'mp.events.onServer(name, (...args) => ...)',
  },
  'alt.on': {
    platform: 'alt:V',
    cybermpAlternative: 'mp.events.on(name, callback)',
  },
  'alt.emitclient': {
    platform: 'alt:V',
    cybermpAlternative: 'mp.events.emitClient(player, name, ...args)',
  },
  'alt.emitserver': {
    platform: 'alt:V',
    cybermpAlternative: 'mp.events.emitServer(name, ...args)',
  },
  'alt.emit': {
    platform: 'alt:V',
    cybermpAlternative: 'mp.events.emit(name, ...args)',
  },
  'alt.player': {
    platform: 'alt:V',
    cybermpAlternative: 'MpPlayer',
  },
  'alt.vehicle': {
    platform: 'alt:V',
    cybermpAlternative: 'MpVehicle',
  },
  'alt.entity': {
    platform: 'alt:V',
    cybermpAlternative: 'MpEntity',
  },
  'alt.log': {
    platform: 'alt:V',
    cybermpAlternative: 'console.log(...)',
  },

  // RAGEMP
  // mp.events.add is also a documented CyberMP Lua API.
  'mp.events.callremote': {
    platform: 'RAGEMP',
    cybermpAlternative: 'mp.events.emitServer(name, ...args)',
  },
  'mp.events.callclient': {
    platform: 'RAGEMP',
    cybermpAlternative: 'mp.events.emitClient(player, name, ...args)',
  },
  'mp.events.call': {
    platform: 'RAGEMP',
    cybermpAlternative: 'mp.events.emit(name, ...args)',
  },
  'mp.players.local': {
    platform: 'RAGEMP',
    cybermpAlternative: 'player references on client',
  },
  'mp.players.broadcast': {
    platform: 'RAGEMP',
    cybermpAlternative: 'mp.events.emitClients(name, ...args) or player iteration',
  },

  // SA-MP
  onplayerconnect: {
    platform: 'SA-MP',
    cybermpAlternative: "mp.events.on('playerConnect', (player) => ...)",
  },
  onplayerdisconnect: {
    platform: 'SA-MP',
    cybermpAlternative: "mp.events.on('playerDisconnect', (player, reason) => ...)",
  },
  onplayerdeath: {
    platform: 'SA-MP',
    cybermpAlternative: "mp.events.on('playerDeath', (player, ...) => ...)",
  },
  onplayerspawn: {
    platform: 'SA-MP',
    cybermpAlternative: "mp.events.on('playerSpawn', (player) => ...)",
  },
  sendclientmessage: {
    platform: 'SA-MP',
    cybermpAlternative: 'player.sendChatMessage(...)',
  },
  setplayerpos: {
    platform: 'SA-MP',
    cybermpAlternative: 'player.position = new Vector3(x, y, z)',
  },
  createvehicle: {
    platform: 'SA-MP',
    cybermpAlternative: 'new MpVehicle(model, position)',
  },
};

// Known official CyberMP types, events, and API prefixes that must never trigger warnings
const OFFICIAL_CYBERMP_SYMBOLS = new Set<string>([
  ...(eventsData as EventRecord[]).map((e) => e.name.toLowerCase()),
  ...(typesData as TypeRecord[]).map((t) => t.name.toLowerCase()),
  'events.on',
  'events.once',
  'events.off',
  'events.onclient',
  'events.onserver',
  'events.oncef',
  'events.emit',
  'events.emitclient',
  'events.emitserver',
  'events.emitcef',
  'mp.events.on',
  'mp.events.once',
  'mp.events.off',
  'mp.events.onclient',
  'mp.events.onserver',
  'mp.events.oncef',
  'mp.events.emit',
  'mp.events.emitclient',
  'mp.events.emitserver',
  'mp.events.emitcef',
  'mp.commands.add',
  'mp.local',
  'mp.localstorage',
  'cybermp.events.on',
  'cybermp.events.emit',
]);

// Sort keys by length descending to match most specific symbols first (e.g. alt.onclient before alt.on)
const SORTED_FOREIGN_KEYS = Object.keys(FOREIGN_MAP).sort(
  (a, b) => b.length - a.length
);

function matchesTokenBoundary(query: string, key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
  return regex.test(query);
}

/**
 * Checks whether a query contains APIs or patterns from foreign multiplayer
 * platforms (FiveM, alt:V, RAGEMP, SA-MP) and returns a helpful warning
 * pointing to the official CyberMP equivalent.
 *
 * Employs identifier token boundary matching and official symbol allowlisting
 * to prevent false positives on valid CyberMP symbols (e.g. CreateVehicleOptions, vehicle bonnet).
 */
export function checkForeignApi(query: string): string | null {
  if (!query || typeof query !== 'string') return null;
  const normalized = query.toLowerCase().trim();

  // If query is directly an official CyberMP type, event, or API, do not warn
  if (OFFICIAL_CYBERMP_SYMBOLS.has(normalized)) {
    return null;
  }

  for (const key of SORTED_FOREIGN_KEYS) {
    if (matchesTokenBoundary(query, key)) {
      const info = FOREIGN_MAP[key];
      return `⚠️ Warning: '${query}' is from ${info.platform}. In CyberMP, use '${info.cybermpAlternative}'.`;
    }
  }

  return null;
}
