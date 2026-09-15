const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser', fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:8080', headless: true, channel: 'chrome' },
  webServer: { command: 'node tests/server.cjs', url: 'http://127.0.0.1:8080', reuseExistingServer: false },
  projects: [{ name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } }, { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }]
});
