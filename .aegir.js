/** @type {import('aegir').PartialOptions} */
export default {
  dependencyCheck: {
    ignore: [
      'dotenv',
      'typescript',
      'wait-on',
      'pino-pretty' // implicit dependency for fastify logging
    ],
    productionIgnorePatterns: [
      '.aegir.js',
      'playwright.config.ts',
      'scripts/**',
      'e2e-tests/**'
    ]
  }
}
