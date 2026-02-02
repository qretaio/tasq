import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export interface GitContext {
  branch?: string;
  status?: string;
  lastCommit?: string;
}

export async function gatherGitContext(baseDir: string): Promise<string | null> {
  const gitPath = join(baseDir, '.git');
  if (!existsSync(gitPath)) {
    return null;
  }

  const context: string[] = [];

  try {
    // Get current branch
    const branch = execSync('git branch --show-current', {
      cwd: baseDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (branch) {
      context.push(`Branch: ${branch}`);
    }

    // Get git status summary
    const status = execSync('git status --short', {
      cwd: baseDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (status) {
      const lines = status.split('\n');
      const staged = lines.filter(
        (l) => l.startsWith('M ') || l.startsWith('A ') || l.startsWith('D ')
      ).length;
      const modified = lines.filter(
        (l) => !l.startsWith('M ') && !l.startsWith('A ') && !l.startsWith('D ') && l.trim()
      ).length;
      if (staged > 0 || modified > 0) {
        context.push(`Changes: ${staged} staged, ${modified} unstaged`);
      }
    }

    // Get recent commit message
    const lastCommit = execSync('git log -1 --format="%s"', {
      cwd: baseDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (lastCommit) {
      context.push(`Last commit: ${lastCommit}`);
    }
  } catch {
    // Git commands may fail, skip silently
  }

  return context.length > 0 ? context.join('\n') : null;
}
