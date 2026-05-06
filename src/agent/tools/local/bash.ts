/**
 * Bash command execution tool
 */

export interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function executeBash(args: { 
  command: string; 
  timeout?: number;
  cwd?: string;
}): Promise<BashResult> {
  const { spawn } = await import('child_process');
  const { promisify } = await import('util');
  
  return new Promise((resolve, reject) => {
    const child = spawn('cmd', ['/c', args.command], {
      cwd: args.cwd,
      shell: true,
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timeout after ${args.timeout || 60000}ms`));
    }, args.timeout || 60000);
    
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0,
      });
    });
    
    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
