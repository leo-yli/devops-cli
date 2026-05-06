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
import * as schemesClient from '../sdk/schemes/client.js';
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
      case 'run':
        if (!args[1]) return 'Usage: /pipeline run <pipeline-name> [demand-scheme-id]';
        const runDemandId = args[2] ? Number(args[2]) : 0;
        if (runDemandId > 0) {
          const result = await schemesClient.runSchemePipeline(runDemandId, args[1]);
          return `Triggered scheme pipeline ${args[1]} (demand: ${runDemandId}) task_id: ${result.task_id}`;
        }
        const runResult = await service.triggerPipeline(args[1]);
        return `Triggered pipeline ${args[1]} task_id: ${runResult.task_id}`;
      case 'rerun':
        if (!args[1]) return 'Usage: /pipeline rerun <pipeline-name> <stage-seq> [demand-scheme-id]';
        if (!args[2]) return 'Usage: /pipeline rerun <pipeline-name> <stage-seq> [demand-scheme-id]';
        const rerunDemandId = args[3] ? Number(args[3]) : 0;
        if (rerunDemandId > 0) {
          const result = await schemesClient.rerunSchemePipeline(rerunDemandId, args[1], Number(args[2]));
          return `Rerun scheme pipeline ${args[1]} stage ${args[2]} (demand: ${rerunDemandId}): ${result.context}`;
        }
        const rerunResult = await service.rerunStage(args[1], Number(args[2]));
        return `Rerun pipeline ${args[1]} stage ${args[2]}: ${rerunResult.context}`;
      case 'abort':
        if (!args[1]) return 'Usage: /pipeline abort <pipeline-name> [demand-scheme-id]';
        const abortDemandId = args[2] ? Number(args[2]) : 0;
        if (abortDemandId > 0) {
          const result = await schemesClient.abortSchemePipeline(abortDemandId, args[1]);
          return `Aborted scheme pipeline ${args[1]} (demand: ${abortDemandId}): ${result.context}`;
        }
        const abortResult = await service.cancelPipeline(args[1]);
        return `Aborted pipeline ${args[1]}: ${abortResult.context}`;
      case 'records':
        if (!args[1]) return 'Usage: /pipeline records <pipeline-name> [demand-scheme-id]';
        const recordsDemandId = args[2] ? Number(args[2]) : 0;
        const records = await service.getPipelineRecords(args[1], recordsDemandId, 10, 1);
        const recordsData = (records as any).data;
        if (!recordsData || !Array.isArray(recordsData)) {
          return '暂无运行记录';
        }
        return recordsData.map((r: any) => {
          const sm: Record<number, string> = { '-1': '失败', '1': '成功', '2': '中断', '3': '挂起', '4': '构建中' };
          const stateStr = sm[r.state] || String(r.state);
          return `Build #${r.build_id}: 状态=${stateStr}, 耗时=${r.cost_time}ms`;
        }).join('\n') || '暂无运行记录';
      case 'status':
        if (!args[1]) return 'Usage: /pipeline status <pipeline-name> [demand-scheme-id]';
        const statusDemandId = args[2] ? Number(args[2]) : 0;
        const status = await service.getPipelineRunStatus(args[1], statusDemandId);
        const raw = status as any;
        const stateMap: Record<number, string> = { '-1': '失败', '0': '未运行', '1': '成功', '2': '中断', '3': '挂起', '4': '构建中', '5': '回滚' };

        // API 返回当前运行状态对象 { current_state, build_id, current_stage, stage_list }
        if (raw.current_state !== undefined) {
          const stateStr = stateMap[raw.current_state] || String(raw.current_state);
          const lines = [
            `流水线: ${raw.pipeline_name || args[1]}`,
            `BuildID: ${raw.build_id}`,
            `状态: ${stateStr}`,
            `当前阶段: ${raw.current_stage ?? '-'}`,
          ];
          if (raw.stage_list && Array.isArray(raw.stage_list) && raw.stage_list.length > 0) {
            lines.push('阶段:');
            raw.stage_list.forEach((s: any, idx: number) => {
              const sState = stateMap[s.state] || String(s.state);
              lines.push(`  ${idx + 1}. ${s.stage_name || s.name || `Stage ${idx + 1}`} [${sState}]`);
            });
          }
          return lines.join('\n');
        }

        return '暂无运行状态数据';
      default:
        return 'Usage: /pipeline [list|show|run|abort|records|status|rerun]';
    }
  },
  
  // Schemes (Project)
  'schemes': async (args) => {
    const subcmd = args[0] || 'list';
    const service = new SchemesService();

    switch (subcmd) {
      case 'list': {
        const schemes = await service.listSchemes();
        if (!Array.isArray(schemes)) {
          return `API 返回非数组数据: ${JSON.stringify(schemes)}`;
        }
        if (!schemes.length) return '暂无项目';
        return schemes.map((s: any) => {
          if (typeof s === 'string') return s;
          const id = s.id ?? s.fid ?? s.scheme_id ?? s.pk ?? 'unknown';
          const name = s.name ?? s.fname ?? s.scheme_name ?? s.title ?? 'unknown';
          const status = s.status ?? s.fstatus ?? s.scheme_status ?? s.state ?? '-';
          return `${id}: ${name} [${status}]`;
        }).join('\n');
      }
      case 'show':
        if (!args[1]) return 'Usage: /schemes show <scheme-id>';
        const scheme = await service.getScheme(args[1]);
        return JSON.stringify(scheme, null, 2);
      default:
        return 'Usage: /schemes [list|show]';
    }
  },

  // Demand (DemandScheme)
  'demand': async (args) => {
    const subcmd = args[0] || 'list';
    const service = new SchemesService();

    switch (subcmd) {
      case 'list': {
        if (!args[1]) return 'Usage: /demand list <scheme-id> [page] [limit]';
        const page = args[2] ? Number(args[2]) : 1;
        const limit = args[3] ? Number(args[3]) : 20;
        const demands = await service.listDemandSchemes(args[1], page, limit);
        if (!Array.isArray(demands)) {
          return `API 返回非数组数据: ${JSON.stringify(demands)}`;
        }
        if (!demands.length) return '暂无需求项目';
        return demands.map((d: any) => {
          if (typeof d === 'string') return d;
          const id = d.id ?? d.fid ?? d.demand_scheme_id ?? d.pk ?? 'unknown';
          const name = d.name ?? d.fname ?? d.demand_scheme_name ?? d.title ?? 'unknown';
          const branch = d.git_branch ?? d.fgitBranch ?? d.branch ?? '-';
          return `${id}: ${name} [${branch}]`;
        }).join('\n');
      }
      case 'search': {
        if (!args[1] || !args[2]) return 'Usage: /demand search <scheme-id> <app-name> [page] [limit]';
        const page = args[3] ? Number(args[3]) : 1;
        const limit = args[4] ? Number(args[4]) : 20;
        const demands = await service.listDemandSchemes(args[1], page, limit, args[2]);
        if (!Array.isArray(demands)) {
          return `API 返回非数组数据: ${JSON.stringify(demands)}`;
        }
        if (!demands.length) return '未找到匹配的需求项目';
        return demands.map((d: any) => {
          if (typeof d === 'string') return d;
          const id = d.id ?? d.fid ?? d.demand_scheme_id ?? d.pk ?? 'unknown';
          const name = d.name ?? d.fname ?? d.demand_scheme_name ?? d.title ?? 'unknown';
          const branch = d.git_branch ?? d.fgitBranch ?? d.branch ?? '-';
          return `${id}: ${name} [${branch}]`;
        }).join('\n');
      }
      case 'show':
        if (!args[1] || !args[2]) return 'Usage: /demand show <scheme-id> <demand-id>';
        const demand = await service.getDemandScheme(args[1], args[2]);
        return JSON.stringify(demand, null, 2);
      default:
        return 'Usage: /demand [list <scheme-id> [page] [limit]|search <scheme-id> <app-name> [page] [limit]|show <scheme-id> <demand-id>]';
    }
  },
  
  // SCM
  'repo': async (args) => {
    const subcmd = args[0] || 'list';
    const service = new SCMService();

    switch (subcmd) {
      case 'list': {
        const res = await service.listProjects(args[1]);
        if (!res.context || !Array.isArray(res.context)) {
          return '暂无仓库项目';
        }
        return res.context.map((r: any) => `${r.id}: ${r.name} [${r.path_with_namespace ?? r.full_path ?? '-'}]`).join('\n') + `\n总计: ${res.count}`;
      }
      case 'groups': {
        const groups = await service.listGroups(args[1]);
        if (!groups.data || !Array.isArray(groups.data)) {
          return '暂无仓库分组';
        }
        return groups.data.map((g: any) => `${g.id}: ${g.name} (${g.path})`).join('\n') + `\n总计: ${groups.count}`;
      }
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
      case 'run': {
        if (!args[1]) return 'Usage: /skill run <skill-name> [--param value ...]';
        const skillName = args[1];
        const skill = skillRegistry.get(skillName);
        if (!skill) return `Skill "${skillName}" not found. Use /skill list to see available skills.`;

        // 解析参数：--key value 或 --key（布尔值）
        const rawArgs: Record<string, unknown> = {};
        for (let i = 2; i < args.length; i++) {
          const arg = args[i];
          if (arg.startsWith('--')) {
            const key = arg.slice(2).replace(/-/g, '');
            const nextArg = args[i + 1];
            if (nextArg && !nextArg.startsWith('--')) {
              // 尝试解析为数字或布尔值
              const num = Number(nextArg);
              if (!isNaN(num) && nextArg === String(num)) {
                rawArgs[key] = num;
              } else if (nextArg === 'true') {
                rawArgs[key] = true;
              } else if (nextArg === 'false') {
                rawArgs[key] = false;
              } else {
                rawArgs[key] = nextArg;
              }
              i++;
            } else {
              rawArgs[key] = true;
            }
          }
        }

        const ctx = {
          config: { host: process.env.DOPS_HOST || '' },
          rawArgs,
          prompt: {
            input: async (msg: string) => msg,
            confirm: async () => true,
            select: async <T,>(_msg: string, choices: { label: string; value: T }[]) => choices[0]?.value,
          },
          output: {
            info: (msg: string) => { /* REPL 输出通过 return 实现，这里收集信息 */ },
            success: (msg: string) => { },
            warning: (msg: string) => { },
            error: (msg: string) => { },
            table: (_headers: string[], _rows: string[][]) => { },
            json: (_data: unknown) => { },
          },
          progress: async <T,>(_msg: string, task: Promise<T>) => task,
        };

        try {
          const result = await skill.execute(ctx as any);
          const lines = [];
          if (result.message) lines.push(result.message);
          if (result.error) lines.push(`Error: ${result.error}`);
          if (result.suggestions?.length) lines.push(`Suggestions: ${result.suggestions.join(', ')}`);
          if (result.data) lines.push(JSON.stringify(result.data, null, 2));
          return lines.join('\n') || 'Skill executed.';
        } catch (e: any) {
          return `Skill execution failed: ${e.message}`;
        }
      }
      default:
        return 'Usage: /skill [list|show <name>|run <name> [--param value ...]]';
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
  run <pipeline-name> [demand-scheme-id]      - Trigger pipeline
  abort <pipeline-name> [demand-scheme-id]    - Abort pipeline
  records <pipeline-name> [demand-scheme-id]  - Show pipeline records
  status <pipeline-name> [demand-scheme-id]   - Show pipeline run status
  rerun <pipeline-name> <stage-seq>           - Rerun pipeline from stage

${chalk.cyan('/schemes')}
  list             - List projects
  show <id>        - Show project details

${chalk.cyan('/demand')}
  list <scheme-id> [page] [limit]              - List demand schemes under a scheme
  search <scheme-id> <app-name> [page] [limit] - Search demand schemes by app_name
  show <scheme-id> <demand-id>                 - Show demand scheme details

${chalk.cyan('/repo')}
  list [search]    - List SCM projects
  groups [search]  - List SCM groups
  owner <app-name> - Show app owner

${chalk.cyan('/skill')}
  list             - List all available skills
  show <name>      - Show skill details
  run <name> [--param value ...]  - Run a skill

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
  /schemes list
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
      {/* Title box: Ink double border + pixel-art mascot + title + devops infinity ring */}
      <Box borderStyle="double" borderColor="cyan" paddingX={1} marginBottom={1} width={termWidth}>
        {/* 左侧 1/3：像素龙靠左 */}
        <Box width={Math.floor(termWidth / 3)} flexDirection="column" justifyContent="center" alignItems="flex-start">
          <Box flexDirection="column">
            <Text color="white">{'  ▀▀  ▀▀  '}</Text>
            <Text color="white">{'  ██  ██  '}</Text>
            <Text color="white">{'██████████'}</Text>
            <Text>{chalk.white('█ ') + chalk.cyan('▀▀') + chalk.white('  ') + chalk.cyan('▀▀') + chalk.white(' █')}</Text>
            <Text color="white">{'██████████'}</Text>
            <Text color="white">{' ████████ '}</Text>
            <Text color="white">{' █▄    ▄█ '}</Text>
            <Text>{chalk.white('  ') + chalk.cyan('██') + chalk.white('  ') + chalk.cyan('██') + chalk.white('  ')}</Text>
          </Box>
        </Box>
        {/* 中间 1/3：标题居中 */}
        <Box width={Math.floor(termWidth / 3)} flexDirection="column" justifyContent="center" alignItems="center">
          <Box justifyContent="center"><Text color="cyan" bold>{'DevOps Platform CLI (dops)'}</Text></Box>
          <Box justifyContent="center"><Text dimColor>{'────────────────────────'}</Text></Box>
          <Box flexDirection="column" alignItems="center">
            <Box justifyContent="center"><Text color="cyan">{'╔═╗  ╔═╗'}</Text></Box>
            <Box justifyContent="center"><Text color="cyan">{'║ ╚══╝ ║'}</Text></Box>
            <Box justifyContent="center"><Text color="cyan">{'╚═╗  ╔═╝'}</Text></Box>
            <Box justifyContent="center"><Text color="cyan">{'  ╚══╝  '}</Text></Box>
          </Box>
        </Box>
        {/* 右侧 1/3：留空 */}
        <Box width={Math.floor(termWidth / 3)} />
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
