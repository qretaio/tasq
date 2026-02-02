import {
  STATUS_MAP,
  type ParsedTasks,
  type Task,
  type TaskStatus,
  type ContextSection,
} from './types.js';

export function parseTasks(content: string): ParsedTasks {
  const lines = content.split('\n');
  const result: ParsedTasks = {
    name: '',
    description: '',
    notes: '',
    goals: [],
    tasks: [],
    lines: [...lines],
  };

  let currentSection: string | null = null;
  let inTasks = false;
  let foundFirstTask = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('# ')) {
      result.name = trimmed.replace(/^#\s+/, '');
      currentSection = 'header';
    } else if (trimmed.startsWith('## ')) {
      const section = trimmed.replace(/^##\s+/, '').toLowerCase();
      currentSection = section;
      inTasks = section === 'tasks';
    } else if (trimmed.startsWith('- ')) {
      const match = trimmed.match(/^\-\s*\[([x~ ]?)\]\s*(.*)/);
      if (match) {
        const status = STATUS_MAP[match[1]] || 'pending';
        const description = match[2].trim();
        const task: Task = { line: i, status, description };

        foundFirstTask = true;

        // All sections contribute to tasks, not just ## Tasks
        // But goals are also kept separately for backward compatibility
        if (currentSection === 'goals') {
          result.goals.push(task);
        }
        task.section =
          currentSection === 'header' || currentSection === null ? undefined : currentSection;
        result.tasks.push(task);
      }
    } else if (currentSection === 'header' && line && !line.startsWith('#')) {
      result.description += (result.description ? '\n' : '') + line;
    } else if (inTasks && !foundFirstTask && line && !line.startsWith('#')) {
      result.notes += (result.notes ? '\n' : '') + line;
    }
  }

  return result;
}

export function parseContextSection(content: string): ContextSection {
  const lines = content.split('\n');
  const context: ContextSection = { files: [], repos: [] };
  let inContext = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase() === '## context') {
      inContext = true;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      inContext = false;
      continue;
    }
    if (!inContext) continue;

    if (trimmed.toLowerCase().startsWith('files:')) {
      context.files.push(
        ...trimmed
          .substring(6)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
    }
    if (trimmed.toLowerCase().startsWith('repos:')) {
      context.repos.push(
        ...trimmed
          .substring(6)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
    }
  }

  return context;
}

export function generateRepoIds(projectNames: string[]): Map<string, string> {
  const ids = new Map<string, string>();
  const used = new Set<string>();

  for (const name of projectNames) {
    let id = name.charAt(0).toLowerCase();
    let len = 1;

    while (used.has(id)) {
      len++;
      id = name.toLowerCase().slice(0, len);
    }

    ids.set(name, id);
    used.add(id);
  }

  return ids;
}

export function parseTasksSection(content: string): ParsedTasks {
  const lines = content.split('\n');
  const result: ParsedTasks = {
    name: '',
    description: '',
    notes: '',
    goals: [],
    tasks: [],
    lines: [],
  };

  let inTasks = false;
  let lineOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.toLowerCase().startsWith('## tasks')) {
      inTasks = true;
      lineOffset = i;
      continue;
    }

    if (inTasks && trimmed.startsWith('## ')) {
      // End of tasks section
      break;
    }

    if (!inTasks) continue;

    result.lines.push(line);

    if (trimmed.startsWith('- ')) {
      const match = trimmed.match(/^\-\s*\[([x~ ]?)\]\s*(.*)/);
      if (match) {
        const status = STATUS_MAP[match[1]] || 'pending';
        const description = match[2].trim();
        result.tasks.push({
          line: i - lineOffset,
          status,
          description,
          section: 'tasks',
        });
      }
    }
  }

  return result;
}
