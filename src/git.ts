/**
 * Git context gathering for tasq
 * Uses @qretaio/repo for git context to avoid duplication
 */

import { getGitContext as repoGetGitContext } from '@qretaio/repo';

export interface GitContext {
  branch?: string;
  status?: string;
  lastCommit?: string;
}

/**
 * Gather git context as a formatted string
 * Uses @qretaio/repo's getGitContext and formats it for tasq
 */
export async function gatherGitContext(baseDir: string): Promise<string | null> {
  const gitInfo = await repoGetGitContext(baseDir);
  if (!gitInfo) {
    return null;
  }

  const context: string[] = [];

  if (gitInfo.branch) {
    context.push(`Branch: ${gitInfo.branch}`);
  }

  if (gitInfo.status) {
    const { staged, modified } = gitInfo.status;
    if (staged > 0 || modified > 0) {
      context.push(`Changes: ${staged} staged, ${modified} unstaged`);
    }
  }

  if (gitInfo.lastCommit) {
    context.push(`Last commit: ${gitInfo.lastCommit}`);
  }

  return context.length > 0 ? context.join('\n') : null;
}
