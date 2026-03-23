/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};

    // MetaMask SDK references this react-native storage package on web builds.
    // We do not use that code path in this app, so alias it out.
    config.resolve.alias["@react-native-async-storage/async-storage"] = false;

    return config;
  }
};

module.exports = nextConfig;
