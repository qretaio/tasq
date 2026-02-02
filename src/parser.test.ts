import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseTasks, parseContextSection, generateRepoIds } from './parser.js';

describe('parser', () => {
  const content = `# My Project
This is a description
Second line

## Context
files: src/foo.ts, src/bar.ts
repos: github.com/foo, github.com/bar

## Goals
- [ ] Goal one
- [x] Goal two completed

## Tasks
Some notes here
- [ ] Pending task
- [~] In-progress task
- [x] Completed task
`;

  const parsed = parseTasks(content);
  const context = parseContextSection(content);
  const repoIds = generateRepoIds(['foo', 'bar', 'baz']);

  it('parseTasks: name and description', () => {
    assert.strictEqual(parsed.name, 'My Project');
    assert.strictEqual(parsed.description, 'This is a description\nSecond line');
  });

  it('parseTasks: notes before first task', () => {
    assert.strictEqual(parsed.notes, '');
  });

  it('parseTasks: goals', () => {
    assert.strictEqual(parsed.goals.length, 2);
    assert.strictEqual(parsed.goals[0].description, 'Goal one');
    assert.strictEqual(parsed.goals[0].status, 'pending');
    assert.strictEqual(parsed.goals[1].description, 'Goal two completed');
    assert.strictEqual(parsed.goals[1].status, 'completed');
  });

  it('parseTasks: tasks with all statuses', () => {
    assert.strictEqual(parsed.tasks.length, 3);
    assert.strictEqual(parsed.tasks[0].description, 'Pending task');
    assert.strictEqual(parsed.tasks[0].status, 'pending');
    assert.strictEqual(parsed.tasks[1].description, 'In-progress task');
    assert.strictEqual(parsed.tasks[1].status, 'in-progress');
    assert.strictEqual(parsed.tasks[2].description, 'Completed task');
    assert.strictEqual(parsed.tasks[2].status, 'completed');
  });

  it('parseTasks: line numbers', () => {
    assert.strictEqual(parsed.tasks[0].line, 14);
    assert.strictEqual(parsed.tasks[1].line, 15);
    assert.strictEqual(parsed.tasks[2].line, 16);
  });

  it('parseContextSection: files and repos', () => {
    assert.deepStrictEqual(context.files, ['src/foo.ts', 'src/bar.ts']);
    assert.deepStrictEqual(context.repos, ['github.com/foo', 'github.com/bar']);
  });

  it('generateRepoIds: unique ids', () => {
    assert.strictEqual(repoIds.get('foo'), 'f');
    assert.strictEqual(repoIds.get('bar'), 'b');
    assert.strictEqual(repoIds.get('baz'), 'ba');
  });

  it('generateRepoIds: case insensitivity', () => {
    const result = generateRepoIds(['Foo', 'foo']);
    assert.strictEqual(result.get('Foo'), 'f');
    assert.strictEqual(result.get('foo'), 'fo');
  });
});
