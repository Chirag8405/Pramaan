const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  // Both packages break when webpack bundles them into the /api/verify-aadhaar route
  // handler instead of leaving them as native Node requires:
  // - @anon-aadhaar/core (via snarkjs/web-worker) uses environment-dependent dynamic
  //   requires webpack can't statically bundle ("Critical dependency: the request of a
  //   dependency is an expression").
  // - ethers resolves its own package.json "browser" field remap under webpack, which
  //   swaps its real Node http/https transport for a fetch()-based one carrying
  //   browser-only RequestInit fields (mode/credentials/referrer) that break POST
  //   requests with a body under Node's fetch (observed as "missing response" /
  //   SERVER_ERROR on every JSON-RPC call).
  // Externalizing both makes Node's native require resolve them at runtime instead,
  // matching how they already run when used directly outside of webpack.
  serverExternalPackages: ["@anon-aadhaar/core", "ethers"],
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

    // Suppress known warning from @anon-aadhaar dependency chain.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /web-worker[\\/]cjs[\\/]node\.js$/,
        message: /Critical dependency: the request of a dependency is an expression/
      }
    ];

    return config;
  }
};

module.exports = nextConfig;
