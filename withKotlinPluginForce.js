const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withKotlinPluginForce(config) {
  return withProjectBuildGradle(config, async config => {
    if (config.modResults.language === 'groovy') {
      config.modResults.contents = config.modResults.contents.replace(
        /classpath\('org\.jetbrains\.kotlin:kotlin-gradle-plugin'\)/g,
        'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20")'
      );
      
      if (!config.modResults.contents.includes('configurations.all {')) {
        config.modResults.contents = config.modResults.contents.replace(
          /dependencies\s*{[^}]*}/,
          match => `${match}\n  configurations.all {\n    resolutionStrategy {\n      force("org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20")\n      force("org.jetbrains.kotlin:kotlin-gradle-plugin-api:2.1.20")\n    }\n  }`
        );
      }
    }
    return config;
  });
};
