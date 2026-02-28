const { withGradleProperties } = require('@expo/config-plugins');

const withAndroidSDK35 = (config) => {
  return withGradleProperties(config, (config) => {
    config.modResults.push({
      type: 'property',
      key: 'android.suppressUnsupportedCompileSdk',
      value: '35',
    });
    return config;
  });
};

module.exports = withAndroidSDK35;
