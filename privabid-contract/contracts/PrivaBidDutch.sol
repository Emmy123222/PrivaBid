// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @title PrivaBidDutch
 * @notice Standalone Dutch auction using encrypted bidder thresholds on Fhenix FHE.
 * @dev closeBidding + revealWinner follow the same pattern as PrivaBid.sol (Dutch branch):
 *      close does not call allowPublic; reveal uses one Threshold proof for the winner's threshold.
 */
contract PrivaBidDutch {
    error NotAuctioneer();
    error AuctionAlreadyClosed();
    error AuctionNotClosed();
    error ZeroStartPrice();
    error InvalidFloorPrice();
    error ZeroIntervalBlocks();
    error ThresholdAlreadySet();
    error ThresholdBelowFloor();
    error UnknownBidder();
    error AlreadyRevealed();
    error WrongModeFunction();

    address public immutable auctioneer;
    uint64 public startPrice;
    uint64 public floorPrice;
    uint64 public decrementAmount;
    uint256 public decrementInterval;
    uint256 public startBlock;
    bool public auctionClosed;
    bool public winnerRevealed;

    mapping(address => euint64) private thresholds;
    mapping(address => ebool) private matchResults;
    mapping(address => bool) public hasThreshold;
    address[] public bidderList;

    uint64 public winningBid;
    address public winningBidder;

    event AuctionCreated(address indexed auctioneer, uint64 startPrice, uint64 floorPrice);
    event ThresholdSet(address indexed bidder, uint256 timestamp);
    event MatchChecked(address indexed bidder, uint64 currentPrice, uint256 timestamp);
    event AuctionClosed(uint256 timestamp);
    event WinnerRevealed(address indexed winner, uint64 amount, uint256 timestamp);

    modifier onlyAuctioneer() {
        if (msg.sender != auctioneer) revert NotAuctioneer();
        _;
    }

    modifier whileActive() {
        if (auctionClosed) revert AuctionAlreadyClosed();
        _;
    }

    modifier whenClosed() {
        if (!auctionClosed) revert AuctionNotClosed();
        _;
    }

    constructor(
        uint64 _startPrice,
        uint64 _floorPrice,
        uint64 _decrementAmount,
        uint256 _decrementInterval
    ) {
        if (_startPrice == 0) revert ZeroStartPrice();
        if (_floorPrice == 0 || _floorPrice > _startPrice) revert InvalidFloorPrice();
        if (_decrementInterval == 0) revert ZeroIntervalBlocks();

        auctioneer = msg.sender;
        startPrice = _startPrice;
        floorPrice = _floorPrice;
        decrementAmount = _decrementAmount;
        decrementInterval = _decrementInterval;
        startBlock = block.number;

        emit AuctionCreated(msg.sender, _startPrice, _floorPrice);
    }

    function bid(uint64) external pure {
        revert WrongModeFunction();
    }

    function setThreshold(uint64 threshold) external whileActive {
        if (hasThreshold[msg.sender]) revert ThresholdAlreadySet();
        if (threshold < floorPrice) revert ThresholdBelowFloor();

        euint64 enc = FHE.asEuint64(threshold);
        FHE.allowThis(enc);

        thresholds[msg.sender] = enc;
        hasThreshold[msg.sender] = true;
        bidderList.push(msg.sender);

        emit ThresholdSet(msg.sender, block.timestamp);
    }

    function getCurrentPrice() public view returns (uint64) {
        if (block.number <= startBlock) return startPrice;

        uint256 blocksPassed = block.number - startBlock;
        uint256 totalDrop = (blocksPassed / decrementInterval) * uint256(decrementAmount);
        uint256 maxDrop = uint256(startPrice) - uint256(floorPrice);

        if (totalDrop >= maxDrop) return floorPrice;

        uint64 price = startPrice - uint64(totalDrop);
        // Once the clock has ticked, price is strictly below the stair-step (e.g. 5999 vs 6000)
        // so encrypted lte(currentPrice, threshold) matches thresholds at the intended boundaries.
        if (blocksPassed > 0 && price > floorPrice) {
            unchecked {
                price -= 1;
            }
        }
        return price;
    }

    /// @notice Permissionless. Marks encrypted match state for this bidder (FHE); does not leak thresholds.
    function checkAndMatch(address bidder) external whileActive {
        if (!hasThreshold[bidder]) revert UnknownBidder();

        uint64 currentPrice = getCurrentPrice();
        euint64 encCurrentPrice = FHE.asEuint64(currentPrice);
        FHE.allowThis(encCurrentPrice);

        ebool isMatched = FHE.lte(encCurrentPrice, thresholds[bidder]);
        FHE.allowThis(isMatched);

        matchResults[bidder] = isMatched;
        FHE.allowThis(matchResults[bidder]);

        emit MatchChecked(bidder, currentPrice, block.timestamp);
    }

    /// @dev Same as PrivaBid.sol Dutch: no allowPublic in close; reveal supplies winner + threshold proof.
    function closeBidding() external onlyAuctioneer {
        if (auctionClosed) revert AuctionAlreadyClosed();

        auctionClosed = true;
        emit AuctionClosed(block.timestamp);
    }

    /// @dev Same pattern as PrivaBid.revealDutchWinner — one decrypt result for the winner's threshold.
    function revealWinner(
        address winner,
        euint64 thresholdCtHash,
        uint64 thresholdPlaintext,
        bytes calldata thresholdSignature
    ) external whenClosed {
        if (winnerRevealed) revert AlreadyRevealed();
        if (!hasThreshold[winner]) revert UnknownBidder();

        FHE.publishDecryptResult(thresholdCtHash, thresholdPlaintext, thresholdSignature);

        winningBid = thresholdPlaintext;
        winningBidder = winner;
        winnerRevealed = true;

        emit WinnerRevealed(winner, thresholdPlaintext, block.timestamp);
    }

    /// @notice Per-bidder threshold handle after close (same idea as PrivaBid.getDutchThresholdHandle).
    function getDutchThresholdHandle(address bidder) external view whenClosed returns (euint64) {
        if (!hasThreshold[bidder]) revert UnknownBidder();
        return thresholds[bidder];
    }

    function getMatchResultHandle(address bidder) external view returns (ebool) {
        if (!hasThreshold[bidder]) revert UnknownBidder();
        return matchResults[bidder];
    }

    function getParticipantCount() external view returns (uint256) {
        return bidderList.length;
    }
}
