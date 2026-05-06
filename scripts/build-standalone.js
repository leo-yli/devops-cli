#!/usr/bin/env node
/**
 * Build standalone executable for dops CLI
 * Creates a single executable file using Node.js single-executable application feature
 * or falls back to pkg/nexe if available
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Configuration
const config = {
  name: 'dops',
  version: '0.1.0',
  nodeVersion: '20.13.0',
  entryPoint: path.join(rootDir, 'dist', 'main.js'),
  outputDir: path.join(rootDir, 'bin'),
  // Platforms to build for
  platforms: ['win', 'macos', 'linux'],
};

async function main() {
  console.log('🔨 Building standalone executable for dops CLI...\n');

  // Ensure dist exists
  try {
    await fs.access(config.entryPoint);
  } catch {
    console.log('⚠️  dist/main.js not found, running build...');
    execSync('pnpm run build', { cwd: rootDir, stdio: 'inherit' });
  }

  // Create output directory
  await fs.mkdir(config.outputDir, { recursive: true });

  // Try different build methods in order of preference
  const buildMethods = [
    { name: 'sea', build: buildWithSEA },
    { name: 'pkg', build: buildWithPkg },
    { name: 'nexe', build: buildWithNexe },
  ];

  for (const method of buildMethods) {
    try {
      console.log(`\n📦 Trying build method: ${method.name}`);
      await method.build();
      console.log(`\n✅ Built successfully using ${method.name}`);
      return;
    } catch (error) {
      console.log(`  ❌ ${method.name} failed: ${error.message}`);
    }
  }

  console.log('\n❌ All build methods failed.');
  console.log('\nFallback: Use the wrapper scripts:');
  console.log('  - Windows: .\\dops.cmd');
  console.log('  - Unix: ./dops.sh');
  console.log('\nOr install globally: pnpm install -g .');
  process.exit(1);
}

/**
 * Build using Node.js Single Executable Application (SEA)
 * Node.js 20+ feature
 */
async function buildWithSEA() {
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  
  if (majorVersion < 20) {
    throw new Error(`Node.js 20+ required for SEA, found ${nodeVersion}`);
  }

  const seaConfigPath = path.join(config.outputDir, 'sea-config.json');
  const seaBlobPath = path.join(config.outputDir, 'dops.blob');
  const nodeExePath = path.join(config.outputDir, `node${process.platform === 'win32' ? '.exe' : ''}`);

  // Create SEA config
  const seaConfig = {
    main: config.entryPoint,
    output: seaBlobPath,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: true,
    assets: {}
  };

  await fs.writeFile(seaConfigPath, JSON.stringify(seaConfig, null, 2));

  // Generate the blob
  console.log('  Generating SEA blob...');
  execSync(`node --experimental-sea-config "${seaConfigPath}"`, {
    cwd: rootDir,
    stdio: 'inherit'
  });

  // Copy Node.js binary
  console.log('  Copying Node.js binary...');
  const originalNodePath = process.execPath;
  await fs.copyFile(originalNodePath, nodeExePath);

  // Inject the blob into the binary
  console.log('  Injecting blob into executable...');
  
  if (process.platform === 'win32') {
    // Windows: use postject
    try {
      execSync(`npx postject "${nodeExePath}" NODE_SEA_BLOB "${seaBlobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA`, {
        cwd: rootDir,
        stdio: 'inherit'
      });
    } catch {
      throw new Error('postject not available, try: npm install -g postject');
    }
  } else if (process.platform === 'darwin') {
    // macOS: remove signature first, then postject, then re-sign
    execSync(`codesign --remove-signature "${nodeExePath}"`, { stdio: 'ignore' });
    execSync(`npx postject "${nodeExePath}" NODE_SEA_BLOB "${seaBlobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA`, {
      cwd: rootDir,
      stdio: 'inherit'
    });
    execSync(`codesign --sign - "${nodeExePath}"`, { stdio: 'ignore' });
  } else {
    // Linux
    execSync(`npx postject "${nodeExePath}" NODE_SEA_BLOB "${seaBlobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA`, {
      cwd: rootDir,
      stdio: 'inherit'
    });
  }

  // Rename to final output
  const outputPath = path.join(config.outputDir, `dops${process.platform === 'win32' ? '.exe' : ''}`);
  await fs.rename(nodeExePath, outputPath);

  // Clean up
  await fs.unlink(seaConfigPath).catch(() => {});
  await fs.unlink(seaBlobPath).catch(() => {});

  console.log(`\n✅ Standalone executable created: ${outputPath}`);
  
  // Show file size
  const stats = await fs.stat(outputPath);
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

/**
 * Build using pkg
 */
async function buildWithPkg() {
  try {
    execSync('pkg --version', { stdio: 'ignore' });
  } catch {
    throw new Error('pkg not installed, try: npm install -g pkg');
  }

  console.log('  Building with pkg...');
  
  const pkgConfig = {
    pkg: {
      scripts: ['dist/**/*.js'],
      assets: [],
      targets: [`node${config.nodeVersion}-${getPlatformTarget()}`],
      outputPath: config.outputDir
    }
  };

  const pkgConfigPath = path.join(rootDir, 'package.json');
  const originalContent = await fs.readFile(pkgConfigPath, 'utf-8');
  
  try {
    // Merge with existing package.json
    const existingConfig = JSON.parse(originalContent);
    const mergedConfig = { ...existingConfig, ...pkgConfig };
    await fs.writeFile(pkgConfigPath, JSON.stringify(mergedConfig, null, 2));

    execSync('pkg . --compress GZip', {
      cwd: rootDir,
      stdio: 'inherit'
    });
  } finally {
    // Restore original package.json
    await fs.writeFile(pkgConfigPath, originalContent);
  }
}

/**
 * Build using nexe
 */
async function buildWithNexe() {
  try {
    execSync('nexe --version', { stdio: 'ignore' });
  } catch {
    throw new Error('nexe not installed, try: npm install -g nexe');
  }

  console.log('  Building with nexe...');
  
  const outputFile = path.join(config.outputDir, `dops${process.platform === 'win32' ? '.exe' : ''}`);
  
  execSync(`nexe "${config.entryPoint}" -o "${outputFile}" --target ${config.nodeVersion}`, {
    cwd: rootDir,
    stdio: 'inherit'
  });
}

function getPlatformTarget() {
  const platformMap = {
    'win32': 'win-x64',
    'darwin': 'macos-x64',
    'linux': 'linux-x64'
  };
  return platformMap[process.platform] || 'win-x64';
}

// Run
main().catch(error => {
  console.error('Build failed:', error);
  process.exit(1);
});
