/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};

    // @wagmi/connectors lazily imports several optional SDKs.
    // Alias each one to `false` so Webpack treats them as empty modules
    // instead of failing the build. Also alias react-native-async-storage.
    const optionalDeps = [
      "porto",
      "porto/internal",
      "@base-org/account",
      "@coinbase/wallet-sdk",
      "@metamask/sdk",
      "@safe-global/safe-apps-sdk",
      "@safe-global/safe-apps-provider",
      "@walletconnect/ethereum-provider",
      "@react-native-async-storage/async-storage"
    ];

    for (const dep of optionalDeps) {
      config.resolve.alias[dep] = false;
    }

    return config;
  }
};

module.exports = nextConfig;
