// Jest config for the 30 Acts app. The jest-expo preset supplies the correct
// Babel transform AND its own comprehensive transformIgnorePatterns (which cover
// expo-modules-core, react-native, etc.) — so we do NOT override that here.
module.exports = {
  preset: 'jest-expo',
  // Only run our own tests, not anything inside node_modules.
  testMatch: ['**/__tests__/**/*.test.js'],
};
