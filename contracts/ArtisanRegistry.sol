// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract ArtisanRegistry is ERC721 {
    using Counters for Counters.Counter;

    struct ArtisanRecord {
        address wallet;
        string name;
        string craft;
        string giRegion;
        uint8 craftScore;
        uint256 registeredAt;
        bool verified;
    }

    Counters.Counter private _tokenIds;

    mapping(address => ArtisanRecord) public artisans;
    mapping(address => uint256) public artisanTokenId;

    event ArtisanRegistered(address indexed artisan, string craft, uint8 craftScore);

    constructor() ERC721("pramaan Artisan SBT", "PASBT") {}

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
        if (from != address(0)) {
            revert("Soulbound: non-transferable token");
        }
    }

    function registerArtisan(
        string calldata name,
        string calldata craft,
        string calldata giRegion,
        uint8 craftScore
    ) external {
        require(craftScore >= 60, "AI gate: craft score too low");
        require(artisans[msg.sender].registeredAt == 0, "Artisan already registered");

        artisans[msg.sender] = ArtisanRecord({
            wallet: msg.sender,
            name: name,
            craft: craft,
            giRegion: giRegion,
            craftScore: craftScore,
            registeredAt: block.timestamp,
            verified: true
        });

        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        artisanTokenId[msg.sender] = newTokenId;
        _safeMint(msg.sender, newTokenId);

        emit ArtisanRegistered(msg.sender, craft, craftScore);
    }

    function isVerifiedArtisan(address wallet) public view returns (bool) {
        return artisans[wallet].verified;
    }

    function getArtisan(address wallet) public view returns (ArtisanRecord memory) {
        return artisans[wallet];
    }
}