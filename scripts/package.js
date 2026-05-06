#!/usr/bin/env node
/**
 * Package dops CLI for distribution
 * Creates a ready-to-distribute archive
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function main() {
  console.log('📦 Packaging dops CLI for distribution...\n');

  // Ensure built
  try {
    await fs.access(path.join(rootDir, 'dist', 'main.js'));
  } catch {
    console.log('Building...');
    execSync('pnpm run build', { cwd: rootDir, stdio: 'inherit' });
  }

  const version = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8')).version;
  const platform = os.platform();
  const arch = os.arch();
  const packageName = `dops-${version}-${platform}-${arch}`;
  const packageDir = path.join(rootDir, 'dist-package', packageName);

  // Clean and create package directory
  await fs.rm(path.join(rootDir, 'dist-package'), { recursive: true, force: true });
  await fs.mkdir(packageDir, { recursive: true });

  // Copy files
  console.log('Copying files...');
  
  // Main files
  await fs.mkdir(path.join(packageDir, 'dist'), { recursive: true });
  await fs.copyFile(
    path.join(rootDir, 'dist', 'main.js'),
    path.join(packageDir, 'dist', 'main.js')
  );
  
  // Source map (optional but helpful)
  try {
    await fs.copyFile(
      path.join(rootDir, 'dist', 'main.js.map'),
      path.join(packageDir, 'dist', 'main.js.map')
    );
  } catch {}

  // Wrapper scripts
  if (platform === 'win32') {
    await fs.copyFile(
      path.join(rootDir, 'dops.cmd'),
      path.join(packageDir, 'dops.cmd')
    );
  } else {
    await fs.copyFile(
      path.join(rootDir, 'dops.sh'),
      path.join(packageDir, 'dops')
    );
    // Make executable on Unix
    if (platform !== 'win32') {
      execSync(`chmod +x "${path.join(packageDir, 'dops')}"`);
    }
  }

  // Documentation
  await fs.copyFile(
    path.join(rootDir, 'README.md'),
    path.join(packageDir, 'README.md')
  );

  // Copy install scripts
  if (platform === 'win32') {
    await fs.copyFile(
      path.join(rootDir, 'install.ps1'),
      path.join(packageDir, 'install.ps1')
    );
  } else {
    await fs.copyFile(
      path.join(rootDir, 'install.sh'),
      path.join(packageDir, 'install.sh')
    );
    execSync(`chmod +x "${path.join(packageDir, 'install.sh')}"`);
  }

  // Create quick start script
  const quickStart = platform === 'win32' 
    ? `@echo off
echo ========================================
echo    Dops CLI Quick Start
echo ========================================
echo.
echo Usage:
echo   .\dops.cmd --help       Show help
echo   .\dops.cmd              Enter REPL mode
echo   .\dops.cmd skill list   List skills
echo.
echo Or run install.ps1 to add to PATH
echo ========================================
`
    : `#!/bin/bash
echo "========================================"
echo "   Dops CLI Quick Start"
echo "========================================"
echo ""
echo "Usage:"
echo "  ./dops --help       Show help"
echo "  ./dops              Enter REPL mode"
echo "  ./dops skill list   List skills"
echo ""
echo "Or run: sudo ./install.sh"
echo "========================================"
`;

  await fs.writeFile(
    path.join(packageDir, platform === 'win32' ? 'START.bat' : 'START.sh'),
    quickStart
  );
  if (platform !== 'win32') {
    execSync(`chmod +x "${path.join(packageDir, 'START.sh')}"`);
  }

  // Create archive
  console.log('Creating archive...');
  
  let archiveName;
  if (platform === 'win32') {
    archiveName = `${packageName}.zip`;
    execSync(`powershell Compress-Archive -Path "${packageDir}\\*" -DestinationPath "${path.join(rootDir, 'dist-package', archiveName)}"`, {
      cwd: rootDir
    });
  } else {
    archiveName = `${packageName}.tar.gz`;
    execSync(`tar -czf "${archiveName}" "${packageName}"`, {
      cwd: path.join(rootDir, 'dist-package')
    });
  }

  console.log(`\n✅ Package created: dist-package/${archiveName}`);
  console.log(`\nDistribution package contents:`);
  console.log(`  - dops${platform === 'win32' ? '.cmd' : ''}  (wrapper script)`);
  console.log(`  - dist/main.js  (compiled CLI)`);
  console.log(`  - README.md`);
  console.log(`  - install${platform === 'win32' ? '.bat' : '.sh'}`);
  console.log(`\nUsers can extract and run:`);
  if (platform === 'win32') {
    console.log(`  dops.cmd --help`);
  } else {
    console.log(`  ./dops --help`);
  }
}

main().catch(error => {
  console.error('Packaging failed:', error);
  process.exit(1);
});
