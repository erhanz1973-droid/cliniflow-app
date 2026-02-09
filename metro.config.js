const { getDefaultConfig } = require('metro-config');

module.exports = (async () => {
  const config = await getDefaultConfig();

  // Add fetch polyfill for React Native
  config.resolver = {
    alias: {
      'whatwg-fetch': 'react-native/Libraries/NetworkRequest.js',
    },
  };

  return config;
})();
