const { getDefaultConfig } = require('metro-config');

module.exports = (async () => {
  const config = await getDefaultConfig();

  // Add fetch polyfill for React Native
  config.resolver = {
    alias: {
      'whatwg-fetch': 'react-native/Libraries/NetworkRequest.js',
    },
    assetExts: [...config.resolver.assetExts, 'jpg', 'jpeg', 'png', 'svg'],
  };

  return config;
})();
