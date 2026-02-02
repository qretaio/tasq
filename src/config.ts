import Conf from 'conf';
import { homedir } from 'node:os';
import type { Config } from './types.js';

const config = new Conf<Config>({
  projectName: 'tasq',
  defaults: {
    scan_paths: [`${homedir()}/src`],
  },
});

export function getScanPaths(): string[] {
  return config.get('scan_paths');
}

export function addScanPath(path: string): void {
  const paths = getScanPaths();
  if (!paths.includes(path)) {
    paths.push(path);
    config.set('scan_paths', paths);
  }
}
