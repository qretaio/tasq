import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { homedir } from 'node:os';
import { cwd as processCwd } from 'node:process';
import fg from 'fast-glob';
import {
  STATUS_MARKERS,
  STATUS_ICONS,
  type TaskStatus,
  type Task,
  type ParsedTasks,
  type ProjectResult,
} from './types.js';
import { parseTasks, parseContextSection, generateRepoIds } from './parser.js';
import { gatherFullContext } from './context.js';

const TASKS_MD = 'TASKS.md';

export function getRepoBase(): string {
  return processCwd();
}

export async function readTasks(): Promise<ParsedTasks | null> {
  const path = join(getRepoBase(), TASKS_MD);
  if (!existsSync(path)) return null;
  const content = await readFile(path, 'utf-8');
  return parseTasks(content);
}

export function readTasksSync(filePath: string): ParsedTasks | null {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf-8');
  return parseTasks(content);
}

export async function writeTasks(parsed: ParsedTasks): Promise<void> {
  const path = join(getRepoBase(), TASKS_MD);
  await writeFile(path, parsed.lines.join('\n'), 'utf-8');
}

export async function updateTaskStatus(
  lineIndex: number,
  status: TaskStatus
): Promise<ParsedTasks | null> {
  const parsed = await readTasks();
  if (!parsed) return null;

  const line = parsed.lines[lineIndex];
  const newLine = line.replace(/^\-\s*\[([x~ ]?)\]/, `- ${STATUS_MARKERS[status]}`);
  parsed.lines[lineIndex] = newLine;

  await writeTasks(parsed);
  return parsed;
}

export async function scanAllTasks(scanPaths: string[]): Promise<ProjectResult[]> {
  const patterns = scanPaths.map((p) => {
    const basePath = p.replace(/^~/, homedir());
    return `${basePath}/**/TASKS.md`;
  });

  const files = await fg(patterns, {
    absolute: true,
    onlyFiles: true,
    deep: 3,
    ignore: ['**/node_modules/**', '**/target/**', '**/dist/**', '**/.git/**'],
  });

  // Parallel file reading
  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await readFile(file, 'utf-8');
        const parsed = parseTasks(content);
        const projectDir = dirname(file);
        const projectName = basename(projectDir);
        const relPath = projectDir.replace(homedir(), '~');
        return { path: file, projectName, relPath, parsed, tasks: parsed.tasks };
      } catch {
        return null;
      }
    })
  );

  return results.filter((r): r is ProjectResult => r !== null);
}

export async function scanAllTasksWithIds(
  scanPaths: string[]
): Promise<Array<ProjectResult & { repoId: string }>> {
  const results = await scanAllTasks(scanPaths);

  // Generate repo IDs
  const projectNames = results.map((r) => r.projectName);
  const repoIds = generateRepoIds(projectNames);

  // Add repo ID and task IDs to each result
  return results.map((r) => {
    const repoId = repoIds.get(r.projectName)!;
    const tasksWithIds = r.tasks.map((t, i) => ({
      ...t,
      id: `${repoId}${i + 1}`,
    }));
    return {
      ...r,
      repoId,
      tasks: tasksWithIds,
    };
  });
}

export async function findTaskAcrossProjects(identifier: string): Promise<
  | ((ProjectResult & {
      repoId: string;
      parsed: ParsedTasks;
    }) & { task: Task })
  | null
> {
  const { getScanPaths } = await import('./config.js');
  const scanPaths = getScanPaths();
  const results = await scanAllTasksWithIds(scanPaths);

  // Try compact ID format: <repoId><taskNum> e.g., "p1", "u2"
  const compactMatch = identifier.match(/^([a-z]+)(\d+)$/);
  if (compactMatch) {
    const [, repoId, taskNum] = compactMatch;
    const taskIndex = parseInt(taskNum, 10) - 1;

    for (const result of results) {
      if (result.repoId === repoId && taskIndex >= 0 && taskIndex < result.tasks.length) {
        const task = result.tasks[taskIndex];
        return { ...result, task };
      }
    }
  }

  // Try as substring match (fallback)
  for (const result of results) {
    const task = result.tasks.find((t) =>
      t.description.toLowerCase().includes(identifier.toLowerCase())
    );
    if (task) {
      return { ...result, task };
    }
  }

  return null;
}

export async function initTasks(name: string, description: string, force: boolean): Promise<void> {
  const path = join(getRepoBase(), TASKS_MD);
  if (existsSync(path) && !force) {
    throw new Error('TASKS.md already exists. Use --force to overwrite.');
  }

  const projectName = name || basename(getRepoBase());
  const content = `# ${projectName}

${description}

## Goals
- [ ] Goal 1
- [ ] Goal 2

## Tasks
- [ ] Task 1
- [ ] Task 2
`;

  await writeFile(path, content, 'utf-8');
}

