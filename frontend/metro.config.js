const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Force Metro à utiliser les polyfills pour les modules Node.js
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: require.resolve('crypto-browserify'),
  stream: require.resolve('stream-browserify'),
  buffer: require.resolve('buffer'),
  process: require.resolve('process/browser'),
  events: require.resolve('events'),
};

// FIX: Exclure le dossier android et les fichiers temporaires de build
// Cela évite les erreurs ENOENT sur Windows quand Gradle compile
config.resolver.blockList = [
  /android\/.*/,
  /ios\/.*/,
  /node_modules\/.*\/android\/.*/,
  /node_modules\/.*\/ios\/.*/,
];

module.exports = config;
