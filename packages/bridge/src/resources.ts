import z from 'zod';
import { BridgeError, defineMethod, type MethodDef } from './index.ts';

const STATES = ['NotRunning', 'Starting', 'Running', 'Stopped'] as const;

/** The slice of the `mp` global that {@link resourceMethods} needs */
export type ResourcesMp = {
  config: Record<string, any> & { resources: string[] };
  resources: {
    getState(name: string): number;
    getCurrentName(): string;
    start(name: string): void;
    stop(name: string): void;
    restart(name: string): void;
  };
};

const SECRET_KEY = /token|secret|password|passwd|private|credential|api[_-]?key/i;

const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SECRET_KEY.test(key) ? '[redacted]' : redact(item),
      ]),
    );
  }

  return value;
};

export type ResourceMethodsOptions = {
  /**
   * Resources that `start`/`stop`/`restart` must refuse (the bridge's own
   * resource is always protected, so stopping it would cut the agent off).
   */
  protect?: string[];
};

/**
 * `get_server_config` (secrets redacted), `list_resources`, and
 * `start_resource` / `stop_resource` / `restart_resource`.
 */
export const resourceMethods = (
  mp: ResourcesMp,
  options: ResourceMethodsOptions = {},
): Record<string, MethodDef> => {
  const self = mp.resources.getCurrentName();
  const protectedNames = new Set([self, ...(options.protect ?? [])]);

  const zName = z.object({ name: z.string().min(1).max(100) });

  const known = (name: string) => {
    if (!mp.config.resources.includes(name)) {
      throw new BridgeError(
        `Unknown resource ${name}. Configured: ${mp.config.resources.join(', ')}`,
      );
    }
  };

  const guarded = (name: string, action: string) => {
    known(name);

    if (protectedNames.has(name)) {
      throw new BridgeError(
        `Refusing to ${action} ${name}: it hosts this bridge (or is protected), so the agent could not bring it back. Do it from the server console.`,
      );
    }
  };

  return {
    'server.config': defineMethod({
      tool: 'get_server_config',
      title: 'Server config',
      description:
        'The server configuration as the running server sees it (max players, hosts, core options, resource list). Keys that look like secrets are redacted.',
      kind: 'read',
      params: z.object({}).default({}),
      handler: () => redact(mp.config),
    }),

    'resources.list': defineMethod({
      tool: 'list_resources',
      title: 'List resources',
      description:
        'Configured resources and their state (NotRunning, Starting, Running, Stopped). `protected` ones cannot be stopped or restarted from here.',
      kind: 'read',
      params: z.object({}).default({}),
      handler: () =>
        mp.config.resources.map((name) => ({
          name,
          state: STATES[mp.resources.getState(name)] ?? 'Unknown',
          protected: protectedNames.has(name),
        })),
    }),

    'resources.start': defineMethod({
      tool: 'start_resource',
      title: 'Start resource',
      description: 'Starts a configured resource that is not running.',
      kind: 'write',
      params: zName,
      handler: ({ name }) => {
        known(name);
        mp.resources.start(name);

        return { requested: 'start', name };
      },
    }),

    'resources.stop': defineMethod({
      tool: 'stop_resource',
      title: 'Stop resource',
      description:
        'Stops a resource for everyone (its players lose its features). Refuses the resource hosting the bridge.',
      kind: 'destructive',
      params: zName,
      handler: ({ name }) => {
        guarded(name, 'stop');
        mp.resources.stop(name);

        return { requested: 'stop', name };
      },
    }),

    'resources.restart': defineMethod({
      tool: 'restart_resource',
      title: 'Restart resource',
      description:
        'Restarts a resource (players of its game modes are disrupted). Refuses the resource hosting the bridge.',
      kind: 'destructive',
      params: zName,
      handler: ({ name }) => {
        guarded(name, 'restart');
        mp.resources.restart(name);

        return { requested: 'restart', name };
      },
    }),
  };
};
