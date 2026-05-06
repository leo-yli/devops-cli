/**
 * Patched TextInput based on ink-text-input v6.
 * Adds: Home / End / Ctrl+A / Ctrl+E cursor navigation.
 */
import React, { useState, useEffect } from 'react';
import { Text, useInput } from 'ink';
import chalk from 'chalk';

interface TextInputProps {
  value: string;
  placeholder?: string;
  focus?: boolean;
  mask?: string;
  highlightPastedText?: boolean;
  showCursor?: boolean;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
}

export default function TextInput({
  value: originalValue,
  placeholder = '',
  focus = true,
  mask,
  highlightPastedText = false,
  showCursor = true,
  onChange,
  onSubmit,
}: TextInputProps) {
  const [state, setState] = useState({
    cursorOffset: (originalValue || '').length,
    cursorWidth: 0,
  });
  const { cursorOffset, cursorWidth } = state;

  useEffect(() => {
    setState(prev => {
      if (!focus || !showCursor) return prev;
      const newValue = originalValue || '';
      if (prev.cursorOffset > newValue.length) {
        return { cursorOffset: newValue.length, cursorWidth: 0 };
      }
      return prev;
    });
  }, [originalValue, focus, showCursor]);

  const cursorActualWidth = highlightPastedText ? cursorWidth : 0;
  const value = mask ? mask.repeat(originalValue.length) : originalValue;
  let renderedValue = value;
  let renderedPlaceholder = placeholder ? chalk.grey(placeholder) : undefined;

  if (showCursor && focus) {
    renderedPlaceholder =
      placeholder.length > 0
        ? chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1))
        : chalk.inverse(' ');
    renderedValue = value.length > 0 ? '' : chalk.inverse(' ');
    let i = 0;
    for (const char of value) {
      renderedValue +=
        i >= cursorOffset - cursorActualWidth && i <= cursorOffset
          ? chalk.inverse(char)
          : char;
      i++;
    }
    if (value.length > 0 && cursorOffset === value.length) {
      renderedValue += chalk.inverse(' ');
    }
  }

  useInput((input, key) => {
    if (
      key.upArrow ||
      key.downArrow ||
      (key.ctrl && input === 'c') ||
      key.tab ||
      (key.shift && key.tab)
    ) {
      return;
    }

    if (key.return) {
      onSubmit?.(originalValue);
      return;
    }

    let nextCursorOffset = cursorOffset;
    let nextValue = originalValue;
    let nextCursorWidth = 0;

    // Home: Ctrl+A or Home key
    if ((key as any).home || (key.ctrl && input === 'a')) {
      nextCursorOffset = 0;
    }
    // End: Ctrl+E or End key
    else if ((key as any).end || (key.ctrl && input === 'e')) {
      nextCursorOffset = originalValue.length;
    }
    // Escape sequences that Home/End may send on some terminals
    else if (input === '\x1b[H' || input === '\x1bOH' || input === '\x1b[1~') {
      nextCursorOffset = 0;
    }
    else if (input === '\x1b[F' || input === '\x1bOF' || input === '\x1b[4~') {
      nextCursorOffset = originalValue.length;
    }
    else if (key.leftArrow) {
      if (showCursor) nextCursorOffset--;
    }
    else if (key.rightArrow) {
      if (showCursor) nextCursorOffset++;
    }
    else if (key.backspace || key.delete) {
      if (cursorOffset > 0) {
        nextValue =
          originalValue.slice(0, cursorOffset - 1) +
          originalValue.slice(cursorOffset);
        nextCursorOffset--;
      }
    }
    else {
      // Guard against raw escape sequences leaking through as text
      if (input.startsWith('\x1b')) return;
      nextValue =
        originalValue.slice(0, cursorOffset) +
        input +
        originalValue.slice(cursorOffset);
      nextCursorOffset += input.length;
      if (input.length > 1) nextCursorWidth = input.length;
    }

    nextCursorOffset = Math.max(0, Math.min(nextCursorOffset, nextValue.length));

    setState({ cursorOffset: nextCursorOffset, cursorWidth: nextCursorWidth });
    if (nextValue !== originalValue) onChange(nextValue);
  }, { isActive: focus });

  return (
    <Text>
      {placeholder
        ? value.length > 0 ? renderedValue : renderedPlaceholder
        : renderedValue}
    </Text>
  );
}
