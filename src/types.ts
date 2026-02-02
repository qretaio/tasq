export type TaskStatus = 'pending' | 'in-progress' | 'completed';

export interface Task {
  line: number;
  status: TaskStatus;
  description: string;
  goal?: string;
  id?: string;
  section?: string;
}

export interface ParsedTasks {
  name: string;
  description: string;
  notes: string;
  goals: Task[];
  tasks: Task[];
  lines: string[];
}

export interface ContextSection {
  files: string[];
  repos: string[];
}

export interface ProjectResult {
  path: string;
  projectName: string;
  relPath: string;
  parsed: ParsedTasks;
  tasks: Task[];
}

export interface Config {
  scan_paths: string[];
}

const STATUS_CONFIG = {
  pending: { marker: '[ ]', icon: '○', chars: ['', ' '] },
  'in-progress': { marker: '[~]', icon: '→', chars: ['~'] },
  completed: { marker: '[x]', icon: '✓', chars: ['x', 'X'] },
} as const;

export const STATUS_MAP: Record<string, TaskStatus> = Object.fromEntries(
  Object.entries(STATUS_CONFIG).flatMap(([status, config]) => config.chars.map((c) => [c, status]))
) as Record<string, TaskStatus>;

export const STATUS_MARKERS: Record<TaskStatus, string> = Object.fromEntries(
  Object.entries(STATUS_CONFIG).map(([status, { marker }]) => [status, marker])
) as Record<TaskStatus, string>;

export const STATUS_ICONS: Record<TaskStatus, string> = Object.fromEntries(
  Object.entries(STATUS_CONFIG).map(([status, { icon }]) => [status, icon])
) as Record<TaskStatus, string>;

export function groupTasksByStatus(tasks: Task[]) {
  return {
    pending: tasks.filter((t) => t.status === 'pending'),
    inProgress: tasks.filter((t) => t.status === 'in-progress'),
    completed: tasks.filter((t) => t.status === 'completed'),
  };
}
