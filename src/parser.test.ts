import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTasks, generateRepoIds } from './parser.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, '../tests/fixtures', name), 'utf-8');
}

describe('parser', () => {
  it('parseTasks: TASKS.md with goals and tasks', async () => {
    const tasks = await loadFixture('TASKS.md');
    const parsed = parseTasks(tasks);

    assert.strictEqual(parsed.name, '@qretaio/tasq');
    assert.strictEqual(parsed.goals.length, 1);
    assert.strictEqual(parsed.tasks.length, 2); // 1 goal + 1 task
    assert.strictEqual(parsed.tasks[0]?.description, 'Goal one');
    assert.strictEqual(parsed.tasks[1]?.description, 'Task from TASKS.md');
  });

  it('parseTasks: README.md with tasks section', async () => {
    const readme = await loadFixture('README.md');
    const parsed = parseTasks(readme);

    assert.strictEqual(parsed.name, '@qretaio/tasq');
    assert.strictEqual(parsed.description, 'A powerful task tracking CLI that uses markdown files (TASKS.md) for managing tasks across multiple projects with intelligent context gathering for AI-assisted development.');
    assert.strictEqual(parsed.notes, "Task items from this section will be processed by `tasq` cli.");
    assert.strictEqual(parsed.tasks.length, 1);
    assert.strictEqual(parsed.tasks[0]?.description, 'Create a Kanban board for task management');
  });

  it('parseTasks: README.md without tasks section returns no tasks', () => {
    const content = `# My Project

A description.

## Features
- Feature one
`;

    const parsed = parseTasks(content);
    assert.strictEqual(parsed.name, 'My Project');
    assert.strictEqual(parsed.tasks.length, 0);
  });

  it('generateRepoIds: creates unique IDs for similar names', () => {
    const ids = generateRepoIds(['foo', 'foobar', 'foobaz']);
    assert.strictEqual(ids.get('foo'), 'f');
    assert.strictEqual(ids.get('foobar'), 'fo');
    assert.strictEqual(ids.get('foobaz'), 'foo');
  });
});
