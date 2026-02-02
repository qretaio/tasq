import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { spawn } from 'node:child_process';
import { groupTasksByStatus, type TaskStatus } from './types.js';
import {
  getRepoBase,
  readTasks,
  updateTaskStatus,
  scanAllTasksWithIds,
  findTaskAcrossProjects,
  initTasks,
  addTask,
  buildOrchestratorPrompt,
} from './core.js';
import { getScanPaths, addScanPath } from './config.js';

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
  if (args.local) {
    const parsed = await readTasks();
    if (!parsed) {
      console.log('No TASKS.md found. Run "tasq init" to create one.');
      return;
    }

    console.log(`\n# ${parsed.name}`);
    if (parsed.description) {
      console.log(`${parsed.description}\n`);
    }

    const { pending, inProgress, completed } = groupTasksByStatus(parsed.goals);

    if (pending.length > 0) {
      console.log('## Goals');
      for (const goal of pending) {
        console.log(`  ○ ${goal.description}`);
      }
      console.log();
    }

    if (inProgress.length > 0) {
      console.log('## Goals (In Progress)');
      for (const goal of inProgress) {
        console.log(`  → ${goal.description}`);
      }
      console.log();
    }

    const tasks = groupTasksByStatus(parsed.tasks);

    if (tasks.pending.length > 0) {
      console.log('## Pending');
      for (const task of tasks.pending) {
        const goal = task.goal ? ` (${task.goal})` : '';
        console.log(`  ○ ${task.description}${goal}`);
      }
      console.log();
    }

    if (tasks.inProgress.length > 0) {
      console.log('## In Progress');
      for (const task of tasks.inProgress) {
        console.log(`  → ${task.description}`);
      }
      console.log();
    }

    if (tasks.completed.length > 0 && !args.pending) {
      console.log('## Completed');
      for (const task of tasks.completed) {
        console.log(`  ✓ ${task.description}`);
      }
      console.log();
    }

    console.log(
      `  ${tasks.pending.length} pending, ${tasks.inProgress.length} in progress, ${tasks.completed.length} completed\n`
    );
    return;
  }

  const scanPaths = getScanPaths();
  const results = await scanAllTasksWithIds(scanPaths);

  if (results.length === 0) {
    console.log('No TASKS.md files found.');
    console.log('Run "tasq config add-path <path>" to add scan paths.');
    return;
  }

  let totalPending = 0;
  let totalInProgress = 0;
  let totalCompleted = 0;

  for (const { projectName, relPath, repoId, tasks } of results) {
    const grouped = groupTasksByStatus(tasks);

    totalPending += grouped.pending.length;
    totalInProgress += grouped.inProgress.length;
    totalCompleted += grouped.completed.length;

    if (grouped.pending.length > 0 || grouped.inProgress.length > 0 || args.all) {
      console.log(`\n## ${projectName} (${repoId}) ${relPath}`);

      const activeTasks = tasks.filter((t) => t.status !== 'completed');
      for (const task of activeTasks.slice(0, args.all ? undefined : 5)) {
        console.log(
          `    ${task.status === 'pending' ? '○' : '→'} [${task.id}] ${task.description}`
        );
      }
      if (!args.all && activeTasks.length > 5) {
        console.log(`    ... and ${activeTasks.length - 5} more`);
      }

      console.log(
        `  ${grouped.pending.length} pending, ${grouped.inProgress.length} in progress, ${grouped.completed.length} completed`
      );
    }
  }

  console.log(
    `\n${results.length} project(s) • ${totalPending} pending • ${totalInProgress} in progress • ${totalCompleted} completed\n`
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
  const parsed = await readTasks();
  if (!parsed) {
    console.error('No TASKS.md found.');
    process.exit(1);
  }

  const identifier = args.identifier;
  if (!identifier) {
    console.error(`Usage: tasq ${args.command} <id>`);
    console.error('  id: task number or description substring');
    process.exit(1);
  }

  const newStatus: TaskStatus = args.command === 'done' ? 'completed' : 'in-progress';

  let taskIndex = -1;
  const num = Number.parseInt(identifier, 10);
  if (!Number.isNaN(num)) {
    const taskList = parsed.tasks.filter((t) => t.status !== 'completed');
    if (num > 0 && num <= taskList.length) {
      taskIndex = taskList[num - 1]!.line;
    }
  }

  if (taskIndex === -1) {
    const task = parsed.tasks.find((t) =>
      t.description.toLowerCase().includes(identifier.toLowerCase())
    );
    if (task) taskIndex = task.line;
  }

  if (taskIndex === -1) {
    console.error(`Task "${identifier}" not found.`);
    process.exit(1);
  }

  await updateTaskStatus(taskIndex, newStatus);

  const line = parsed.lines[taskIndex]!;
  const match = line.match(/^\-\s*\[([x~ ]?)\]\s*(.*)/);
  const desc = match ? match[2] : '';

  console.log(`${desc}: ${newStatus}`);
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
