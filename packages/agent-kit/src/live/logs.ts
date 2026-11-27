import { open, readdir, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const MAX_TAIL_BYTES = 4 * 1024 * 1024;
const MAX_LINE_LENGTH = 1_000;

export type LogFile = { name: string; sizeKb: number; modified: Date };

/** `.log` files in `dir`, newest first (one per server start) */
export const listLogFiles = async (dir: string): Promise<LogFile[]> => {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.log'));

  const files = await Promise.all(
    names.map(async (name): Promise<LogFile | undefined> => {
      try {
        const info = await stat(resolve(dir, name));

        // A directory named *.log, a socket...
        if (!info.isFile()) {
          return undefined;
        }

        return { name, sizeKb: Math.round(info.size / 1024), modified: info.mtime };
      } catch {
        // Broken symlink, or deleted since readdir
        return undefined;
      }
    }),
  );

  return files
    .filter((file): file is LogFile => file !== undefined)
    .sort((a, b) => b.modified.getTime() - a.modified.getTime());
};

/** Reads at most the last MAX_TAIL_BYTES of a file */
const readTail = async (path: string) => {
  const handle = await open(path, 'r');

  try {
    const { size } = await handle.stat();
    const length = Math.min(size, MAX_TAIL_BYTES);
    const buffer = Buffer.alloc(length);

    // Fewer bytes when the file was truncated or rotated since stat()
    const { bytesRead } = await handle.read(buffer, 0, length, size - length);
    const text = buffer.subarray(0, bytesRead).toString('utf8');

    // Drop the first (probably partial) line when we didn't read from the start
    return length < size ? text.slice(text.indexOf('\n') + 1) : text;
  } finally {
    await handle.close();
  }
};

export type ReadLogOptions = {
  /** File name from {@link listLogFiles}; the newest when left out */
  file?: string;
  lines: number;
  /** Case-insensitive substring */
  filter?: string;
};

/** Last lines of a log file in `dir`. Only plain file names inside `dir` are accepted */
export const readLog = async (dir: string, opts: ReadLogOptions) => {
  const files = await listLogFiles(dir);
  const name = opts.file ? basename(opts.file) : files[0]?.name;

  if (!name || !files.some((f) => f.name === name)) {
    throw new Error(opts.file ? `Log file ${opts.file} not found` : 'No log files yet');
  }

  const needle = opts.filter?.toLowerCase();
  const all = (await readTail(resolve(dir, name))).split(/\r?\n/);
  const matching = needle ? all.filter((line) => line.toLowerCase().includes(needle)) : all;

  const lines = matching
    .slice(-opts.lines)
    .map((line) =>
      line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}… [truncated]` : line,
    );

  return { file: name, matched: matching.length, lines };
};
