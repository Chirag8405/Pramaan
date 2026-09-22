// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IDynamicRoyaltyEscrow {
    function originalMinter(uint256 tokenId) external view returns (address);

    function processSecondarySale(uint256 tokenId, address payable seller)
        external
        payable
        returns (uint256 artisanAmount, uint256 sellerAmount);
}

/// @title EscrowMarketplace
/// @notice Holds buyer payment in escrow and releases it after delivery confirmation.
contract EscrowMarketplace is Ownable, ReentrancyGuard {
    enum EscrowStatus {
        None,
        Created,
        Shipped,
        Completed,
        Refunded,
        Disputed,
        Resolved
    }

    struct Escrow {
        uint256 id;
        uint256 tokenId;
        address buyer;
        address seller;
        uint256 salePrice;
        uint256 createdAt;
        uint256 shippedAt;
        uint256 shippingDeadline;
        uint256 confirmDeadline;
        EscrowStatus status;
        string disputeReason;
    }

    IERC721 public immutable productNft;
    IDynamicRoyaltyEscrow public immutable royaltyEngine;

    uint256 public immutable shippingWindowSec;
    uint256 public immutable confirmWindowSec;

    uint256 public escrowCount;
    mapping(uint256 => Escrow) public escrows;

    event EscrowCreated(
        uint256 indexed escrowId,
        uint256 indexed tokenId,
        address indexed buyer,
        address seller,
        uint256 salePrice,
        uint256 shippingDeadline
    );
    event EscrowShipped(uint256 indexed escrowId, uint256 confirmDeadline);
    event EscrowCompleted(
        uint256 indexed escrowId,
        uint256 indexed tokenId,
        uint256 artisanAmount,
        uint256 sellerAmount
    );
    event EscrowRefunded(uint256 indexed escrowId, address indexed buyer, uint256 amount);
    event EscrowDisputed(uint256 indexed escrowId, address indexed raisedBy, string reason);
    event EscrowResolved(uint256 indexed escrowId, bool sellerWins, string resolution);

    constructor(
        address productNftAddress,
        address royaltyEngineAddress,
        uint256 shippingWindowSeconds,
        uint256 confirmWindowSeconds
    ) {
        require(productNftAddress != address(0), "Escrow: invalid NFT");
        require(royaltyEngineAddress != address(0), "Escrow: invalid royalty engine");
        require(shippingWindowSeconds > 0, "Escrow: invalid shipping window");
        require(confirmWindowSeconds > 0, "Escrow: invalid confirm window");

        productNft = IERC721(productNftAddress);
        royaltyEngine = IDynamicRoyaltyEscrow(royaltyEngineAddress);
        shippingWindowSec = shippingWindowSeconds;
        confirmWindowSec = confirmWindowSeconds;
    }

    // PHASE 5 · STEP 2 (on-chain) — locks msg.value in this contract; nothing is
    // paid to the seller yet. Requires the seller to genuinely own the token right
    // now and that it's a real, royalty-registered product, not arbitrary NFT junk.
    function createEscrow(uint256 tokenId, address seller) external payable nonReentrant returns (uint256 escrowId) {
        require(msg.value > 0, "Escrow: sale price is zero");
        require(seller != address(0), "Escrow: invalid seller");
        require(seller != msg.sender, "Escrow: buyer and seller cannot match");
        require(productNft.ownerOf(tokenId) == seller, "Escrow: seller is not current owner");
        require(royaltyEngine.originalMinter(tokenId) != address(0), "Escrow: token not registered in royalty engine");

        escrowId = ++escrowCount;

        escrows[escrowId] = Escrow({
            id: escrowId,
            tokenId: tokenId,
            buyer: msg.sender,
            seller: seller,
            salePrice: msg.value,
            createdAt: block.timestamp,
            shippedAt: 0,
            shippingDeadline: block.timestamp + shippingWindowSec,
            confirmDeadline: 0,
            status: EscrowStatus.Created,
            disputeReason: ""
        });

        emit EscrowCreated(escrowId, tokenId, msg.sender, seller, msg.value, block.timestamp + shippingWindowSec);
    }

    // PHASE 5 · STEP 4 (on-chain).
    function markShipped(uint256 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == EscrowStatus.Created, "Escrow: invalid status");
        require(msg.sender == escrow.seller, "Escrow: only seller can mark shipped");
        require(block.timestamp <= escrow.shippingDeadline, "Escrow: shipping deadline passed");

        escrow.status = EscrowStatus.Shipped;
        escrow.shippedAt = block.timestamp;
        escrow.confirmDeadline = block.timestamp + confirmWindowSec;

        emit EscrowShipped(escrowId, escrow.confirmDeadline);
    }

    // PHASE 5 · STEP 5 (on-chain) — the point of no return. Delegates to
    // _releaseAndTransfer below, which settles the royalty payout BEFORE moving the
    // NFT -- see that function's own comment for why the ordering matters.
    function confirmReceived(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == EscrowStatus.Shipped, "Escrow: not ready for confirmation");
        require(msg.sender == escrow.buyer, "Escrow: only buyer can confirm");
        require(block.timestamp <= escrow.confirmDeadline, "Escrow: confirmation window expired");

        _releaseAndTransfer(escrow);
    }

    function cancelExpired(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == EscrowStatus.Created, "Escrow: cannot cancel now");
        require(msg.sender == escrow.buyer, "Escrow: only buyer can cancel");
        require(block.timestamp > escrow.shippingDeadline, "Escrow: shipping window still active");

        _refundAndClose(escrow, EscrowStatus.Refunded);
    }

    /// @notice Permissionless "poke": unsticks an escrow whose deadline has passed without
    /// relying on the buyer or seller remembering to act.
    // Not currently reachable from any button on /transfer -- fully implemented and
    // callable directly against the contract, but this specific safety-valve step
    // isn't wired into the frontend flow yet (same status as ArtisanRegistry's
    // vouchFor/slash: contract-complete, UI-pending).
    /// @dev Created + shippingDeadline passed  -> same refund path as cancelExpired.
    ///      Shipped + confirmDeadline passed   -> routes into Disputed for owner arbitration
    ///      (does NOT move funds itself; resolveDispute decides the outcome exactly as it
    ///      already does for a manually-raised dispute).
    function checkExpiry(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];

        if (escrow.status == EscrowStatus.Created) {
            require(block.timestamp > escrow.shippingDeadline, "Escrow: shipping window still active");
            _refundAndClose(escrow, EscrowStatus.Refunded);
            return;
        }

        if (escrow.status == EscrowStatus.Shipped) {
            require(block.timestamp > escrow.confirmDeadline, "Escrow: confirmation window still active");
            escrow.status = EscrowStatus.Disputed;
            escrow.disputeReason = "Confirmation window expired without buyer action";
            emit EscrowDisputed(escrowId, msg.sender, escrow.disputeReason);
            return;
        }

        revert("Escrow: not in an expirable state");
    }

    function raiseDispute(uint256 escrowId, string calldata reason) external {
        Escrow storage escrow = escrows[escrowId];
        require(
            escrow.status == EscrowStatus.Created || escrow.status == EscrowStatus.Shipped,
            "Escrow: invalid status for dispute"
        );
        require(msg.sender == escrow.buyer || msg.sender == escrow.seller, "Escrow: only buyer or seller");

        escrow.status = EscrowStatus.Disputed;
        escrow.disputeReason = reason;

        emit EscrowDisputed(escrowId, msg.sender, reason);
    }

    function resolveDispute(uint256 escrowId, bool sellerWins, string calldata resolution)
        external
        onlyOwner
        nonReentrant
    {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == EscrowStatus.Disputed, "Escrow: not disputed");

        if (sellerWins) {
            _releaseAndTransfer(escrow);
        } else {
            escrow.status = EscrowStatus.Resolved;
            uint256 amount = escrow.salePrice;
            escrow.salePrice = 0;

            (bool refunded, ) = payable(escrow.buyer).call{value: amount}("");
            require(refunded, "Escrow: refund failed");

            emit EscrowRefunded(escrowId, escrow.buyer, amount);
        }

        emit EscrowResolved(escrowId, sellerWins, resolution);
    }

    // PHASE 5 · STEP 5 (on-chain, money-before-asset ordering) — checks STEP 3's
    // approval actually happened, settles the royalty split via DynamicRoyalty, THEN
    // transfers the NFT (further down, after this snippet) -- money moves before
    // ownership, closing off a reentrancy window a naive implementation could hit.
    function _releaseAndTransfer(Escrow storage escrow) internal {
        require(productNft.ownerOf(escrow.tokenId) == escrow.seller, "Escrow: seller no longer owner");

        bool approved =
            productNft.getApproved(escrow.tokenId) == address(this) ||
            productNft.isApprovedForAll(escrow.seller, address(this));
        require(approved, "Escrow: escrow contract not approved for token");

        escrow.status = EscrowStatus.Completed;

        uint256 salePrice = escrow.salePrice;
        escrow.salePrice = 0;

        (uint256 artisanAmount, uint256 sellerAmount) = royaltyEngine.processSecondarySale{value: salePrice}(
            escrow.tokenId,
            payable(escrow.seller)
        );

        productNft.safeTransferFrom(escrow.seller, escrow.buyer, escrow.tokenId);

        emit EscrowCompleted(escrow.id, escrow.tokenId, artisanAmount, sellerAmount);
    }

    /// @dev Shared refund path used by both cancelExpired and checkExpiry's Created branch.
    function _refundAndClose(Escrow storage escrow, EscrowStatus closedStatus) internal {
        escrow.status = closedStatus;
        uint256 amount = escrow.salePrice;
        escrow.salePrice = 0;

        (bool refunded, ) = payable(escrow.buyer).call{value: amount}("");
        require(refunded, "Escrow: refund failed");

        emit EscrowRefunded(escrow.id, escrow.buyer, amount);
    }
}
