// Mirrors DynamicRoyalty._sqrt and ._royaltyBpsForTransfer exactly, using BigInt
// throughout so there is no floating-point divergence from Solidity's integer math.
// Do not replace this with Math.sqrt: at values where 4000/root's rounding hinges on
// root being off by one, a float-based sqrt could silently mask a contract bug.

const TAPER_BPS = [
    4000n, 2800n, 2300n, 2000n, 1700n, 1600n, 1500n, 1400n, 1300n, 1200n, 1150n, 1100n, 1060n, 1030n, 1000n
];

function sqrtBigInt(x) {
    x = BigInt(x);
    if (x === 0n) {
        return 0n;
    }
    let z = (x + 1n) / 2n;
    let y = x;
    while (z < y) {
        y = z;
        z = (x / z + z) / 2n;
    }
    return y;
}

function royaltyBpsForTransfer(transferId) {
    transferId = BigInt(transferId);
    if (transferId <= 0n) {
        throw new Error("transferId must be >= 1");
    }
    if (transferId <= 15n) {
        return TAPER_BPS[Number(transferId) - 1];
    }
    const root = sqrtBigInt(transferId);
    if (root === 0n) {
        return 0n;
    }
    return 4000n / root;
}

module.exports = { sqrtBigInt, royaltyBpsForTransfer, TAPER_BPS };
