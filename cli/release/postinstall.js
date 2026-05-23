#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')

const binaryPath = path.join(
  os.homedir(),
  '.config',
  'icecode',
  process.platform === 'win32' ? 'icecode.exe' : 'icecode',
)
const metadataPath = path.join(os.homedir(), '.config', 'icecode', 'icecode-metadata.json')

try {
  fs.unlinkSync(binaryPath)
} catch (e) {
  /* ignore if file doesn't exist */
}

try {
  fs.unlinkSync(metadataPath)
} catch (e) {
  /* ignore if file doesn't exist */
}

console.log('')
console.log('Icecode installed.')
console.log('')
console.log('开始使用:')
console.log('  1. 进入项目目录')
console.log('  2. 运行: icecode')
console.log('')
console.log('示例:')
console.log('  $ cd ~/my-project')
console.log('  $ icecode')
console.log('')
console.log('项目地址: https://github.com/IceCoder1994/icecode')
console.log('')
