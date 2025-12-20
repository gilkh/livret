declare module 'supertest' {
  const request: any
  export default request
}

declare module '@playwright/test'

declare module 'mongodb-memory-server'

// Provide minimal jest globals to satisfy TS when @types/jest is not installed
declare global {
  var describe: (name: string, fn: () => void) => void
  var it: (name: string, fn: () => void | Promise<void>) => void
  var beforeAll: (fn: () => void | Promise<void>) => void
  var afterAll: (fn: () => void | Promise<void>) => void
  var beforeEach: (fn: () => void | Promise<void>) => void
  var expect: any
}

export {}
