#!/usr/bin/env bun

/**
 * icecode CLI build script.
 *
 * Wraps the existing CLI build-binary.ts with FREEBUFF_MODE=true
 * to produce an icecode variant of the Codebuff CLI.
 *
 * Usage:
 *   bun icecode/cli/build.ts <version>
 *
 * Example:
 *   bun icecode/cli/build.ts 1.0.0
 *
 * Environment variables (all optional, with sensible defaults):
 *   NEXT_PUBLIC_CB_ENVIRONMENT   Build environment (dev|test|prod, default: prod)
 *   NEXT_PUBLIC_CODEBUFF_APP_URL App URL (default: https://icecode.com)
 *   NEXT_PUBLIC_SUPPORT_EMAIL    Support email (default: support@icecode.com)
 *   NEXT_PUBLIC_WEB_PORT         Web port (default: 3000)
 *   All other NEXT_PUBLIC_* vars can be overridden via process.env
 */

import { spawnSync } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..')

const version = process.argv[2]
if (!version) {
  console.error('Usage: bun icecode/cli/build.ts <version>')
  process.exit(1)
}

function getDefaultBuildEnv(): Record<string, string> {
  const env = process.env.NEXT_PUBLIC_CB_ENVIRONMENT ?? 'prod'

  return {
    NEXT_PUBLIC_CB_ENVIRONMENT: env,
    NEXT_PUBLIC_CODEBUFF_APP_URL:
      process.env.NEXT_PUBLIC_CODEBUFF_APP_URL ?? 'https://icecode.com',
    NEXT_PUBLIC_SUPPORT_EMAIL:
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@icecode.com',
    NEXT_PUBLIC_POSTHOG_API_KEY:
      process.env.NEXT_PUBLIC_POSTHOG_API_KEY ?? 'phc_placeholder',
    NEXT_PUBLIC_POSTHOG_HOST_URL:
      process.env.NEXT_PUBLIC_POSTHOG_HOST_URL ?? 'https://app.posthog.com',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? 'pk_test_placeholder',
    NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL:
      process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL ??
      'https://example.com/portal',
    NEXT_PUBLIC_WEB_PORT:
      process.env.NEXT_PUBLIC_WEB_PORT ?? '3000',
  }
}

console.log(`Building icecode v${version}...`)
console.log(`  Environment: ${process.env.NEXT_PUBLIC_CB_ENVIRONMENT ?? 'prod'}`)

const buildEnv: Record<string, string | undefined> = {
  ...process.env,
  FREEBUFF_MODE: 'true',
  ...getDefaultBuildEnv(),
}

const result = spawnSync(
  'bun',
  ['cli/scripts/build-binary.ts', 'icecode', version],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: buildEnv as NodeJS.ProcessEnv,
  },
)

if (result.status !== 0) {
  console.error('icecode build failed')
  process.exit(result.status ?? 1)
}

console.log(`✅ icecode v${version} built successfully`)
