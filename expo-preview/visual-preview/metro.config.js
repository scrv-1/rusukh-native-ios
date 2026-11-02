const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const parent = path.resolve(__dirname, '..');
config.watchFolders = [parent];
config.resolver.nodeModulesPaths = [path.join(parent, 'node_modules')];

module.exports = config;
