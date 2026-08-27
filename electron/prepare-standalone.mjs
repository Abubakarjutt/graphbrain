import { cpSync, existsSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const standaloneDir = path.join(root, '.next', 'standalone')

if (!existsSync(standaloneDir)) {
  throw new Error('.next/standalone not found — did next build run with output: "standalone" configured?')
}

cpSync(path.join(root, '.next', 'static'), path.join(standaloneDir, '.next', 'static'), { recursive: true })
cpSync(path.join(root, 'public'), path.join(standaloneDir, 'public'), { recursive: true })

console.log('Copied .next/static and public/ into .next/standalone for the Electron build.')
