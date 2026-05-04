// SPDX-License-Identifier: MIT
pragma solidity >=0.8.19 <0.9.0;

import "./PrivaBid.sol";
import "./PrivaBidReverse.sol";

/**
 * @title  PrivaBidFactory
 * @notice Factory contract that lets anyone deploy any auction mode with one transaction.
 */
contract PrivaBidFactory {
    
    // ─── Enums ───────────────────────────────────────────────────────────────
    enum AuctionMode { FIRST_PRICE, VICKREY, DUTCH, REVERSE }

    // ─── Structs ─────────────────────────────────────────────────────────────
    struct AuctionRecord {
        address contractAddress;
        AuctionMode mode;
        string itemName;
        address creator;
        uint256 createdAt;
    }

    // ─── State Variables ─────────────────────────────────────────────────────
    AuctionRecord[] public auctions;
    mapping(address => AuctionRecord[]) public auctionsByCreator;

    // ─── Events ──────────────────────────────────────────────────────────────
    event AuctionDeployed(
        address indexed creator,
        address indexed contractAddress,
        AuctionMode mode,
        string itemName,
        uint256 timestamp
    );

    // ─── Main Function ───────────────────────────────────────────────────────

    /**
     * @notice Create a new auction of specified mode
     * @param mode The auction type to deploy
     * @param itemName Name of the item being auctioned
     * @param itemDescription Description of the item
     * @param reservePrice Reserve/budget price (meaning varies by mode)
     * @param duration Auction duration in seconds
     * @param dutchStartPrice Starting price for Dutch auctions (ignored for others)
     * @param dutchFloorPrice Floor price for Dutch auctions (ignored for others)
     * @param dutchDecrement Price decrement interval for Dutch auctions (ignored for others)
     * @return newAuction Address of the deployed auction contract
     */
    function createAuction(
        AuctionMode mode,
        string memory itemName,
        string memory itemDescription,
        uint64 reservePrice,
        uint256 duration,
        uint64 dutchStartPrice,    // ignored for non-Dutch
        uint64 dutchFloorPrice,    // ignored for non-Dutch
        uint256 dutchDecrement     // ignored for non-Dutch
    ) external returns (address) {
        address newAuction;

        if (mode == AuctionMode.FIRST_PRICE) {
            newAuction = address(new PrivaBid(
                PrivaBid.AuctionMode.FIRST_PRICE,
                itemName,
                itemDescription,
                reservePrice,
                duration,
                0, // dutchStartPrice (ignored)
                0, // dutchFloorPrice (ignored)
                0  // dutchDecrement (ignored)
            ));
        }
        else if (mode == AuctionMode.VICKREY) {
            // Note: Assuming PrivaBidVickrey follows same constructor pattern
            // You'll need to create this contract or modify PrivaBid to handle Vickrey mode
            newAuction = address(new PrivaBid(
                PrivaBid.AuctionMode.VICKREY,
                itemName,
                itemDescription,
                reservePrice,
                duration,
                0, // dutchStartPrice (ignored)
                0, // dutchFloorPrice (ignored)
                0  // dutchDecrement (ignored)
            ));
        }
        else if (mode == AuctionMode.DUTCH) {
            // Note: Assuming PrivaBidDutch follows same constructor pattern
            // You'll need to create this contract or modify PrivaBid to handle Dutch mode
            newAuction = address(new PrivaBid(
                PrivaBid.AuctionMode.DUTCH,
                itemName,
                itemDescription,
                reservePrice,
                duration,
                dutchStartPrice,
                dutchFloorPrice,
                dutchDecrement
            ));
        }
        else if (mode == AuctionMode.REVERSE) {
            newAuction = address(new PrivaBidReverse(
                itemName,
                itemDescription,
                reservePrice, // This becomes budgetCeiling in reverse auction
                duration
            ));
        }

        // Create auction record
        AuctionRecord memory record = AuctionRecord({
            contractAddress: newAuction,
            mode: mode,
            itemName: itemName,
            creator: msg.sender,
            createdAt: block.timestamp
        });

        // Store in arrays
        auctions.push(record);
        auctionsByCreator[msg.sender].push(record);

        emit AuctionDeployed(msg.sender, newAuction, mode, itemName, block.timestamp);

        return newAuction;
    }

    // ─── View Functions ──────────────────────────────────────────────────────

    /**
     * @notice Get all deployed auctions
     */
    function getAllAuctions() external view returns (AuctionRecord[] memory) {
        return auctions;
    }

    /**
     * @notice Get auctions created by a specific address
     */
    function getAuctionsByCreator(address creator) external view returns (AuctionRecord[] memory) {
        return auctionsByCreator[creator];
    }

    /**
     * @notice Get total number of auctions deployed
     */
    function getTotalAuctions() external view returns (uint256) {
        return auctions.length;
    }

    /**
     * @notice Get auction record by index
     */
    function getAuction(uint256 index) external view returns (AuctionRecord memory) {
        require(index < auctions.length, "Index out of bounds");
        return auctions[index];
    }

    /**
     * @notice Get latest auctions (up to specified count)
     */
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