/**
 * Context gathering for tasq
 * Uses @qretaio/repo for context gathering to avoid duplication
 */

import type { ContextSection } from './types.js';
import { gatherFullContext as repoGatherFullContext } from '@qretaio/repo';

/**
 * Gather full context for tasq's orchestrator prompt
 * Uses @qretaio/repo's gatherFullContext with tasq-specific options
 */
export async function gatherFullContext(
  projectDir: string,
  contextSection: ContextSection,
  _tasksPath: string,
  _parsed: unknown,
  _tasks: Array<{ id?: string; description: string; status: string }>,
  _task: { id?: string; description: string }
): Promise<string> {
  // Use repo package's gatherFullContext with tasq-specific options
  return repoGatherFullContext(projectDir, {
    includeReadme: true,
    includeConfig: true,
    includeTests: true,
    includeTodos: true,
    includeDocs: true,
    includePatterns: true,
    contextPatterns: contextSection.files,
    maxFiles: 15,
  });
}
