import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ServerProcess = {
  pid: number;
  /** Not available on Windows */
  uptimeSec: number | null;
  memoryMb: number;
  command: string;
};

/** `ps -o pid=,etimes=,rss=,args=` output */
export const parsePs = (stdout: string): ServerProcess[] =>
  stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, etimes, rss, ...args] = line.split(/\s+/);

      return {
        pid: Number(pid),
        uptimeSec: Number(etimes),
        memoryMb: Math.round(Number(rss) / 1024),
        command: args.join(' '),
      };
    });

/** `tasklist /FO CSV /NH` output: "name","pid","session","#","12,345 K" */
export const parseTasklist = (stdout: string): ServerProcess[] =>
  stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('"'))
    .map((line) => line.slice(1, -1).split('","'))
    .filter((cells) => cells.length >= 5 && /^\d+$/.test(cells[1]))
    .map(([name, pid, , , memory]) => ({
      pid: Number(pid),
      uptimeSec: null,
      memoryMb: Math.round(Number(memory.replace(/\D/g, '')) / 1024),
      command: name,
    }));

/**
 * Running server processes named `name` (normally zero or one). CyberMP
 * servers run on Linux and Windows; elsewhere the list is empty.
 */
export const getServerProcesses = async (
  name: string,
  platform: NodeJS.Platform = process.platform,
): Promise<ServerProcess[]> => {
  try {
    if (platform === 'win32') {
      const image = name.toLowerCase().endsWith('.exe') ? name : `${name}.exe`;
      const { stdout } = await execFileAsync('tasklist', [
        '/FI',
        `IMAGENAME eq ${image}`,
        '/FO',
        'CSV',
        '/NH',
      ]);

      return parseTasklist(stdout);
    }

    if (platform === 'linux') {
      const { stdout } = await execFileAsync('ps', ['-C', name, '-o', 'pid=,etimes=,rss=,args=']);

      return parsePs(stdout);
    }

    return [];
  } catch {
    // `ps` exits with 1 when nothing matches
    return [];
  }
};
