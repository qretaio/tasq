import { describe, it } from 'node:test';
import assert from 'node:assert';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readTasks, scanAllTasksWithIds } from './core.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, '../tests/fixtures', name), 'utf-8');
}

function getTestDir(): string {
  return join(tmpdir(), `tasq-test-${process.pid}-${Date.now()}`);
}

async function setupTestDir(files: Record<string, string>): Promise<string> {
  const dir = getTestDir();
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true });
  }
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content);
  }
  return dir;
}

async function cleanupTestDir(): Promise<void> {
  const dir = getTestDir();
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true });
  }
}

// Shared fixtures - loaded once
let fixtures: { readme: string; tasks: string } | null = null;

async function getFixtures(): Promise<{ readme: string; tasks: string }> {
  if (!fixtures) {
    fixtures = {
      readme: await loadFixture('README.md'),
      tasks: await loadFixture('TASKS.md'),
    };
  }
  return fixtures;
}

// @ts-expect-error - 'after' option exists at runtime but not in TypeScript types
describe('core: integration', { after: cleanupTestDir }, () => {
  it('readTasks: merges tasks from both TASKS.md and README.md', async () => {
    const { readme, tasks } = await getFixtures();
    const testDir = await setupTestDir({ 'TASKS.md': tasks, 'README.md': readme });

    const originalCwd = process.cwd();
    process.chdir(testDir);

    try {
      const result = await readTasks();
      assert.ok(result);
      assert.strictEqual(result.name, '@qretaio/tasq');
      // 1 goal + 1 task from TASKS.md + 1 task from README.md
      assert.strictEqual(result.tasks.length, 3);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('readTasks: returns null when no files exist', async () => {
    const testDir = await setupTestDir({});

    const originalCwd = process.cwd();
    process.chdir(testDir);

    try {
      const result = await readTasks();
      assert.strictEqual(result, null);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('scanAllTasksWithIds: scans multiple repos with mixed sources', async () => {
    const { readme } = await getFixtures();
    const baseDir = join(getTestDir(), 'projects');
    await mkdir(baseDir, { recursive: true });

    // Project 1: TASKS.md only
    await mkdir(join(baseDir, 'p1'), { recursive: true });
    await writeFile(join(baseDir, 'p1', 'TASKS.md'), `# P1\n\n## Tasks\n- [ ] Task 1`);

    // Project 2: README.md only
    await mkdir(join(baseDir, 'p2'), { recursive: true });
    await writeFile(join(baseDir, 'p2', 'README.md'), readme);

    const results = await scanAllTasksWithIds([baseDir]);

    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].tasks.length, 1);
    assert.strictEqual(results[1].tasks.length, 1);
    // README task should have context
    assert.ok(results[1].tasks[0].readmeContext);
  });
});
