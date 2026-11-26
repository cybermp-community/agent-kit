import z from 'zod';
import { BridgeError, defineMethod, type MethodDef } from './index.ts';

type Hash = bigint | number;
type Vec3 = [number, number, number];

type AnyEntity = {
  id: number;
  position: Vec3;
  yaw: number;
  dimension: number;
  owner?: { id: number } | null;
  exist: boolean;
};

type Collection<T> = {
  create(options: any): T;
  destroy(entity: number): void;
  exists(entity: number): boolean;
  at(entity: number): T;
  toArray(): T[];
};

/** The slice of the `mp` global that {@link entityMethods} needs */
export type EntitiesMp = {
  hashes: {
    tweakdbid(path: string): Hash;
    cname(path: string): Hash;
    resref(path: string): Hash;
  };
  vehicles: Collection<
    AnyEntity & {
      model: Hash;
      appearance: Hash;
      health: number;
      seats: Record<string, { id: number } | null>;
    }
  >;
  peds: Collection<AnyEntity & { model: Hash; appearance: Hash; health: number }>;
  objects: Collection<AnyEntity & { model: Hash }>;
};

type HashKind = 'tweakdbid' | 'cname' | 'resref';

/**
 * `"123456"` (raw hash), `"tweakdbid:Vehicle.x"` / `"cname:x"` / `"resref:x"`
 * (explicit), or a bare name when `fallback` says which kind it must be.
 */
const toHash = (mp: EntitiesMp, value: string, fallback?: HashKind): Hash => {
  if (/^\d+$/.test(value)) {
    return BigInt(value);
  }

  const explicit = value.match(/^(tweakdbid|cname|resref):(.+)$/);

  if (explicit) {
    return mp.hashes[explicit[1] as HashKind](explicit[2]);
  }

  if (fallback) {
    return mp.hashes[fallback](value);
  }

  throw new BridgeError(
    `Cannot tell which hash kind "${value}" is: write it as tweakdbid:<name>, cname:<name> or resref:<name>, or pass the raw numeric hash`,
  );
};

const zHash = z
  .string()
  .min(1)
  .max(300)
  .describe(
    'Raw numeric hash, or "tweakdbid:<name>" / "cname:<name>" / "resref:<name>"',
  );

const zPosition = z
  .tuple([z.number(), z.number(), z.number()])
  .describe('[x, y, z]');

const zId = z.number().int().nonnegative();

