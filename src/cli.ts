#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  cmdInit,
  cmdList,
  cmdAdd,
  cmdStatus,
  cmdConfig,
  cmdDo,
  cmdWatch,
  cmdUnwatch,
} from './commands.js';

export function run(): void {
  yargs(hideBin(process.argv))
    .scriptName('tasq')
    .version('2.0.0')
    .help('h')
    .alias('h', 'help')
    .wrap(120)
    .usage('$0 [command] [options]')
    .command(
      '$0',
      'List tasks (default)',
      (y) =>
        y
          .option('local', { type: 'boolean', describe: 'Show only current directory' })
          .option('pending', { type: 'boolean', describe: 'Show only pending' })
          .option('all', { type: 'boolean', describe: 'Show all projects' }),
      (argv) => cmdList(argv)
    )
    .command(
      'init',
      'Initialize TASKS.md',
      (y) =>
        y
          .option('force', { type: 'boolean' })
          .option('name', { type: 'string' })
          .option('description', { type: 'string' }),
      (argv) => cmdInit(argv)
    )
    .command(
      'list',
      'List tasks (scans all projects by default)',
      (y) =>
        y
          .option('local', { type: 'boolean', describe: 'Show only current directory' })
          .option('pending', { type: 'boolean', describe: 'Show only pending' })
          .option('all', { type: 'boolean', describe: 'Show all projects' }),
      (argv) => cmdList(argv)
    )
    .command(
      'local',
      'List tasks from current directory only',
      (y) => y,
      (argv) => cmdList({ ...argv, local: true })
    )
    .command(
      'add [description]',
      'Add a task',
      (y) =>
        y.positional('description', { type: 'string' }).option('description', { type: 'string' }),
      (argv) => cmdAdd(argv)
    )
    .command(
      'done [id]',
      'Mark task as done',
      (y) => y.positional('id', { type: 'string', describe: 'Task number or description' }),
      (argv) =>
        cmdStatus({ command: 'done', identifier: (argv.id as string) || (argv._[1] as string) })
    )
    .command(
      'wip [id]',
      'Mark task as in-progress',
      (y) => y.positional('id', { type: 'string', describe: 'Task number or description' }),
      (argv) =>
        cmdStatus({ command: 'wip', identifier: (argv.id as string) || (argv._[1] as string) })
    )
    .command(
      'do [id]',
      'Do task - delegate to AI with context',
      (y) =>
        y
          .positional('id', { type: 'string', describe: 'Task number or description' })
          .option('dry', { type: 'boolean', describe: "Dry run - don't invoke AI tool" })
          .option('claude', { type: 'boolean', describe: 'Use Claude (default)' })
          .option('opencode', { type: 'boolean', describe: 'Use OpenCode' })
          .option('yolo', { type: 'boolean', describe: 'YOLO mode - auto-accept all prompts' }),
      (argv) =>
        cmdDo({
          identifier: (argv.id as string) || (argv._[1] as string),
          dry: argv.dry as boolean,
          aiTool: argv.opencode ? 'opencode' : 'claude',
          yolo: argv.yolo as boolean,
          debug: argv.debug as boolean,
        })
    )
    .command(
      'config [action] [path]',
      'Manage config',
      (y) =>
        y
          .positional('action', { type: 'string', describe: 'Action: show, add-path' })
          .positional('path', { type: 'string', describe: 'Path for add-path' }),
      (argv) =>
        cmdConfig({
          action: (argv._[1] as string) || 'show',
          path: (argv.path as string) || (argv._[2] as string),
        })
    )
    .command(
      'watch <directory>',
      'Add directory to scan list',
      (y) => y.positional('directory', { type: 'string', describe: 'Directory path to watch' }),
      (argv) =>
        cmdWatch({
          directory: (argv.directory as string) || (argv._[1] as string),
        })
    )
    .command(
      'unwatch <directory>',
      'Remove directory from scan list',
      (y) =>
        y.positional('directory', { type: 'string', describe: 'Directory path to stop watching' }),
      (argv) =>
        cmdUnwatch({
          directory: (argv.directory as string) || (argv._[1] as string),
        })
    )
    .parse();
}

run();
