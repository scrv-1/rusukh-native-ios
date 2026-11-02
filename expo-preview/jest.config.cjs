module.exports = {
  preset: 'jest-expo/ios',
  testMatch: ['**/tests/*.ui.test.jsx'],
  clearMocks: true,
  testTimeout: 15000, // Cold React Native initialization on the small Codespaces runner.
};
