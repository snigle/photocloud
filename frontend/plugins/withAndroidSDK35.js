const { withGradleProperties, withAppBuildGradle, withProjectBuildGradle } = require('@expo/config-plugins');

const withAndroidSDK35 = (config) => {
  return withGradleProperties(config, (config) => {
    config.modResults.push({
      type: 'property',
      key: 'android.suppressUnsupportedCompileSdk',
      value: '35',
    });
    // Fix Kotlin binary metadata mismatch (e.g. 2.1.0 vs 1.9.0)
    config.modResults.push({
        type: 'property',
        key: 'kotlin.code.style',
        value: 'official',
    });
    // This property might help with Kotlin metadata mismatch errors in some AGP versions
    config.modResults.push({
        type: 'property',
        key: 'kotlin.incremental',
        value: 'false',
    });
    return config;
  });
};

const withKotlinCompilerArgs = (config) => {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.contents.includes('allprojects')) {
      config.modResults.contents = config.modResults.contents.replace(
        /allprojects\s*{/,
        'allprojects {\n    tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).all {\n        kotlinOptions {\n            freeCompilerArgs += ["-Xskip-metadata-version-check"]\n        }\n    }'
      );
    }
    return config;
  });
};

module.exports = (config) => {
  config = withAndroidSDK35(config);
  config = withKotlinCompilerArgs(config);
  return config;
};
