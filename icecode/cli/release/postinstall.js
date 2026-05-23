#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

// Clean up old binary to force fresh download on next launch
const binaryPath = path.join(
  os.homedir(),
  '.config',
  'icecode',
  process.platform === 'win32' ? 'icecode.exe' : 'icecode'
);

try {
  fs.unlinkSync(binaryPath);
} catch (e) {
  /* ignore if file doesn't exist */
}

console.log('\n');
console.log('⚡ Welcome to icecode!');
console.log('\n');
console.log('To get started:');
console.log('  1. cd to your project directory');
console.log('  2. Run: icecode');
console.log('\n');
console.log('Example:');
console.log('  $ cd ~/my-project');
console.log('  $ icecode');
console.log('\n');
console.log('For more information, visit: https://github.com/IceCoder1994/icecode');
console.log('\n');
