/**
 * Context gathering for tasq
 * Uses @qretaio/repo for context gathering to avoid duplication
 */

import type { ContextSection } from './types.js';
import {
  gatherFullContext as repoGatherFullContext,
  gatherIntelligenceContext,
  formatIntelligenceSection,
  type IntelligenceContext,
  type ProjectTypeFlags,
} from '@qretaio/repo';

// Re-export types for external use
export type { IntelligenceContext, ProjectTypeFlags } from '@qretaio/repo';

/**
 * Gather full context for tasq's orchestrator prompt
 * Uses @qretaio/repo's gatherFullContext which now includes intelligence section
 */
export async function gatherFullContext(
  projectDir: string,
  contextSection: ContextSection,
  _tasksPath: string,
  _parsed: unknown,
  _tasks: Array<{ id?: string; description: string; status: string }>,
  _task: { id?: string; description: string }
): Promise<string> {
  // Use repo package's gatherFullContext which now includes Project Intelligence section
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

/**
 * Gather only intelligent context (lightweight analysis)
 * Useful for quick project analysis without full file context
 */
export async function gatherIntelligentContextOnly(
  projectDir: string
): Promise<IntelligenceContext> {
  return gatherIntelligenceContext(projectDir);
}

/**
 * Format intelligent context for display
 */
export { formatIntelligenceSection as formatIntelligentContext };
