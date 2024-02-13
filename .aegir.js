/** @type {import('aegir').PartialOptions} */
export default {
  dependencyCheck: {
    ignore: [
      'dotenv',
      'typescript',
      'wait-on'
    ],
    productionIgnorePatterns: [
      '.aegir.js',
      'playwright.config.ts',
      'scripts/**',
      'e2e-tests/**'
    ]
  }
}
