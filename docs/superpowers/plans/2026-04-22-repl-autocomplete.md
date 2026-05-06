# REPL 命令自动补全 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating autocomplete menu to the REPL that suggests commands when the user types `/`, supports Tab/arrow selection and input filtering, and provides two-level completion (command + subcommand).

**Architecture:** A new `CommandSuggestions` display component renders a filtered candidate list above the input line. All autocomplete state lives in `ReplApp`. The existing `useInput` hook gains a conditional branch: when the suggestion menu is open, Tab/arrows/Enter/Escape control the menu; when closed, original behavior is preserved.

**Tech Stack:** React, Ink (TUI framework), ink-text-input, TypeScript

---

## File Structure

| File | Role |
|------|------|
| `src/repl/suggestions.tsx` (create) | `CommandSuggestions` display component, `COMMAND_NAMES` list, `SUBCOMMANDS` map, `computeSuggestions()` helper |
| `src/repl/app.tsx` (modify) | Integrate autocomplete state, onChange logic, useInput keyboard interception, render `CommandSuggestions` |

---

### Task 1: Create suggestions.tsx — data + display component

**Files:**
- Create: `src/repl/suggestions.tsx`

This task builds the complete `suggestions.tsx` file: the command/subcommand data, the candidate computation function, and the display component.

- [ ] **Step 1: Create `src/repl/suggestions.tsx` with full content**

```tsx
import React from 'react';
import { Box, Text } from 'ink';

export const COMMAND_NAMES = [
  'login', 'logout',
  'pipeline', 'project', 'demand', 'repo', 'skill',
  'bash', 'cat', 'ls', 'grep',
  'help', 'clear', 'exit', 'quit',
];

export const SUBCOMMANDS: Record<string, string[]> = {
  pipeline: ['list', 'show', 'trigger'],
  project:  ['list', 'show'],
  demand:   ['list', 'show'],
  repo:     ['list', 'branches', 'mrs'],
  skill:    ['list', 'show'],
};

const MAX_VISIBLE = 8;

export interface SuggestionResult {
  candidates: string[];
  level: 'command' | 'subcommand';
  commandPrefix: string;
}

export function computeSuggestions(input: string): SuggestionResult | null {
  const cmdMatch = input.match(/^\/([a-zA-Z-]*)$/);
  if (cmdMatch) {
    const prefix = cmdMatch[1].toLowerCase();
    const candidates = COMMAND_NAMES.filter(c => c.startsWith(prefix));
    if (candidates.length > 0) {
      return { candidates, level: 'command', commandPrefix: '' };
    }
    return null;
  }

  const subMatch = input.match(/^\/([a-zA-Z-]+)\s+([a-zA-Z]*)$/);
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
    return null;
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
```

- [ ] **Step 2: Verify file compiles**

Run: `npx tsc --noEmit src/repl/suggestions.tsx` or full project typecheck `pnpm run typecheck`

Expected: No type errors related to suggestions.tsx.

- [ ] **Step 3: Commit**

```bash
git add src/repl/suggestions.tsx
git commit -m "feat(repl): add CommandSuggestions component and autocomplete data"
```

---

### Task 2: Integrate autocomplete into ReplApp

**Files:**
- Modify: `src/repl/app.tsx`

This task wires up the autocomplete state, onChange handler, keyboard interception, and rendering into the existing ReplApp component.

- [ ] **Step 1: Add imports at the top of `src/repl/app.tsx`**

Add after the existing `import { SCMService }` line (line 12):

```tsx
import { CommandSuggestions, computeSuggestions, SUBCOMMANDS, SuggestionResult } from './suggestions.js';
```

- [ ] **Step 2: Add autocomplete state to ReplApp**

Inside `ReplApp()`, after the existing `useState` declarations (after line 288), add:

```tsx
const [suggestionResult, setSuggestionResult] = useState<SuggestionResult | null>(null);
const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
```

- [ ] **Step 3: Create the onChange handler that drives autocomplete**

Replace the current direct `setInput` usage. After the state declarations, add:

