import { basename, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { groupTasksByStatus, type TaskStatus, type Task } from './types.js';
import {
  getRepoBase,
  readTasks,
  updateTaskStatus,
  updateTaskStatusInFile,
  scanAllTasksWithIds,
  findTaskAcrossProjects,
  initTasks,
  addTask,
  buildOrchestratorPrompt,
} from './core.js';
import { getScanPaths, addScanPath } from './config.js';

interface RenderOptions {
  showCompleted?: boolean;
  maxItems?: number;
  getId?: (task: Task) => string;
}

function renderTasksGrouped(
  tasks: Task[],
  options: RenderOptions = {}
): { pending: number; inProgress: number; completed: number } {
  const { showCompleted = true, maxItems, getId } = options;

  // Group by section
  const tasksBySection = new Map<string, Task[]>();
  for (const task of tasks) {
    const section = task.section || 'other';
    if (!tasksBySection.has(section)) {
      tasksBySection.set(section, []);
    }
    tasksBySection.get(section)!.push(task);
  }

  let totalPending = 0;
  let totalInProgress = 0;
  let totalCompleted = 0;

  // Display each section
  for (const [section, sectionTasks] of tasksBySection) {
    const grouped = groupTasksByStatus(sectionTasks);
    totalPending += grouped.pending.length;
    totalInProgress += grouped.inProgress.length;
    totalCompleted += grouped.completed.length;

    // Skip if only completed and not showing all
    if (grouped.pending.length === 0 && grouped.inProgress.length === 0 && !showCompleted) {
      continue;
    }

    // Special handling for 'readme' section
    if (section === 'readme') {
      console.log(`# README`);
      // Get readmeContext from the first task (all readme tasks share the same context)
      const readmeContext = sectionTasks[0]?.readmeContext;
      if (readmeContext?.description) {
        console.log(`${readmeContext.description}`);
      }
      console.log();
      console.log(`## Tasks`);
      if (readmeContext?.tasksDescription) {
        console.log(`${readmeContext.tasksDescription}`);
      }
      console.log();
    } else {
      const sectionTitle = section.charAt(0).toUpperCase() + section.slice(1);
      console.log(`## ${sectionTitle}`);
    }

    const activeTasks = [...grouped.pending, ...grouped.inProgress];
    const toShow = maxItems !== undefined ? activeTasks.slice(0, maxItems) : activeTasks;

    for (const task of toShow) {
      const icon = task.status === 'pending' ? '○' : task.status === 'in-progress' ? '→' : '✓';
      const id = getId ? `[${getId(task)}] ` : '';
      console.log(`  ${icon} ${id}${task.description}`);
    }

    if (maxItems !== undefined && activeTasks.length > maxItems) {
      console.log(`  ... and ${activeTasks.length - maxItems} more`);
    }

    if (showCompleted && grouped.completed.length > 0) {
      for (const task of grouped.completed) {
        const id = getId ? `[${getId(task)}] ` : '';
        console.log(`  ✓ ${id}${task.description}`);
      }
    }

    console.log();
  }

  return { pending: totalPending, inProgress: totalInProgress, completed: totalCompleted };
}

export async function cmdInit(args: {
  name?: string;
  description?: string;
  force?: boolean;
}): Promise<void> {
  try {
    const name = args.name || basename(getRepoBase());
    const description = args.description || '';
    const force = args.force || false;

    await initTasks(name, description, force);
    console.log(`Created TASKS.md`);
  } catch (e) {
    if (e instanceof Error) {
      console.error(e.message);
    }
    process.exit(1);
  }
}

export async function cmdList(args: {
  local?: boolean;
  pending?: boolean;
  all?: boolean;
}): Promise<void> {
  const scanPaths = getScanPaths();
  const results = await scanAllTasksWithIds(scanPaths);

  if (results.length === 0) {
    console.log('No TASKS.md files found.');
    console.log('Run "tasq config add-path <path>" to add scan paths.');
    return;
  }

  // Filter for local project if requested
  const filteredResults = args.local
    ? results.filter((r) => {
        const projectDir = dirname(r.path);
        return projectDir === getRepoBase();
      })
    : results;

  if (filteredResults.length === 0) {
    console.log('No TASKS.md found for this project.');
    return;
  }

  if (results.length === 0) {
    console.log('No TASKS.md files found.');
    console.log('Run "tasq config add-path <path>" to add scan paths.');
    return;
  }

  // Global mode: show all projects
  let totalPending = 0;
  let totalInProgress = 0;
  let totalCompleted = 0;

  for (const { projectName, relPath, repoId, tasks } of filteredResults) {
    const grouped = groupTasksByStatus(tasks);

    totalPending += grouped.pending.length;
    totalInProgress += grouped.inProgress.length;
    totalCompleted += grouped.completed.length;

    if (grouped.pending.length > 0 || grouped.inProgress.length > 0 || args.all) {
      console.log(`\n## ${projectName} (${repoId}) ${relPath}`);

      // Indent section rendering for nested display
      const originalLog = console.log;
      console.log = (...args: unknown[]) => originalLog('  ', ...args);

      renderTasksGrouped(tasks, {
        showCompleted: args.all ?? false,
        maxItems: args.all ? undefined : 5,
        getId: (t) => t.id!,
      });

      console.log = originalLog;

      console.log(
        `  ${grouped.pending.length} pending, ${grouped.inProgress.length} in progress, ${grouped.completed.length} completed`
      );
    }
  }

  console.log(
    `\n${filteredResults.length} project(s) • ${totalPending} pending • ${totalInProgress} in progress • ${totalCompleted} completed\n`
  );
}

export async function cmdAdd(args: { description?: string }): Promise<void> {
  try {
    const description = args.description;
    if (!description) {
      console.error('Description is required.');
      process.exit(1);
    }

    await addTask(description);
    console.log(`Added: ${description}`);
  } catch (e) {
    if (e instanceof Error) {
      console.error(e.message);
    }
    process.exit(1);
  }
}

export async function cmdStatus(args: {
  command: 'done' | 'wip';
  identifier?: string;
}): Promise<void> {
  const identifier = args.identifier;
  if (!identifier) {
    console.error(`Usage: tasq ${args.command} <task-id>`);
    console.error('  task-id: compact ID (e.g., p1, u2) or description substring');
    process.exit(1);
  }

  const found = await findTaskAcrossProjects(identifier);
  if (!found) {
    console.error(`Task "${identifier}" not found.`);
    process.exit(1);
  }

  const newStatus: TaskStatus = args.command === 'done' ? 'completed' : 'in-progress';

  await updateTaskStatusInFile(found.path, found.task.line, newStatus);

  console.log(`[${found.task.id}] ${found.task.description}: ${newStatus}`);
}

export async function cmdConfig(args: { action: string; path?: string }): Promise<void> {
  switch (args.action || 'show') {
    case 'show': {
      const paths = getScanPaths();
      console.log('\n# Tasks Config\n');
      console.log('Scan paths:');
      for (const p of paths) {
        console.log(`  - ${p}`);
      }
      console.log();
      break;
    }

    case 'add-path': {
      const path = args.path;
      if (!path) {
        console.error('Usage: tasq config add-path <path>');
        process.exit(1);
      }
      addScanPath(path);
      console.log(`Added scan path: ${path}`);
      break;
    }

    default:
      console.error('Unknown action. Use: show, add-path');
  }
}

export async function cmdDo(args: { identifier?: string; dry?: boolean }): Promise<void> {
  const identifier = args.identifier;
  if (!identifier) {
    console.error('Usage: tasq do <task-id>');
    console.error('  task-id: compact ID (e.g., p1, u2) or description substring');
    process.exit(1);
  }

  const found = await findTaskAcrossProjects(identifier);
  if (!found) {
    console.error(`Task "${identifier}" not found.`);
    process.exit(1);
  }

  const prompt = await buildOrchestratorPrompt(found, args.dry || false);

  if (args.dry) {
    console.log(prompt);
    return;
  }

  const child = spawn('claude', [], {
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  child.stdin.write(prompt);
  child.stdin.end();

  child.on('close', (code) => {
    if (code !== 0) {
      console.error(`Claude exited with code ${code}`);
    }
  });
}

export async function cmdWatch(args: { directory?: string }): Promise<void> {
  const directory = args.directory;
  if (!directory) {
    console.error('Usage: tasq watch <directory>');
    console.error('  directory: Path to directory to watch for tasks');
    process.exit(1);
  }

  addScanPath(directory);
  console.log(`Added scan path: ${directory}`);
}
