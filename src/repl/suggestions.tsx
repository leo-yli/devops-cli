import React from 'react';
import { Box, Text } from 'ink';

export const COMMAND_NAMES = [
  'login', 'logout',
  'pipeline', 'schemes', 'demand', 'repo', 'skill',
  'bash', 'cat', 'ls', 'grep',
  'help', 'clear', 'exit', 'quit',
];

export const SUBCOMMANDS: Record<string, string[]> = {
  pipeline: ['list', 'show', 'run', 'abort', 'records', 'status', 'rerun'],
  schemes:  ['list', 'show'],
  demand:   ['list', 'search', 'show'],
  repo:     ['list', 'groups', 'owner'],
  skill:    ['list', 'show', 'run'],
};

const COMMAND_USAGE: Record<string, string> = {
  login:    '/login <用户名> <密码> [host]',
  logout:   '/logout',
  pipeline: '/pipeline <list | show <name> | run <name> [demand-id] | abort <name> [demand-id] | records <name> [demand-id] | status <name> [demand-id] | rerun <name> <stage-seq>>',
  schemes:  '/schemes <list | show <id>>',
  demand:   '/demand <list <scheme-id> [page] [limit] | search <scheme-id> <app-name> [page] [limit] | show <scheme-id> <demand-id>>',
  repo:     '/repo <list [search] | groups [search] | owner <app-name>>',
  skill:    '/skill <list | show <名称> | run <名称> [--param value ...]>',
  bash:     '/bash <shell 命令>',
  cat:      '/cat <文件路径>',
  ls:       '/ls [路径]',
  grep:     '/grep <pattern> <路径>',
};

const SUBCOMMAND_USAGE: Record<string, Record<string, string>> = {
  pipeline: {
    list:    '/pipeline list',
    show:    '/pipeline show <pipeline-name>',
    run:     '/pipeline run <pipeline-name> [demand-scheme-id]',
    abort:   '/pipeline abort <pipeline-name> [demand-scheme-id]',
    records: '/pipeline records <pipeline-name> [demand-scheme-id]',
    status:  '/pipeline status <pipeline-name> [demand-scheme-id]',
    rerun:   '/pipeline rerun <pipeline-name> <stage-seq> [demand-scheme-id]',
  },
  schemes: {
    list: '/schemes list',
    show: '/schemes show <id>',
  },
  demand: {
    list: '/demand list <scheme-id> [page] [limit]',
    search: '/demand search <scheme-id> <app-name> [page] [limit]',
    show: '/demand show <scheme-id> <demand-id>',
  },
  repo: {
    list:  '/repo list [search]',
    groups: '/repo groups [search]',
    owner: '/repo owner <app-name>',
  },
  skill: {
    list: '/skill list',
    show: '/skill show <name>',
    run:  '/skill run <name> [--param value ...]',
  },
};

const MAX_VISIBLE = 8;

export interface SuggestionResult {
  candidates: string[];
  level: 'command' | 'subcommand';
  commandPrefix: string;
  hint?: string;
}

export function computeSuggestions(input: string): SuggestionResult | null {
  const cmdMatch = input.match(/^\/([a-zA-Z-]*)$/);
  if (cmdMatch) {
    const prefix = cmdMatch[1].toLowerCase();
    const candidates = COMMAND_NAMES.filter(c => c.startsWith(prefix));
    // Exact match with no more typing — show usage hint instead of dropdown
    if (candidates.length === 1 && candidates[0] === prefix) {
      const hint = COMMAND_USAGE[prefix];
      return hint ? { candidates: [], level: 'command', commandPrefix: prefix, hint } : null;
    }
    if (candidates.length > 0) {
      return { candidates, level: 'command', commandPrefix: '' };
    }
    return null;
  }

  const subMatch = input.match(/^\/([a-zA-Z-]+)\s+([a-zA-Z-]*)$/);
  if (subMatch) {
    const cmd = subMatch[1].toLowerCase();
    const subPrefix = subMatch[2].toLowerCase();
    const subs = SUBCOMMANDS[cmd];
    const subUsages = SUBCOMMAND_USAGE[cmd];
    if (subs) {
      const candidates = subs.filter(s => s.startsWith(subPrefix));
      // Exact subcommand match — show parameter hint
      if (candidates.length === 1 && candidates[0] === subPrefix && subUsages?.[subPrefix]) {
        return { candidates: [], level: 'subcommand', commandPrefix: cmd, hint: subUsages[subPrefix] };
      }
      if (candidates.length > 0) {
        return { candidates, level: 'subcommand', commandPrefix: cmd };
      }
    }
    // No subcommand match — show command usage hint
    const hint = COMMAND_USAGE[cmd];
    return hint ? { candidates: [], level: 'subcommand', commandPrefix: cmd, hint } : null;
  }

  // Third level: /cmd subcmd args... — keep showing subcmd hint
  const argsMatch = input.match(/^\/([a-zA-Z-]+)\s+([a-zA-Z-]+)\s+/);
  if (argsMatch) {
    const cmd = argsMatch[1].toLowerCase();
    const sub = argsMatch[2].toLowerCase();
    const subUsages = SUBCOMMAND_USAGE[cmd];
    if (subUsages?.[sub]) {
      return { candidates: [], level: 'subcommand', commandPrefix: cmd, hint: subUsages[sub] };
    }
  }

  return null;
}

interface CommandSuggestionsProps {
  suggestions: string[];
  selectedIndex: number;
}

export function CommandSuggestions({ suggestions, selectedIndex }: CommandSuggestionsProps) {
  if (suggestions.length === 0) return null;

  let start = 0;
  if (suggestions.length > MAX_VISIBLE) {
    start = Math.max(0, Math.min(selectedIndex - Math.floor(MAX_VISIBLE / 2), suggestions.length - MAX_VISIBLE));
  }
  const visible = suggestions.slice(start, start + MAX_VISIBLE);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      {visible.map((item, i) => {
        const actualIndex = start + i;
        const isSelected = actualIndex === selectedIndex;
        return (
          <Text key={item} inverse={isSelected} color={isSelected ? 'cyan' : undefined}>
            {isSelected ? '> ' : '  '}{item}
          </Text>
        );
      })}
      {suggestions.length > MAX_VISIBLE && (
        <Text dimColor>  ({suggestions.length} items)</Text>
      )}
    </Box>
  );
}
