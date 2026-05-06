/**
 * Output management module
 * Supports both human-readable and JSON output modes for LLM/Agent integration
 */

import chalk from 'chalk';

let jsonMode = false;

export function setGlobalJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export interface OutputResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    timestamp: string;
    command: string;
  };
}

/**
 * Print result in appropriate format
 */
export function printResult<T>(result: OutputResult<T>): void {
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.success) {
      if (result.message) {
        console.log(chalk.green(result.message));
      }
      if (result.data) {
        console.log(result.data);
      }
    } else {
      console.error(chalk.red(result.error || 'Unknown error'));
    }
  }
}

/**
 * Print JSON output directly
 */
export function printJson<T>(data: T): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Print error and exit
 */
export function printError(message: string, exitCode = 1): never {
  if (jsonMode) {
    console.log(JSON.stringify({
      success: false,
      error: message,
      meta: {
        timestamp: new Date().toISOString(),
      },
    }, null, 2));
  } else {
    console.error(chalk.red(message));
  }
  process.exit(exitCode);
}

/**
 * Print success with data
 */
export function printSuccess<T>(data?: T, message?: string): void {
  if (jsonMode) {
    console.log(JSON.stringify({
      success: true,
      data,
      message,
      meta: {
        timestamp: new Date().toISOString(),
      },
    }, null, 2));
  } else {
    if (message) {
      console.log(chalk.green(message));
    }
    if (data) {
      console.log(data);
    }
  }
}

/**
 * Create a result object
 */
export function createResult<T>(success: boolean, data?: T, message?: string, error?: string): OutputResult<T> {
  return {
    success,
    data,
    message,
    error,
    meta: {
      timestamp: new Date().toISOString(),
      command: process.argv.slice(2).join(' '),
    },
  };
}
