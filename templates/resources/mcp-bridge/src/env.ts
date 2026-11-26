import { readFileSync } from 'node:fs';

const parse = (content: string) => {
  const env: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);

    if (match) {
      env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }

  return env;
};

export const loadConfig = (): Record<string, string | undefined> => {
  const paths = ['.env'];

  if (typeof __dirname !== 'undefined') {
    paths.push(`${__dirname}/../../../../.env`);
  }

  const fromFiles: Record<string, string> = {};

  for (const path of paths) {
    try {
      // The first file that has a key wins
      for (const [key, value] of Object.entries(parse(readFileSync(path, 'utf8')))) {
        fromFiles[key] ??= value;
      }
    } catch {
      // No such file
    }
  }

  return { ...fromFiles, ...process.env };
};
