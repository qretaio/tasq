import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import fg from 'fast-glob';
import type { ContextSection } from './types.js';
import { parseTasks } from './parser.js';
import { gatherGitContext } from './git.js';

const GLOB_IGNORE = [
  '**/node_modules/**',
  '**/target/**',
  '**/dist/**',
  '**/.git/**',
  '**/build/**',
  '**/*.cache/**',
] as const;

const GLOB_OPTIONS = {
  absolute: true,
  onlyFiles: true,
} as const;

const PROJECT_CHECKS = [
  ['deno', ['deno.json', 'deno.jsonc', 'import_map.json']],
  ['typescript', ['tsconfig.json']],
  ['rust', ['Cargo.toml']],
  ['python', ['pyproject.toml', 'requirements.txt', 'setup.py']],
  ['go', ['go.mod']],
  ['ruby', ['Gemfile']],
  ['java', ['pom.xml', 'build.gradle']],
  ['javascript', ['package.json']],
] as const;

const TEST_PATTERNS = [
  '**/*.test.ts',
  '**/*.test.js',
  '**/*.test.py',
  '**/*_test.ts',
  '**/*_test.js',
  '**/*_test.py',
  '**/*.spec.ts',
  '**/*.spec.js',
  '**/*.spec.py',
  '**/tests/**/*.ts',
  '**/tests/**/*.js',
  '**/tests/**/*.py',
  '**/__tests__/**/*',
  '**/test/**/*',
] as const;

const SOURCE_PATTERNS = [
  '**/*.ts',
  '**/*.js',
  '**/*.py',
  '**/*.rs',
  '**/*.go',
  '**/*.java',
] as const;

const DOC_PATTERNS = [
  'docs/**/*.md',
  '*.md',
  '**/CONTRIBUTING.md',
  '**/CHANGELOG.md',
  '**/ARCHITECTURE.md',
  '**/DESIGN.md',
  '**/API.md',
  '**/GUIDE.md',
  '**/.github/**/*.md',
] as const;

async function tryReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

async function findFiles(
  baseDir: string,
  patterns: readonly string[],
  options?: { maxResults?: number; deep?: number; ignore?: readonly string[] }
): Promise<string[]> {
  const files: string[] = [];
  const opts = {
    ...GLOB_OPTIONS,
    deep: options?.deep ?? 5,
    ignore: (options?.ignore ?? GLOB_IGNORE) as string[],
  };

  for (const pattern of patterns.slice(0, 10)) {
    try {
      const matches = await fg(join(baseDir, pattern), opts);
      files.push(...matches);
    } catch {
      // Skip failed patterns
    }
  }

  return [...new Set(files)].slice(0, options?.maxResults);
}

export async function gatherContextFiles(baseDir: string, patterns: string[]): Promise<string[]> {
  return findFiles(baseDir, patterns, { ignore: GLOB_IGNORE.slice(0, 4) });
}

export function detectProjectType(baseDir: string): string {
  for (const [lang, files] of PROJECT_CHECKS) {
    if (files.some((f) => existsSync(join(baseDir, f)))) {
      return lang;
    }
  }
  return 'unknown';
}

function extractTomlSection(content: string, sectionHeaders: string[]): string[] {
  const lines = content.split('\n');
  const result: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (sectionHeaders.some((h) => trimmed.startsWith(h))) {
      inSection = true;
      result.push(trimmed);
      continue;
    }
    if (trimmed.startsWith('[')) {
      inSection = false;
      continue;
    }
    if (inSection && trimmed) {
      result.push(line);
    }
  }

  return result;
}

export async function gatherDependencyInfo(baseDir: string): Promise<string> {
  const deps: string[] = [];
  const packageJsonPath = join(baseDir, 'package.json');

  if (existsSync(packageJsonPath)) {
    const content = await tryReadFile(packageJsonPath);
    if (content) {
      try {
        const pkg = JSON.parse(content);
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.peerDependencies,
        };
        if (Object.keys(allDeps).length > 0) {
          deps.push(`// npm dependencies:\n${JSON.stringify(allDeps, null, 2)}`);
        }
        if (pkg.scripts && Object.keys(pkg.scripts).length > 0) {
          deps.push(`// npm scripts:\n${JSON.stringify(pkg.scripts, null, 2)}`);
        }
      } catch {
        // Skip invalid package.json
      }
    }
  }

  const cargoPath = join(baseDir, 'Cargo.toml');
  if (existsSync(cargoPath)) {
    const content = await tryReadFile(cargoPath);
    if (content) {
      const depLines = extractTomlSection(content, ['[dependencies]', '[dev-dependencies]']);
      if (depLines.length > 0) {
        deps.push(`// Cargo dependencies:\n${depLines.join('\n')}`);
      }
    }
  }

  const pyprojectPath = join(baseDir, 'pyproject.toml');
  if (existsSync(pyprojectPath)) {
    const content = await tryReadFile(pyprojectPath);
    if (content) {
      const depLines = extractTomlSection(content, [
        'dependencies = ',
        '[project.optional-dependencies]',
      ]);
      if (depLines.length > 0) {
        deps.push(`// Python dependencies:\n${depLines.join('\n')}`);
      }
    }
  }

  const requirementsPath = join(baseDir, 'requirements.txt');
  if (existsSync(requirementsPath)) {
    const content = await tryReadFile(requirementsPath);
    if (content) {
      deps.push(`// requirements.txt:\n${content}`);
    }
  }

  return deps.join('\n\n');
}

export async function findTestFiles(baseDir: string): Promise<string[]> {
  return findFiles(baseDir, TEST_PATTERNS, { maxResults: 5, deep: 4 });
}

