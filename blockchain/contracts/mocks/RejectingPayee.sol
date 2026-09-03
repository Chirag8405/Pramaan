// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IArtisanRegistryForMock {
    function registerArtisan(string calldata name, string calldata craft, string calldata giRegion, uint8 legacyCraftScore)
        external;
}

interface IProductRegistryForMock {
    function registerProduct(
        bytes32 hash,
        string calldata cid,
        string calldata name,
        string calldata giTag,
        bytes32 metadataHash,
        address provenanceSigner,
        bytes calldata deviceSignature,
        uint256 lat,
        uint256 lng
    ) external;

    function transferProduct(bytes32 hash, address newOwner) external payable;
}

/// @title RejectingPayee
/// @notice Test-only mock with no receive()/payable fallback, so any plain ETH transfer
/// to it fails. Used to exercise ProductRegistry.transferProduct's payment-failure
/// require branches (royalty payment failing, and separately, seller payout failing),
/// which no EOA-only test setup can trigger. Deliberately has no receive()/fallback at
/// all, rather than one that explicitly reverts, since the effect on a plain-value
/// .call{value: ...}("") is identical (call returns success = false either way) and
/// omitting it is the smaller, more obviously-correct contract.
///
/// Thin pass-throughs let this contract act as either:
///  - the ORIGINAL ARTISAN (product.artisan) by calling registerProduct itself, so it
///    becomes msg.sender at registration time and later receives the royalty payout, or
///  - the CURRENT OWNER/SELLER (msg.sender inside transferProduct) by calling
///    transferProduct itself, so it later receives the seller payout.
/// Each test isolates one branch by using this mock for only one role at a time and a
/// normal EOA for the other, so a normal EOA payment succeeding proves that branch is
/// unaffected while the mock's branch is the one that reverts.
contract RejectingPayee is IERC721Receiver {
    // registerArtisan mints a soulbound ERC-721 via _safeMint, which requires the
    // recipient (this contract, when it registers as artisan) to implement
    // IERC721Receiver. This has nothing to do with the payment-rejection behavior this
    // mock exists for — it's a separate, unavoidable requirement of being a contract
    // that owns an ERC-721 minted via _safeMint.
    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function registerAsArtisan(
        address artisanRegistry,
        string calldata name,
        string calldata craft,
        string calldata giRegion
    ) external {
        IArtisanRegistryForMock(artisanRegistry).registerArtisan(name, craft, giRegion, 0);
    }

    function registerProductAsArtisan(
        address productRegistry,
        bytes32 hash,
        string calldata cid,
        string calldata name,
        string calldata giTag,
        bytes32 metadataHash,
        address provenanceSigner,
        bytes calldata deviceSignature,
        uint256 lat,
        uint256 lng
    ) external {
        IProductRegistryForMock(productRegistry).registerProduct(
            hash,
            cid,
            name,
            giTag,
            metadataHash,
            provenanceSigner,
            deviceSignature,
            lat,
            lng
        );
    }

    function transferProductAsSeller(address productRegistry, bytes32 hash, address newOwner) external payable {
        IProductRegistryForMock(productRegistry).transferProduct{value: msg.value}(hash, newOwner);
    }
}