```tsx
const handleInputChange = useCallback((value: string) => {
  setInput(value);
  const result = computeSuggestions(value);
  setSuggestionResult(result);
  setSelectedSuggestionIndex(0);
}, []);
```

- [ ] **Step 4: Create the applySuggestion helper**

After `handleInputChange`, add:

```tsx
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
  const nextResult = computeSuggestions(newValue);
  setSuggestionResult(nextResult);
  setSelectedSuggestionIndex(0);
}, [suggestionResult]);
```

- [ ] **Step 5: Update handleSubmit to close menu**

Replace the existing `handleSubmit` (lines 357-361) with:

```tsx
const handleSubmit = useCallback((value: string) => {
  if (suggestionResult && suggestionResult.candidates.length > 0) {
    applySuggestion(suggestionResult.candidates[selectedSuggestionIndex]);
    return;
  }
  setSuggestionResult(null);
  setHistoryIndex(-1);
  executeReplCommand(value);
  setInput('');
}, [suggestionResult, selectedSuggestionIndex, applySuggestion, executeReplCommand]);
```

- [ ] **Step 6: Update useInput to handle autocomplete keyboard events**

Replace the existing `useInput` block (lines 363-384) with:

```tsx
useInput((_input, key) => {
  if (suggestionResult && suggestionResult.candidates.length > 0) {
    if (key.tab) {
      setSelectedSuggestionIndex(prev =>
        key.shift
          ? (prev - 1 + suggestionResult.candidates.length) % suggestionResult.candidates.length
          : (prev + 1) % suggestionResult.candidates.length
      );
      return;
    }
    if (key.escape) {
      setSuggestionResult(null);
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
    return;
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
```

- [ ] **Step 7: Update JSX — add CommandSuggestions and wire onChange**

In the return JSX, insert `CommandSuggestions` between the loading spinner and the input line. Also change `TextInput` to use `handleInputChange`.

Replace the bottom part of the JSX (from the `<Box>` containing `TextInput` to the end) — find:

```tsx
      <Box>
        <Text bold color="green">dops&gt; </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
        />
      </Box>
```

Replace with:

```tsx
      {suggestionResult && suggestionResult.candidates.length > 0 && (
        <CommandSuggestions
          suggestions={suggestionResult.candidates}
          selectedIndex={selectedSuggestionIndex}
        />
      )}
      <Box>
        <Text bold color="green">dops&gt; </Text>
        <TextInput
          value={input}
          onChange={handleInputChange}
          onSubmit={handleSubmit}
        />
      </Box>
```

- [ ] **Step 8: Verify full project compiles**

Run: `pnpm run typecheck`

Expected: No type errors.

- [ ] **Step 9: Commit**

```bash
git add src/repl/app.tsx
git commit -m "feat(repl): integrate command autocomplete into REPL"
```

---

### Task 3: Manual smoke test

**Files:** None (testing only)

- [ ] **Step 1: Build**

Run: `pnpm run build`

- [ ] **Step 2: Launch REPL and test one-level completion**

Run: `node dist/main.js`

Test cases:
1. Type `/` → menu appears with all 15 commands
2. Type `/pi` → menu filters to show `pipeline`
3. Press Tab or down arrow → highlight moves
4. Press Enter → input becomes `/pipeline `
5. Press Escape while menu open → menu closes

- [ ] **Step 3: Test two-level completion**

1. Type `/pipeline ` (with trailing space) → submenu shows `list`, `show`, `trigger`
2. Type `s` → filters to `show`
3. Press Enter → input becomes `/pipeline show`
4. Press Enter again → command executes (or shows error if no API, which is expected)

- [ ] **Step 4: Test edge cases**

1. Type `/xyz` → no match, menu stays closed
2. Type `/help` then Enter twice (once to select, once to execute) → help text appears
3. Type `/` then backspace to empty → menu closes
4. Use up/down arrows when menu is closed → command history navigation works as before

- [ ] **Step 5: Commit final state if any adjustments were made**

```bash
git add -u
git commit -m "fix(repl): adjust autocomplete after smoke testing"
```
