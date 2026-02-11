import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanAllTasksWithIds, updateTaskStatusInFile, readTasksSync } from './core.js';
import { parseTasks, generateRepoIds } from './parser.js';

// Note: No trailing newlines to avoid empty line parsing issues
const testFixtures = {
  projectA: `# Project Alpha

Alpha project description

## Goals
- [ ] Goal A1
- [x] Goal A2

## Tasks
- [ ] Task A1
- [ ] Task A2
- [~] Task A3`,
  projectB: `# Beta

Beta project

## Tasks
- [ ] Task B1
- [ ] Task B2
- [x] Task B3`,
  projectC: `# Charlie

Charlie project

## Tasks
- [ ] Task C1
- [ ] Task C2`,
};

async function createTestProject(name: string, content: string, baseDir: string): Promise<string> {
  const projectDir = join(baseDir, name);
  await mkdir(projectDir, { recursive: true });
  const tasksPath = join(projectDir, 'TASKS.md');
  await writeFile(tasksPath, content, 'utf-8');
  return projectDir;
}

describe('Task Finding', () => {
  let testDir: string;
  let scanResults: Awaited<ReturnType<typeof scanAllTasksWithIds>>;

  before(async () => {
    testDir = join(tmpdir(), `tasq-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    await createTestProject('project-alpha', testFixtures.projectA, testDir);
    await createTestProject('project-beta', testFixtures.projectB, testDir);
    await createTestProject('charlie', testFixtures.projectC, testDir);

    // Pre-scan for use in tests
    scanResults = await scanAllTasksWithIds([testDir]);
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('generateRepoIds', () => {
    it('should generate unique single-letter IDs for projects with different first letters', () => {
      const names = ['alpha', 'beta', 'charlie'];
      const ids = generateRepoIds(names);

      assert.strictEqual(ids.get('alpha'), 'a');
      assert.strictEqual(ids.get('beta'), 'b');
      assert.strictEqual(ids.get('charlie'), 'c');
    });

    it('should generate unique multi-letter IDs when first letters collide', () => {
      const names = ['alpha', 'apple', 'apricot'];
      const ids = generateRepoIds(names);

      assert.strictEqual(ids.get('alpha'), 'a');
      assert.strictEqual(ids.get('apple'), 'ap');
      assert.strictEqual(ids.get('apricot'), 'apr');
    });

    it('should handle mixed case project names', () => {
      const names = ['Alpha', 'BETA', 'Charlie'];
      const ids = generateRepoIds(names);

      assert.strictEqual(ids.get('Alpha'), 'a');
      assert.strictEqual(ids.get('BETA'), 'b');
      assert.strictEqual(ids.get('Charlie'), 'c');
    });

    it('should handle single character project names', () => {
      const names = ['a', 'aa', 'aaa'];
      const ids = generateRepoIds(names);

      assert.strictEqual(ids.get('a'), 'a');
      assert.strictEqual(ids.get('aa'), 'aa');
      assert.strictEqual(ids.get('aaa'), 'aaa');
    });

    it('should handle project-alpha, project-beta, charlie correctly', () => {
      const names = ['project-alpha', 'project-beta', 'charlie'];
      const ids = generateRepoIds(names);

      // project-alpha gets 'p' (first)
      // project-beta gets 'pr' (second 'p' word, needs disambiguation)
      // charlie gets 'c'
      assert.strictEqual(ids.get('project-alpha'), 'p');
      assert.strictEqual(ids.get('project-beta'), 'pr');
      assert.strictEqual(ids.get('charlie'), 'c');
    });
  });

  describe('scanAllTasksWithIds - Global scope', () => {
    it('should scan all projects and assign global IDs', () => {
      assert.strictEqual(scanResults.length, 3);

      const alpha = scanResults.find((r) => r.projectName === 'project-alpha');
      const beta = scanResults.find((r) => r.projectName === 'project-beta');
      const charlie = scanResults.find((r) => r.projectName === 'charlie');

      assert.ok(alpha);
      assert.ok(beta);
      assert.ok(charlie);

      // Check repo IDs (p for project-alpha, pr for project-beta, c for charlie)
      assert.strictEqual(alpha?.repoId, 'p');
      assert.strictEqual(beta?.repoId, 'pr');
      assert.strictEqual(charlie?.repoId, 'c');
    });

    it('should assign sequential task IDs within each project', () => {
      const alpha = scanResults.find((r) => r.projectName === 'project-alpha');
      assert.ok(alpha);

      // project-alpha has 5 tasks (2 goals + 3 tasks): p1-p5
      // Goals are included in the tasks array
      assert.strictEqual(alpha?.tasks[0]?.id, 'p1');
      assert.strictEqual(alpha?.tasks[1]?.id, 'p2');
      assert.strictEqual(alpha?.tasks[2]?.id, 'p3');

      const beta = scanResults.find((r) => r.projectName === 'project-beta');
      assert.ok(beta);

      // project-beta has 3 tasks: pr1, pr2, pr3
      assert.strictEqual(beta?.tasks[0]?.id, 'pr1');
      assert.strictEqual(beta?.tasks[1]?.id, 'pr2');
      assert.strictEqual(beta?.tasks[2]?.id, 'pr3');
    });

    it('should include all task metadata', () => {
      const alpha = scanResults.find((r) => r.projectName === 'project-alpha');
      assert.ok(alpha);

      // First task is Goal A1 (goals are included in tasks array)
      assert.strictEqual(alpha?.tasks[0]?.description, 'Goal A1');
      assert.strictEqual(alpha?.tasks[0]?.status, 'pending');
      assert.strictEqual(alpha?.tasks[0]?.section, 'goals');

      // Third task is Task A1 (after 2 goals)
      assert.strictEqual(alpha?.tasks[2]?.description, 'Task A1');
      assert.strictEqual(alpha?.tasks[2]?.status, 'pending');
      assert.strictEqual(alpha?.tasks[2]?.section, 'tasks');

      // Last task is Task A3
      assert.strictEqual(alpha?.tasks[4]?.description, 'Task A3');
      assert.strictEqual(alpha?.tasks[4]?.status, 'in-progress');
    });
  });

  describe('Global task lookup using scanResults', () => {
    it('should find task by compact ID format', () => {
      // p3 is Task A1 (p1=Goal A1, p2=Goal A2, p3=Task A1)
      const alpha = scanResults.find((r) => r.projectName === 'project-alpha');
      assert.ok(alpha);

      const task = alpha?.tasks.find((t) => t.id === 'p3');
      assert.ok(task);
      assert.strictEqual(task.description, 'Task A1');
    });

    it('should find task by compact ID in different project', () => {
      const beta = scanResults.find((r) => r.projectName === 'project-beta');
      assert.ok(beta);

      const task = beta?.tasks.find((t) => t.id === 'pr2');
      assert.ok(task);
      assert.strictEqual(task.description, 'Task B2');
    });

    it('should find task by description substring across projects', () => {
      let found: {
        task: (typeof scanResults)[0]['tasks'][0];
        project: (typeof scanResults)[0];
      } | null = null;

      for (const project of scanResults) {
        const task = project.tasks.find((t) =>
          t.description.toLowerCase().includes('A3'.toLowerCase())
        );
        if (task) {
          found = { task, project };
          break;
        }
      }

      assert.ok(found);
      assert.strictEqual(found?.task.description, 'Task A3');
      assert.strictEqual(found?.project.repoId, 'p');
    });

    it('should handle non-existent compact ID', () => {
      let found = false;
      for (const project of scanResults) {
        if (project.tasks.some((t) => t.id === 'z99')) {
          found = true;
          break;
        }
      }
      assert.strictEqual(found, false);
    });
  });

  describe('updateTaskStatusInFile', () => {
    it('should update task status in a file', async () => {
      const testFile = join(testDir, 'test-update.md');
      await writeFile(testFile, '# Test\n\n## Tasks\n- [ ] Task 1\n- [ ] Task 2', 'utf-8');

      // Line 3 is the first task "- [ ] Task 1"
      await updateTaskStatusInFile(testFile, 3, 'in-progress');

      const updated = readTasksSync(testFile);
      assert.ok(updated);
      assert.strictEqual(updated.tasks[0]?.status, 'in-progress');
      assert.strictEqual(updated.tasks[1]?.status, 'pending');
    });

    it('should update task to completed', async () => {
      const testFile = join(testDir, 'test-update-complete.md');
      await writeFile(testFile, '# Test\n\n## Tasks\n- [ ] Task 1\n- [~] Task 2', 'utf-8');

      // Line 4 is the second task "- [~] Task 2"
      await updateTaskStatusInFile(testFile, 4, 'completed');

      const updated = readTasksSync(testFile);
      assert.ok(updated);
      assert.strictEqual(updated.tasks[0]?.status, 'pending');
      assert.strictEqual(updated.tasks[1]?.status, 'completed');
    });
  });

  describe('Local scope task finding (via parseTasks)', () => {
    it('should parse tasks from content with line numbers', () => {
      const content = `# Test

## Tasks
- [ ] Task one
- [~] Task two
- [x] Task three`;

      const parsed = parseTasks(content);

      assert.strictEqual(parsed.tasks.length, 3);
      assert.strictEqual(parsed.tasks[0]?.description, 'Task one');
      assert.strictEqual(parsed.tasks[0]?.line, 3);
      assert.strictEqual(parsed.tasks[1]?.status, 'in-progress');
      assert.strictEqual(parsed.tasks[2]?.status, 'completed');
    });

    it('should extract goals separately', () => {
      const content = `# Test

## Goals
- [ ] Goal 1
- [ ] Goal 2

## Tasks
- [ ] Task 1`;

      const parsed = parseTasks(content);

      assert.strictEqual(parsed.goals.length, 2);
      assert.strictEqual(parsed.goals[0]?.description, 'Goal 1');
      assert.strictEqual(parsed.tasks.length, 3); // goals + tasks
    });

    it('should handle task sections', () => {
      const content = `# Test

## Tasks
- [ ] Task one
- [ ] Task two`;

      const parsed = parseTasks(content);

      assert.strictEqual(parsed.tasks.length, 2);
      assert.strictEqual(parsed.tasks[0]?.section, 'tasks');
      assert.strictEqual(parsed.tasks[1]?.section, 'tasks');
    });

    it('should track section for goals', () => {
      const content = `# Test

## Goals
- [ ] Goal 1

## Tasks
- [ ] Task 1`;

      const parsed = parseTasks(content);

      assert.strictEqual(parsed.tasks[0]?.section, 'goals');
      assert.strictEqual(parsed.tasks[1]?.section, 'tasks');
    });
  });
});
