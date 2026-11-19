export interface ForeignApiInfo {
  platform: string;
  cybermpAlternative: string;
}

export const FOREIGN_MAP: Record<string, ForeignApiInfo> = {
  // FiveM
  registernetevent: {
    platform: 'FiveM',
    cybermpAlternative: 'events.onClient(name, (player, ...args) => ...)',
  },
  triggerclientevent: {
    platform: 'FiveM',
    cybermpAlternative: 'events.emitClient(player, name, ...args)',
  },
  triggerserverevent: {
    platform: 'FiveM',
    cybermpAlternative: 'events.emitServer(name, ...args)',
  },
  triggerevent: {
    platform: 'FiveM',
    cybermpAlternative: 'events.emit(name, ...args)',
  },
  onnet: {
    platform: 'FiveM',
    cybermpAlternative: 'events.onClient(name, (player, ...args) => ...)',
  },
  emitnet: {
    platform: 'FiveM',
    cybermpAlternative: 'events.emitServer(name, ...args) or events.emitClient(player, name, ...args)',
  },
  addeventhandler: {
    platform: 'FiveM',
    cybermpAlternative: 'events.on(name, callback)',
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
    cybermpAlternative: 'events.onClient(name, (player, ...args) => ...)',
  },
  'alt.onserver': {
    platform: 'alt:V',
    cybermpAlternative: 'events.onServer(name, (...args) => ...)',
  },
  'alt.on': {
    platform: 'alt:V',
    cybermpAlternative: 'events.on(name, callback)',
  },
  'alt.emitclient': {
    platform: 'alt:V',
    cybermpAlternative: 'events.emitClient(player, name, ...args)',
  },
  'alt.emitserver': {
    platform: 'alt:V',
    cybermpAlternative: 'events.emitServer(name, ...args)',
  },
  'alt.emit': {
    platform: 'alt:V',
    cybermpAlternative: 'events.emit(name, ...args)',
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
  'mp.events.add': {
    platform: 'RAGEMP',
    cybermpAlternative: 'events.on(name, callback)',
  },
  'mp.events.callremote': {
    platform: 'RAGEMP',
    cybermpAlternative: 'events.emitServer(name, ...args)',
  },
  'mp.events.callclient': {
    platform: 'RAGEMP',
    cybermpAlternative: 'events.emitClient(player, name, ...args)',
  },
  'mp.events.call': {
    platform: 'RAGEMP',
    cybermpAlternative: 'events.emit(name, ...args)',
  },
  'mp.players.local': {
    platform: 'RAGEMP',
    cybermpAlternative: 'player references on client',
  },
  'mp.players.broadcast': {
    platform: 'RAGEMP',
    cybermpAlternative: 'events.emitClients(name, ...args) or player iteration',
  },

  // SA-MP
  onplayerconnect: {
    platform: 'SA-MP',
    cybermpAlternative: "events.on('playerConnect', (player) => ...)",
  },
  onplayerdisconnect: {
    platform: 'SA-MP',
    cybermpAlternative: "events.on('playerDisconnect', (player, reason) => ...)",
  },
  onplayerdeath: {
    platform: 'SA-MP',
    cybermpAlternative: "events.on('playerDeath', (player, ...) => ...)",
  },
  onplayerspawn: {
    platform: 'SA-MP',
    cybermpAlternative: "events.on('playerSpawn', (player) => ...)",
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

/**
 * Checks whether a query contains APIs or patterns from foreign multiplayer
 * platforms (FiveM, alt:V, RAGEMP, SA-MP) and returns a helpful warning
 * pointing to the official CyberMP equivalent.
 */
export function checkForeignApi(query: string): string | null {
  if (!query || typeof query !== 'string') return null;
  const normalized = query.toLowerCase().trim();

  for (const [key, info] of Object.entries(FOREIGN_MAP)) {
    if (normalized.includes(key)) {
      return `⚠️ Warning: '${query}' is from ${info.platform}. In CyberMP, use '${info.cybermpAlternative}'.`;
    }
  }

  return null;
}
