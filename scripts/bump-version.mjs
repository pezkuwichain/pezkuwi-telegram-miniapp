#!/usr/bin/env node
/**
 * Auto-increment version on each build
 * Usage: node scripts/bump-version.js [major|minor|patch]
 * Default: patch
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagePath = path.resolve(__dirname, '../package.json');

// Read package.json
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

// Parse current version
const [major, minor, patch] = pkg.version.split('.').map(Number);

// Determine bump type from argument
const bumpType = process.argv[2] || 'patch';

let newVersion;
switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

// Add build timestamp for cache busting
const buildTime = new Date().toISOString();

// Update package.json
pkg.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

// Write version info to a separate file for the app
const versionInfo = {
  version: newVersion,
  buildTime,
  buildNumber: Date.now(),
};

const versionFilePath = path.resolve(__dirname, '../src/version.json');
fs.writeFileSync(versionFilePath, JSON.stringify(versionInfo, null, 2) + '\n');

console.log(`✓ Version bumped: ${major}.${minor}.${patch} → ${newVersion}`);
console.log(`✓ Build time: ${buildTime}`);
