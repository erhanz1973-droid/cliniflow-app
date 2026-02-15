const { getDefaultConfig } = require('expo/metro-config');

module.exports = (async () => {
  const config = await getDefaultConfig(__dirname);

  // Add fetch polyfill for React Native Web
  config.resolver = {
    alias: {
      'whatwg-fetch': 'react-native/Libraries/NetworkRequest.js',
    },
  };

  return config;
})();
