import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function trimFile(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim();
}

function resolveElectronPaths() {
  let packageJsonPath;
  try {
    packageJsonPath = require.resolve('electron/package.json');
  } catch (error) {
    console.error('[ensure-electron] The `electron` package is not installed in firefly-simulator/node_modules.');
    console.error('[ensure-electron] Run `npm install` in firefly-simulator before starting the simulator.');
    throw error;
  }
  const electronDir = path.dirname(packageJsonPath);
  const packageJson = readJson(packageJsonPath);
  const pathFile = path.join(electronDir, 'path.txt');
  const installScript = path.join(electronDir, 'install.js');
  const distDir = path.join(electronDir, 'dist');
  const versionFile = path.join(distDir, 'version');
  return {
    electronDir,
    version: packageJson.version,
    pathFile,
    installScript,
    versionFile,
  };
}

function isElectronRuntimeReady(paths) {
  if (!fs.existsSync(paths.pathFile) || !fs.existsSync(paths.versionFile)) {
    return false;
  }
  const executablePath = trimFile(paths.pathFile);
  const installedVersion = trimFile(paths.versionFile).replace(/^v/, '');
  if (!executablePath || installedVersion !== paths.version) {
    return false;
  }
  return fs.existsSync(path.join(paths.electronDir, 'dist', executablePath));
}

function ensureElectron() {
  const paths = resolveElectronPaths();
  if (isElectronRuntimeReady(paths)) {
    console.log(`[ensure-electron] Electron ${paths.version} runtime ready.`);
    return;
  }

  console.log('[ensure-electron] Electron runtime missing or incomplete, reinstalling local binary...');
  try {
    execFileSync(process.execPath, [paths.installScript], {
      cwd: paths.electronDir,
      stdio: 'inherit',
      env: process.env,
    });
  } catch (error) {
    console.error('[ensure-electron] Electron binary installation failed.');
    console.error('[ensure-electron] Check network access, then rerun `npm install` or `npm run ensure:electron` in firefly-simulator.');
    throw error;
  }

  if (!isElectronRuntimeReady(paths)) {
    throw new Error('Electron runtime is still incomplete after reinstall.');
  }

  console.log(`[ensure-electron] Electron ${paths.version} runtime installed.`);
}

ensureElectron();
