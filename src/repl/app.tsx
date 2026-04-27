#!/usr/bin/env node
import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from './TextInput.js';
import Spinner from 'ink-spinner';
import chalk from 'chalk';
import { skillRegistry } from '../skills/index.js';
import { executeBash } from '../agent/tools/local/bash.js';
import { executeFileRead, executeDirectoryList, executeGrep } from '../agent/tools/local/file.js';
import { PipelineService } from '../services/api/pipeline.js';
import { SchemesService } from '../services/api/schemes.js';
import { SCMService } from '../services/api/scm.js';
import { CommandSuggestions, computeSuggestions, SUBCOMMANDS, SuggestionResult } from './suggestions.js';

interface CommandHistory {
  command: string;
  output: string;
  error?: boolean;
  timestamp: Date;
}

// Command handlers
const commandHandlers: Record<string, (args: string[]) => Promise<string>> = {
  // Auth
  'login': async (args) => {
    const { loginCommand } = await import('../auth/login.js');
    const { loadConfig } = await import('../config.js');
    const config = loadConfig();
    // Priority: command args > env vars > config file
    const username = args[0] || process.env.DOPS_USERNAME || config.defaultUsername;
    const pwd     = args[1] || process.env.DOPS_PASSWORD || config.defaultPassword;
    const host    = args[2] || process.env.DOPS_HOST     || config.defaultHost;
    if (!username || !pwd) {
      return 'Usage: /login <username> <password> [host]\n       或在 ~/.dops/config.yaml 中设置 defaultUsername / defaultPassword';
    }
    await loginCommand(host, username, pwd);
    return `已登录到 ${host}`;
  },
  
  'logout': async () => {
    const { logoutCommand } = await import('../auth/login.js');
    await logoutCommand();
    return 'Logged out';
  },
  
  // Pipeline
  'pipeline': async (args) => {
    const subcmd = args[0] || 'list';
    const service = new PipelineService();

    switch (subcmd) {
      case 'list':
        const pipelines = await service.listPipelines();
        if (!pipelines.length) return '暂无流水线';
        return pipelines.join('\n');
      case 'show':
        if (!args[1]) return 'Usage: /pipeline show <pipeline-name>';
        const pipeline = await service.getPipeline(args[1]);
        return JSON.stringify(pipeline, null, 2);
      case 'trigger':
        if (!args[1]) return 'Usage: /pipeline trigger <pipeline-name>';
        await service.triggerPipeline(args[1]);
        return `Triggered pipeline ${args[1]}`;
      case 'abort':
        if (!args[1]) return 'Usage: /pipeline abort <pipeline-name>';
        await service.cancelPipeline(args[1]);
        return `Aborted pipeline ${args[1]}`;
      case 'records':
        if (!args[1] || !args[2]) return 'Usage: /pipeline records <pipeline-name> <demand-scheme-id>';
        const records = await service.getPipelineRecords(args[1], Number(args[2]), 10, 1);
        return records.data.map((r: any) => `Build #${r.build_id}: state=${r.state}, time=${r.cost_time}ms`).join('\n') || 'No records';
      case 'status':
        if (!args[1] || !args[2]) return 'Usage: /pipeline status <pipeline-name> <demand-scheme-id>';
        const status = await service.getPipelineRunStatus(args[1], Number(args[2]));
        return `Running: ${status.running}, Completed: ${status.completed}, Failed: ${status.failed}, Total: ${status.total}`;
      default:
        return 'Usage: /pipeline [list|show|trigger|abort|records|status]';
    }
  },
  
  // Project (Scheme)
  'project': async (args) => {
    const subcmd = args[0] || 'list';
    const service = new SchemesService();

    switch (subcmd) {
      case 'list':
        const schemes = await service.listSchemes();
        return schemes.map((s: any) => `${s.id}: ${s.name} [${s.status}]`).join('\n');
      case 'show':
        if (!args[1]) return 'Usage: /project show <scheme-id>';
        const scheme = await service.getScheme(args[1]);
        return JSON.stringify(scheme, null, 2);
      default:
        return 'Usage: /project [list|show]';
    }
  },

  // Demand (DemandScheme)
  'demand': async (args) => {
    const subcmd = args[0] || 'list';
    const service = new SchemesService();

    switch (subcmd) {
      case 'list':
        if (!args[1]) return 'Usage: /demand list <scheme-id>';
        const demands = await service.listDemandSchemes(args[1]);
        return demands.map((d: any) => `${d.id}: ${d.name} [${d.git_branch}]`).join('\n');
      case 'show':
        if (!args[1] || !args[2]) return 'Usage: /demand show <scheme-id> <demand-id>';
        const demand = await service.getDemandScheme(args[1], args[2]);
        return JSON.stringify(demand, null, 2);
      default:
        return 'Usage: /demand [list <scheme-id>|show <scheme-id> <demand-id>]';
    }
  },
  
  // SCM
  'repo': async (args) => {
    const subcmd = args[0] || 'list';
    const service = new SCMService();

    switch (subcmd) {
      case 'list':
        const res = await service.listProjects(args[1]);
        return res.context.map((r: any) => `${r.id}: ${r.name} [${r.path_with_namespace}]`).join('\n') + `\n总计: ${res.count}`;
      case 'groups':
        const groups = await service.listGroups(args[1]);
        return groups.data.map((g: any) => `${g.id}: ${g.name} (${g.path})`).join('\n') + `\n总计: ${groups.count}`;
      case 'owner':
        if (!args[1]) return 'Usage: /repo owner <app-name>';
        const owner = await service.getAppOwner(args[1]);
        return `${owner.app_name}: ${owner.owner || '-'}`;
      default:
        return 'Usage: /repo [list [search]|groups [search]|owner <app-name>]';
    }
  },
  
  // Skills
  'skill': async (args) => {
    const subcmd = args[0] || 'list';
    
    switch (subcmd) {
      case 'list': {
        const skills = skillRegistry.list();
        const lines = ['\n📚 Available Skills:\n'];
        
        const categories: Record<string, typeof skills> = {
          'Pipeline': [],
          'Deploy': [],
          'Git': [],
          'Other': [],
        };
        
        skills.forEach((s) => {
          const tags = s.definition.tags || [];
          if (tags.some(t => t.includes('pipeline'))) {
            categories['Pipeline'].push(s);
          } else if (tags.some(t => t.includes('deploy'))) {
            categories['Deploy'].push(s);
          } else if (tags.some(t => t.includes('git'))) {
            categories['Git'].push(s);
          } else {
            categories['Other'].push(s);
          }
        });
        
        Object.entries(categories).forEach(([cat, catSkills]) => {
          if (catSkills.length > 0) {
            lines.push(`${chalk.cyan(cat)}:`);
            catSkills.forEach((s) => {
              lines.push(`  ${chalk.yellow(s.definition.name.padEnd(18))} ${s.definition.description.slice(0, 40)}`);
            });
            lines.push('');
          }
        });
        
        lines.push(chalk.gray(`Total: ${skills.length} skills`));
        lines.push(chalk.gray('Use /skill show <name> for details\n'));
        return lines.join('\n');
      }
      case 'show': {
        if (!args[1]) return 'Usage: /skill show <skill-name>';
        const skill = skillRegistry.get(args[1]);
        if (!skill) return `Skill "${args[1]}" not found.`;
        
        const def = skill.definition;
        const lines = [
          chalk.bold(`\n🔧 ${def.name}`),
          chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'),
          `Description: ${def.description}`,
          `Version: ${def.version}`,
        ];
        
        if (def.tags) lines.push(`Tags: ${def.tags.join(', ')}`);
        
        if (def.parameters.length > 0) {
          lines.push(chalk.bold('\nParameters:'));
          def.parameters.forEach((p) => {
            const req = p.required ? chalk.red('(required)') : chalk.gray('(optional)');
            const def = p.default !== undefined ? ` [default: ${p.default}]` : '';
            lines.push(`  • ${chalk.cyan(p.name)} ${req}`);
            lines.push(`    ${p.description}${def}`);
            if (p.enum) lines.push(`    values: ${p.enum.join(', ')}`);
          });
        }
        
        if (def.examples && def.examples.length > 0) {
          lines.push(chalk.bold('\nExamples:'));
          def.examples.forEach((ex) => lines.push(`  $ ${chalk.green(ex)}`));
        }
        
        return lines.join('\n');
      }
      default:
        return 'Usage: /skill [list|show <name>]';
    }
  },
  
  // Local tools
  'bash': async (args) => {
    if (!args.length) return 'Usage: /bash <command>';
    const result = await executeBash({ command: args.join(' '), timeout: 60000 });
    return `${result.stdout}\n${result.stderr}`.trim() || '(no output)';
  },
  
  'cat': async (args) => {
    if (!args[0]) return 'Usage: /cat <file>';
    return (await executeFileRead({ path: args[0] })).content;
  },
  
  'ls': async (args) => {
    const path = args[0] || '.';
    const entries = (await executeDirectoryList({ path })).entries;
    return entries.map((e: any) => {
      const prefix = e.type === 'directory' ? 'd' : '-';
      return `${prefix} ${e.name}`;
    }).join('\n');
  },
  
  'grep': async (args) => {
    if (args.length < 2) return 'Usage: /grep <pattern> <path>';
    const pattern = args[0];
    const path = args[1];
    const results = (await executeGrep({ pattern, path, recursive: true })).matches;
    return results.map((r: any) => `${r.file}:${r.line}: ${r.content}`).join('\n') || 'No matches';
  },
  
  // System
  'help': async () => {
    return `
${chalk.bold('Available Commands:')}

${chalk.cyan('/auth')}
  login <username> <password> [host]  - Login to DevOps platform
  logout                              - Logout

${chalk.cyan('/pipeline')}
  list                              - List pipelines
  show <pipeline-name>              - Show pipeline details
  trigger <pipeline-name>           - Trigger pipeline
  abort <pipeline-name>             - Abort pipeline
  records <pipeline-name> <demand-scheme-id>  - Show pipeline records
  status <pipeline-name> <demand-scheme-id>   - Show pipeline run status

${chalk.cyan('/project')}
  list             - List projects
  show <id>        - Show project details

${chalk.cyan('/demand')}
  list <scheme-id>              - List demand schemes under a scheme
  show <scheme-id> <demand-id>  - Show demand scheme details

${chalk.cyan('/repo')}
  list [search]    - List SCM projects
  groups [search]  - List SCM groups
  owner <app-name> - Show app owner

${chalk.cyan('/skill')}
  list             - List all available skills
  show <name>      - Show skill details

${chalk.cyan('/local')}
  bash <cmd>       - Execute shell command
  cat <file>       - Read file
  ls [path]        - List directory
  grep <p> <path>  - Search files

${chalk.cyan('/system')}
  clear            - Clear screen
  exit             - Exit REPL
  help             - Show this help

${chalk.bold('Quick Examples:')}
  /skill list
  /skill show pipeline-runner
  /pipeline list
  /project list
`.trim();
  },
  
  'clear': async () => 'CLEAR',
  'exit': async () => 'EXIT',
  'quit': async () => 'EXIT',
};

