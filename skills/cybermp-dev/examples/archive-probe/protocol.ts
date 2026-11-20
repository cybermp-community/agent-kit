export const propPaths = {
  base: 'base\\gameplay\\devices\\doors\\gates\\appearances\\w300_h250_mall_metal.ent',
  archive: 'cybermp_kit\\diagnostics\\cube.ent',
} as const;

export type PropAsset = keyof typeof propPaths;

export function isPropAsset(value: unknown): value is PropAsset {
  return value === 'base' || value === 'archive';
}

export const commandName = 'kitprop';
export const events = {
  local: 'kit-archive-probe:local',
  clear: 'kit-archive-probe:clear',
  status: 'kit-archive-probe:status',
} as const;
