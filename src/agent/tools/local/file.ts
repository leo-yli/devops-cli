/**
 * File operation tools
 */
import fs from 'fs/promises';
import path from 'path';

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
}

export async function executeFileRead(args: { path: string }): Promise<{ content: string }> {
  const content = await fs.readFile(args.path, 'utf-8');
  return { content };
}

export async function executeFileWrite(args: { path: string; content: string }): Promise<void> {
  await fs.writeFile(args.path, args.content, 'utf-8');
}

export async function executeDirectoryList(args: { path: string }): Promise<{ entries: FileEntry[] }> {
  const entries = await fs.readdir(args.path, { withFileTypes: true });
  return {
    entries: entries.map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'directory' : 'file',
    })),
  };
}

export async function executeGrep(args: { 
  pattern: string; 
  path: string; 
  recursive?: boolean;
}): Promise<{ matches: Array<{ file: string; line: number; content: string }> }> {
  const { glob } = await import('glob');
  const matches: Array<{ file: string; line: number; content: string }> = [];
  
  const files = await glob('**/*', { cwd: args.path, nodir: true });
  
  for (const file of files.slice(0, 100)) { // Limit to prevent hanging
    try {
      const content = await fs.readFile(path.join(args.path, file), 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes(args.pattern)) {
          matches.push({ file, line: idx + 1, content: line.trim() });
        }
      });
    } catch {
      // Skip files that can't be read
    }
  }
  
  return { matches };
}