export function ReplApp() {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<CommandHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [suggestionResult, setSuggestionResult] = useState<SuggestionResult | null>(null);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [textInputKey, setTextInputKey] = useState(0);
  const [termWidth, setTermWidth] = useState(() => process.stdout.columns || 80);

  useEffect(() => {
    const onResize = () => setTermWidth(process.stdout.columns || 80);
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off('resize', onResize); };
  }, []);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    const result = computeSuggestions(value);
    setSuggestionResult(result);
    setSelectedSuggestionIndex(0);
  }, []);

  const applySuggestion = useCallback((selected: string) => {
    if (!suggestionResult) return;
    let newValue: string;
    if (suggestionResult.level === 'command') {
      newValue = `/${selected}`;
      if (SUBCOMMANDS[selected]) {
        newValue += ' ';
      }
    } else {
      newValue = `/${suggestionResult.commandPrefix} ${selected}`;
    }
    setInput(newValue);
    setTextInputKey(k => k + 1);
    const nextResult = computeSuggestions(newValue);
    setSuggestionResult(nextResult);
    setSelectedSuggestionIndex(0);
  }, [suggestionResult]);

  const executeReplCommand = useCallback(async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    
    setCommandHistory(prev => [...prev, trimmed]);
    setLoading(true);
    
    try {
      const match = trimmed.match(/^\/([a-zA-Z-]+)(?:\s+(.*))?$/);
      if (!match) {
        setHistory(prev => [...prev, {
          command: trimmed,
          output: 'Error: Commands must start with / (e.g., /help)',
          error: true,
          timestamp: new Date()
        }]);
        setLoading(false);
        return;
      }
      
      const [, cmdName, argsStr] = match;
      const args = argsStr ? argsStr.trim().split(/\s+/) : [];
      
      const handler = commandHandlers[cmdName.toLowerCase()];
      if (!handler) {
        setHistory(prev => [...prev, {
          command: trimmed,
          output: `Unknown command: /${cmdName}. Type /help for available commands.`,
          error: true,
          timestamp: new Date()
        }]);
        setLoading(false);
        return;
      }
      
      const output = await handler(args);
      
      if (output === 'EXIT') {
        exit();
        return;
      }
      
      if (output === 'CLEAR') {
        setHistory([]);
        setLoading(false);
        return;
      }
      
      if (output) {
        setHistory(prev => [...prev, {
          command: trimmed,
          output,
          timestamp: new Date()
        }]);
      }
    } catch (error: any) {
      setHistory(prev => [...prev, {
        command: trimmed,
        output: error.message || String(error),
        error: true,
        timestamp: new Date()
      }]);
    }
    
    setLoading(false);
  }, [exit]);

  const handleSubmit = useCallback((value: string) => {
    setSuggestionResult(null);
    setHistoryIndex(-1);
    executeReplCommand(value);
    setInput('');
  }, [executeReplCommand]);

  useInput((_input, key) => {
    if (suggestionResult && suggestionResult.candidates.length > 0) {
      if (key.tab) {
        applySuggestion(suggestionResult.candidates[selectedSuggestionIndex]);
        return;
      }
      if (key.escape) {
        setSuggestionResult(null);
        setHistoryIndex(-1);
        return;
      }
      if (key.upArrow) {
        setSelectedSuggestionIndex(prev =>
          (prev - 1 + suggestionResult.candidates.length) % suggestionResult.candidates.length
        );
        return;
      }
      if (key.downArrow) {
        setSelectedSuggestionIndex(prev =>
          (prev + 1) % suggestionResult.candidates.length
        );
        return;
      }
      // Let other keys (regular characters) fall through to TextInput
    }

    if (key.upArrow) {
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex] || '');
      }
      return;
    }

    if (key.downArrow) {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex] || '');
      } else {
        setHistoryIndex(-1);
        setInput('');
      }
      return;
    }
  });

  return (
    <Box flexDirection="column">
      {/* Title box: Ink double border + pixel-art mascot in yellow blocks */}
      <Box borderStyle="double" borderColor="cyan" paddingX={1} marginBottom={1} width={termWidth}>
        <Box alignItems="center">
          {/* Pixel white dragon head — all rows as <Text> for consistent alignment */}
          <Box flexDirection="column" marginRight={2}>
            <Text color="white">{'  ▀▀  ▀▀  '}</Text>
            <Text color="white">{'  ██  ██  '}</Text>
            <Text color="white">{'██████████'}</Text>
            <Text>{chalk.white('█ ') + chalk.cyan('▀▀') + chalk.white('  ') + chalk.cyan('▀▀') + chalk.white(' █')}</Text>
            <Text color="white">{'██████████'}</Text>
            <Text color="white">{' ████████ '}</Text>
            <Text color="white">{' █▄    ▄█ '}</Text>
            <Text>{chalk.white('  ') + chalk.cyan('██') + chalk.white('  ') + chalk.cyan('██') + chalk.white('  ')}</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            <Box justifyContent="center"><Text bold color="cyan">DevOps Platform CLI (dops)</Text></Box>
            <Box justifyContent="center"><Text color="cyan">{'─'.repeat(24)}</Text></Box>
            <Box justifyContent="center"><Text color="white">Build  →  Test  →  Deploy</Text></Box>
          </Box>
        </Box>
      </Box>
      
      <Text dimColor>Type /help for available commands, /exit to quit</Text>
      <Box marginY={1} />
      
      {history.map((item, i) => (
        <Box key={i} flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold color="green">dops&gt; </Text>
            <Text>{item.command}</Text>
          </Box>
          <Box marginLeft={2}>
            <Text color={item.error ? 'red' : undefined}>{item.output}</Text>
          </Box>
        </Box>
      ))}
      
      {loading && (
        <Box marginLeft={2}>
          <Text color="yellow">
            <Spinner type="dots" />
            {' '}Processing...
          </Text>
        </Box>
      )}
      
      <Text color="cyan">{'─'.repeat(termWidth)}</Text>
      <Box>
        <Text bold color="green">dops&gt; </Text>
        <TextInput
          key={textInputKey}
          value={input}
          onChange={handleInputChange}
          onSubmit={handleSubmit}
        />
      </Box>
      {suggestionResult && suggestionResult.candidates.length > 0 && (
        <CommandSuggestions
          suggestions={suggestionResult.candidates}
          selectedIndex={selectedSuggestionIndex}
        />
      )}
      {suggestionResult?.hint && (
        <Box marginLeft={2}>
          <Text dimColor>{suggestionResult.hint}</Text>
        </Box>
      )}
      <Text color="cyan">{'─'.repeat(termWidth)}</Text>
    </Box>
  );
}
