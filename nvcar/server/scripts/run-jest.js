#!/usr/bin/env node
const { runCLI } = require('jest')
const argv = require('minimist')(process.argv.slice(2))

async function main() {
  const pattern = argv.pattern || argv.p || argv._[0] || 'server/src/__tests__/integration'
  console.log('Running jest for pattern:', pattern)
  const result = await runCLI({ testPathPattern: [pattern], runInBand: true, testTimeout: 30000 }, [process.cwd()])
  if (!result.results.success) process.exit(1)
}

main().catch(err => { console.error(err); process.exit(2) })
