require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("dotenv").config();

module.exports = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            },
            viaIR: true
        }
    },
    networks: {
        sepolia: {
            chainId: 11155111,
            url: process.env.ALCHEMY_SEPOLIA_URL || "",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
        }
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY || ""
    },
    gasReporter: {
        // Enabled by default on every `npm run test` — no env flag required. Uses the
        // plugin's built-in gas price default rather than a hardcoded gwei value: this
        // report is for comparing relative gas cost across functions during development,
        // not forecasting a real deployment budget, so a hardcoded price would just be a
        // number that goes stale the moment real gas prices move, with no benefit here.
        enabled: true,
        currency: "USD",
        excludeContracts: []
    }
};