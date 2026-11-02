const path = require('path');
module.exports = { rootDir: path.resolve(__dirname, '../../../..'), preset: 'jest-expo/ios', testMatch: ['<rootDir>/docs/research/devils-audit-20261103/access-evidence/*.ui.test.jsx'], clearMocks: true, testTimeout: 15000 };
