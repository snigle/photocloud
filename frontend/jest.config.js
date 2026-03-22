module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(expo|@expo|expo-file-system|expo-asset|expo-constants|expo-modules-core|react-native|@react-native|@react-navigation|@react-native-community|lucide-react-native)/)',
  ],
};
