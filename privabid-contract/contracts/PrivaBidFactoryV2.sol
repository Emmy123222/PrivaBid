// SPDX-License-Identifier: MIT
pragma solidity >=0.8.19 <0.9.0;

import "./PrivaBidV2.sol";

/**
 * @title  PrivaBidFactoryV2
 * @notice Deploys PrivaBidV2 with optional encrypted reserve across all four modes.
 */
contract PrivaBidFactoryV2 {

    enum AuctionMode { FIRST_PRICE, VICKREY, DUTCH, REVERSE }

    struct AuctionRecord {
        address contractAddress;
        AuctionMode mode;
        string itemName;
        address creator;
        uint256 createdAt;
        bool useEncryptedReserve;
    }

    AuctionRecord[] public auctions;
    mapping(address => AuctionRecord[]) public auctionsByCreator;

    event AuctionDeployed(
        address indexed creator,
        address indexed contractAddress,
        AuctionMode mode,
        string itemName,
        uint256 timestamp
    );

    function createAuction(
        AuctionMode mode,
        string memory itemName,
        string memory itemDescription,
        uint64 reservePrice,
        uint256 duration,
        uint64 dutchStartPrice,
        uint64 dutchFloorPrice,
        uint256 dutchDecrement,
        bool useEncryptedReserve
    ) external returns (address) {
        address newAuction = address(new PrivaBidV2(
            PrivaBidV2.AuctionMode(uint8(mode)),
            itemName,
            itemDescription,
            reservePrice,
            duration,
            dutchStartPrice,
            dutchFloorPrice,
            dutchDecrement,
            useEncryptedReserve
        ));

        AuctionRecord memory record = AuctionRecord({
            contractAddress: newAuction,
            mode: mode,
            itemName: itemName,
            creator: msg.sender,
            createdAt: block.timestamp,
            useEncryptedReserve: useEncryptedReserve
        });

        auctions.push(record);
        auctionsByCreator[msg.sender].push(record);

        emit AuctionDeployed(msg.sender, newAuction, mode, itemName, block.timestamp);

        return newAuction;
    }

    function getAllAuctions() external view returns (AuctionRecord[] memory) {
        return auctions;
    }

    function getAuctionsByCreator(address creator) external view returns (AuctionRecord[] memory) {
        return auctionsByCreator[creator];
    }

    function getTotalAuctions() external view returns (uint256) {
        return auctions.length;
    }

    function getAuction(uint256 index) external view returns (AuctionRecord memory) {
        require(index < auctions.length, "Index out of bounds");
        return auctions[index];
    }

    function getLatestAuctions(uint256 count) external view returns (AuctionRecord[] memory) {
        uint256 totalCount = auctions.length;
        if (count > totalCount) count = totalCount;

        AuctionRecord[] memory latest = new AuctionRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            latest[i] = auctions[totalCount - 1 - i];
        }

        return latest;
    }
}