const listParams = z
  .object({
    dimension: z.number().int().optional().describe('Only this dimension'),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .default({ limit: 100 });

const page = <T extends AnyEntity, R>(
  all: T[],
  { dimension, limit }: { dimension?: number; limit: number },
  map: (entity: T) => R,
) => {
  const matching = all.filter(
    (e) => e.exist && (dimension === undefined || e.dimension === dimension),
  );

  return {
    total: matching.length,
    entities: matching.slice(0, limit).map(map),
  };
};

const base = (e: AnyEntity) => ({
  id: e.id,
  position: e.position,
  yaw: e.yaw,
  dimension: e.dimension,
  ownerId: e.owner?.id ?? null,
});

export type EntityMethodsOptions = {
  /**
   * Also expose `hash_name`, `spawn_*` and `destroy_entity`. They change the
   * world for everyone: default `false`.
   */
  spawn?: boolean;
};

/**
 * `list_vehicles`, `list_peds`, `list_objects` (read-only) and, with
 * `{ spawn: true }`, `hash_name`, `spawn_vehicle`, `spawn_ped`,
 * `spawn_object` and `destroy_entity`.
 *
 * Note that a game mode that manages its own entities (spawners, matches)
 * does not know about entities destroyed from outside.
 */
export const entityMethods = (
  mp: EntitiesMp,
  options: EntityMethodsOptions = {},
): Record<string, MethodDef> => {
  const methods: Record<string, MethodDef> = {
    'vehicles.list': defineMethod({
      tool: 'list_vehicles',
      title: 'List vehicles',
      description:
        'Vehicles in the world: id, model and appearance hashes, health, position, yaw, dimension, sync owner and who sits in each seat.',
      kind: 'read',
      params: listParams,
      handler: (params) =>
        page(mp.vehicles.toArray(), params, (v) => ({
          ...base(v),
          model: v.model.toString(),
          appearance: v.appearance.toString(),
          health: v.health,
          seats: Object.fromEntries(
            Object.entries(v.seats).map(([seat, p]) => [seat, p?.id ?? null]),
          ),
        })),
    }),

    'peds.list': defineMethod({
      tool: 'list_peds',
      title: 'List peds',
      description:
        'Server-created peds (NPCs): id, model and appearance hashes, health, position, yaw, dimension, sync owner.',
      kind: 'read',
      params: listParams,
      handler: (params) =>
        page(mp.peds.toArray(), params, (p) => ({
          ...base(p),
          model: p.model.toString(),
          appearance: p.appearance.toString(),
          health: p.health,
        })),
    }),

    'objects.list': defineMethod({
      tool: 'list_objects',
      title: 'List objects',
      description:
        'Server-created objects: id, model hash, position, yaw, dimension, sync owner.',
      kind: 'read',
      params: listParams,
      handler: (params) =>
        page(mp.objects.toArray(), params, (o) => ({
          ...base(o),
          model: o.model.toString(),
        })),
    }),
  };

  if (!options.spawn) {
    return methods;
  }

  const common = {
    position: zPosition,
    yaw: z.number().optional(),
    dimension: z.number().int().min(0).optional(),
  };

  return {
    ...methods,

    'hash.name': defineMethod({
      tool: 'hash_name',
      title: 'Hash a name',
      description:
        'Converts a name to the game hash the spawn tools use (as a decimal string).',
      kind: 'read',
      params: z.object({
        kind: z.enum(['tweakdbid', 'cname', 'resref']),
        name: z.string().min(1).max(300),
      }),
      handler: ({ kind, name }) => ({ hash: mp.hashes[kind](name).toString() }),
    }),

    'vehicles.spawn': defineMethod({
      tool: 'spawn_vehicle',
      title: 'Spawn vehicle',
      description:
        'Creates a vehicle. `model` is a TweakDB name like "Vehicle.v_sport2_porsche_911turbo_player" (the "Vehicle." prefix is added when missing) and `appearance` a CName; both also accept the explicit hash forms.',
      kind: 'write',
      params: z.object({
        model: zHash,
        appearance: zHash,
        ...common,
        health: z.number().min(0).max(100).optional(),
      }),
      handler: ({ model, appearance, ...rest }) => {
        const vehicle = mp.vehicles.create({
          model: toHash(
            mp,
            /^\d+$|^\w+:/.test(model) || model.includes('.')
              ? model
              : `Vehicle.${model}`,
            'tweakdbid',
          ),
          appearance: toHash(mp, appearance, 'cname'),
          ...rest,
        });

        return { id: vehicle.id };
      },
    }),

    'peds.spawn': defineMethod({
      tool: 'spawn_ped',
      title: 'Spawn ped',
      description:
        'Creates a ped (NPC). `model` and `appearance` must say their hash kind ("tweakdbid:...", "cname:...") or be raw numeric hashes.',
      kind: 'write',
      params: z.object({
        model: zHash,
        appearance: zHash,
        ...common,
        health: z.number().min(0).optional(),
      }),
      handler: ({ model, appearance, ...rest }) => ({
        id: mp.peds.create({
          model: toHash(mp, model),
          appearance: toHash(mp, appearance),
          ...rest,
        }).id,
      }),
    }),

    'objects.spawn': defineMethod({
      tool: 'spawn_object',
      title: 'Spawn object',
      description:
        'Creates an object. `model` must say its hash kind ("tweakdbid:...", "resref:...") or be a raw numeric hash.',
      kind: 'write',
      params: z.object({
        model: zHash,
        ...common,
        dynamic: z.boolean().optional(),
      }),
      handler: ({ model, ...rest }) => ({
        id: mp.objects.create({ model: toHash(mp, model), ...rest }).id,
      }),
    }),

    'entities.destroy': defineMethod({
      tool: 'destroy_entity',
      title: 'Destroy entity',
      description:
        'Removes a vehicle, ped or object from the world, even if a player is using it. Get ids from list_vehicles / list_peds / list_objects.',
      kind: 'destructive',
      params: z.object({
        type: z.enum(['vehicle', 'ped', 'object']),
        id: zId,
      }),
      handler: ({ type, id }) => {
        const collection = { vehicle: mp.vehicles, ped: mp.peds, object: mp.objects }[type];

        if (!collection.exists(id)) {
          throw new BridgeError(`No ${type} with id ${id}`);
        }

        collection.destroy(id);

        return { destroyed: true };
      },
    }),
  };
};
