const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Force Metro à utiliser crypto-browserify pour 'crypto'
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: require.resolve('crypto-browserify'),
  stream: require.resolve('stream-browserify'),
};

module.exports = config;