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

export function removeScanPath(path: string): boolean {
  const paths = getScanPaths();
  const index = paths.indexOf(path);
  if (index !== -1) {
    paths.splice(index, 1);
    config.set('scan_paths', paths);
    return true;
  }
  return false;
}