export async function addTask(description: string): Promise<void> {
  const parsed = await readTasks();
  if (!parsed) {
    throw new Error('No TASKS.md found. Run "tasq init" first.');
  }

  // Find where to insert (after ## Tasks or before first task)
  let insertIndex = -1;

  for (let i = 0; i < parsed.lines.length; i++) {
    const trimmed = parsed.lines[i]!.trim().toLowerCase();
    if (trimmed.startsWith('## tasks') || trimmed.startsWith('## task')) {
      insertIndex = i + 1;
      // Skip blank lines
      while (insertIndex < parsed.lines.length && parsed.lines[insertIndex]!.trim() === '') {
        insertIndex++;
      }
      // If we found existing tasks, insert after them
      while (
        insertIndex < parsed.lines.length &&
        parsed.lines[insertIndex]!.trim().startsWith('-')
      ) {
        insertIndex++;
      }
      break;
    }
  }

  if (insertIndex === -1) {
    // No Tasks section found, append to end
    parsed.lines.push('', '## Tasks', '');
    insertIndex = parsed.lines.length;
  }

  parsed.lines.splice(insertIndex, 0, `- ${STATUS_MARKERS.pending} ${description}`);
  await writeTasks(parsed);
}

export async function buildOrchestratorPrompt(
  found: Awaited<ReturnType<typeof findTaskAcrossProjects>>,
  dryRun: boolean
): Promise<string> {
  if (!found) throw new Error('Task not found');

  const { task, projectName, relPath, repoId, path: tasksPath, parsed, tasks } = found;

  // Gather context
  const tasksContent = await readFile(tasksPath, 'utf-8');
  const contextSection = parseContextSection(tasksContent);
  const projectDir = dirname(tasksPath);

  // Additional repos context
  let repoContext = '';
  for (const repoPath of contextSection.repos) {
    const resolved = resolve(projectDir, repoPath);
    const repoTasksPath = join(resolved, 'TASKS.md');
    if (existsSync(repoTasksPath)) {
      const repoTasks = readTasksSync(repoTasksPath);
      if (repoTasks) {
        repoContext += `\n// Related repo: ${basename(resolved)}\n`;
        repoContext += `// Goals: ${repoTasks.goals.map((g) => g.description).join(', ')}\n`;
        repoContext += `// Pending tasks: ${repoTasks.tasks
          .filter((t) => t.status !== 'completed')
          .map((t) => t.description)
          .join(', ')}\n`;
      }
    }
  }

  // Build project tasks context
  const projectGoals =
    parsed.goals
      .map((g) => {
        const icon = STATUS_ICONS[g.status];
        return `  ${icon} ${g.description}`;
      })
      .join('\n') || '(no goals defined)';

  const projectTasks =
    tasks
      .map((t) => {
        const icon = STATUS_ICONS[t.status as TaskStatus];
        const current = t.id === task.id ? ' ← CURRENT' : '';
        return `  ${icon} [${t.id}] ${t.description}${current}`;
      })
      .join('\n') || '(no tasks defined)';

  // Gather full context
  const localContext = await gatherFullContext(
    projectDir,
    contextSection,
    tasksPath,
    parsed,
    tasks,
    task
  );

  // Build orchestrator prompt
  return `# Task Orchestrator

You are an orchestrator agent. Your job is to complete the following task by delegating to subagents.

## Task to Complete
[${task.id}] ${task.description}

## Project Context
Name: ${projectName} (${repoId})
Path: ${relPath}

${parsed.description ? `### Project Description\n${parsed.description}\n` : ''}

${parsed.notes ? `### Project Notes\n${parsed.notes}\n` : ''}

### Project Goals
${projectGoals}

### All Project Tasks
${projectTasks}

${repoContext ? `## Related Repos\n${repoContext}\n` : ''}

## Instructions

1. **Use subagents for everything** - Use the Task tool to spawn specialized subagents for:
   - Code exploration (use Explore agent)
   - Code implementation (use general-purpose agent)
   - Testing (use test-runner agent if available)
   - Any actual work

2. **Keep your context minimal** - Don't read files directly. Ask subagents to explore and report back.

3. **Track progress** - After each subagent completes, update the task status:
   - Report what was done
   - Ask for next steps if needed

4. **When complete**, provide a summary of:
   - What was implemented
   - Files modified
   - Any remaining work

Start by exploring the codebase to understand the current state, then delegate implementation to subagents.

## Local Context Files
${localContext || '(no context files specified - add ## Context section to TASKS.md)'}
`;
}