export async function findTodoComments(baseDir: string): Promise<string[]> {
  const sourceFiles = await findFiles(baseDir, SOURCE_PATTERNS, {
    maxResults: 10,
    deep: 3,
    ignore: GLOB_IGNORE.slice(0, 5),
  });

  const todos: string[] = [];
  const todoRegex = /(TODO|FIXME|HACK|XXX|NOTE):?\s*(.*)/i;

  for (const file of sourceFiles) {
    const content = await tryReadFile(file);
    if (content) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i]!.match(todoRegex);
        if (match) {
          const relPath = file.replace(baseDir, '').replace(/^\//, '');
          todos.push(`  ${relPath}:${i + 1}: ${match[1]}: ${match[2]!.trim()}`);
        }
      }
    }
    if (todos.length >= 10) break;
  }

  return todos;
}

export async function findDocumentationFiles(baseDir: string): Promise<string[]> {
  return findFiles(baseDir, DOC_PATTERNS, {
    maxResults: 3,
    deep: 3,
    ignore: [...GLOB_IGNORE, '**/README.md'],
  });
}

export async function summarizeDirectoryStructure(baseDir: string): Promise<string> {
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    const filtered: string[] = [];

    for (const entry of entries) {
      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === 'target' ||
        entry.name === 'dist' ||
        entry.name === 'build'
      ) {
        continue;
      }
      filtered.push(`${entry.name}${entry.isDirectory() ? '/' : ''}`);
    }

    return filtered.sort().join('  ');
  } catch {
    return '';
  }
}

async function gatherConfigFiles(baseDir: string): Promise<string> {
  const configFiles = [
    '.gitignore',
    'tsconfig.json',
    '.eslintrc',
    '.eslintrc.js',
    '.eslintrc.json',
    'prettier.config.js',
    '.prettierrc',
    'pyproject.toml',
    'setup.py',
    'pytest.ini',
    'Makefile',
    'justfile',
    'Taskfile.yml',
    '.rustfmt.toml',
  ] as const;

  const found: string[] = [];
  for (const file of configFiles) {
    const path = join(baseDir, file);
    if (existsSync(path)) {
      const content = await tryReadFile(path);
      if (content && content.length < 5000) {
        found.push(`\n// File: ${file}\n${content}`);
      }
    }
  }

  return found.join('\n');
}

export async function gatherFullContext(
  projectDir: string,
  contextSection: ContextSection,
  tasksPath: string,
  parsed: ReturnType<typeof parseTasks>,
  tasks: Array<{ id?: string; description: string; status: string }>,
  task: { id?: string; description: string }
): Promise<string> {
  let localContext = '';

  const readmePath = join(projectDir, 'README.md');
  if (existsSync(readmePath)) {
    const content = await tryReadFile(readmePath);
    if (content) {
      localContext += `\n// File: README.md\n${content}\n`;
    }
  }

  localContext += `\n// Project Type: ${detectProjectType(projectDir)}\n`;

  const dirStructure = await summarizeDirectoryStructure(projectDir);
  if (dirStructure) {
    localContext += `\n// Directory Structure: ${dirStructure}\n`;
  }

  const gitContext = await gatherGitContext(projectDir);
  if (gitContext) {
    localContext += `\n// Git Context\n${gitContext}\n`;
  }

  const depInfo = await gatherDependencyInfo(projectDir);
  if (depInfo) {
    localContext += `\n${depInfo}\n`;
  }

  const testFiles = await findTestFiles(projectDir);
  if (testFiles.length > 0) {
    localContext += `\n// Test Files Found: ${testFiles.map((f) => f.replace(projectDir, '').replace(/^\//, '')).join(', ')}\n`;
    const firstTestContent = await tryReadFile(testFiles[0]);
    if (firstTestContent && firstTestContent.length < 3000) {
      localContext += `\n// File (example test): ${testFiles[0].replace(homedir(), '~')}\n${firstTestContent}\n`;
    }
  }

  const todos = await findTodoComments(projectDir);
  if (todos.length > 0) {
    localContext += `\n// TODO/FIXME Comments (recent work in progress):\n${todos.join('\n')}\n`;
  }

  const docFiles = await findDocumentationFiles(projectDir);
  if (docFiles.length > 0) {
    localContext += `\n// Additional Documentation: ${docFiles.map((f) => f.replace(projectDir, '').replace(/^\//, '')).join(', ')}\n`;
    const firstDocContent = await tryReadFile(docFiles[0]);
    if (firstDocContent && firstDocContent.length < 2000) {
      localContext += `\n// File: ${docFiles[0].replace(homedir(), '~')}\n${firstDocContent}\n`;
    }
  }

  const configContent = await gatherConfigFiles(projectDir);
  if (configContent) {
    localContext += `\n// Configuration Files\n${configContent}\n`;
  }

  if (contextSection.files.length > 0) {
    const contextFiles = await gatherContextFiles(projectDir, contextSection.files);

    for (const file of contextFiles.slice(0, 15)) {
      const content = await tryReadFile(file);
      if (content) {
        if (content.length > 50000) {
          localContext += `\n// File: ${file.replace(homedir(), '~')} (skipped, too large: ${Math.round(content.length / 1024)}KB)\n`;
        } else {
          localContext += `\n// File: ${file.replace(homedir(), '~')}\n${content}\n`;
        }
      }
    }
    if (contextFiles.length > 15) {
      localContext += `\n// ... and ${contextFiles.length - 15} more files\n`;
    }
  }

  return localContext;
}
