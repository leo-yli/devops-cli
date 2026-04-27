import React from 'react';
import { Box, Text } from 'ink';

export const COMMAND_NAMES = [
  'login', 'logout',
  'pipeline', 'project', 'demand', 'repo', 'skill',
  'bash', 'cat', 'ls', 'grep',
  'help', 'clear', 'exit', 'quit',
];

export const SUBCOMMANDS: Record<string, string[]> = {
  pipeline: ['list', 'show', 'trigger', 'abort', 'records', 'status'],
  project:  ['list', 'show'],
  demand:   ['list', 'show'],
  repo:     ['list', 'groups', 'owner'],
  skill:    ['list', 'show'],
};

const COMMAND_USAGE: Record<string, string> = {
  login:    '/login <用户名> <密码> [host]',
  logout:   '/logout',
  pipeline: '/pipeline <list | show <name> | trigger <name> [demand-id] | abort <name> [demand-id] | records <name> [demand-id] | status <name> [demand-id]>',
  project:  '/project <list | show <id>>',
  demand:   '/demand <list <scheme-id> | show <scheme-id> <demand-id>>',
  repo:     '/repo <list [search] | groups [search] | owner <app-name>>',
  skill:    '/skill <list | show <名称>>',
  bash:     '/bash <shell 命令>',
  cat:      '/cat <文件路径>',
  ls:       '/ls [路径]',
  grep:     '/grep <pattern> <路径>',
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
    if (subs) {
      const candidates = subs.filter(s => s.startsWith(subPrefix));
      if (candidates.length > 0) {
        return { candidates, level: 'subcommand', commandPrefix: cmd };
      }
    }
    // No subcommand match — show usage hint
    const hint = COMMAND_USAGE[cmd];
    return hint ? { candidates: [], level: 'subcommand', commandPrefix: cmd, hint } : null;
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
