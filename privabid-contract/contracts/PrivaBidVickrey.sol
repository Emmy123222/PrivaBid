// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @title PrivaBidVickrey
 * @notice Standalone Fhenix FHE Vickrey auction.
 *         Highest encrypted bid wins, but the winner pays the second-highest bid.
 */
contract PrivaBidVickrey {
    error NotAuctioneer();
    error AuctionAlreadyClosed();
    error AuctionNotClosed();
    error AuctionExpired();
    error AlreadyRevealed();
    error WrongModeFunction();
    error EmptyItemName();
    error ZeroReservePrice();
    error ZeroDuration();
    error BelowReservePrice();

    address public immutable auctioneer;
    string public itemName;
    string public itemDescription;
    uint64 public reservePrice;
    uint256 public auctionEndTime;
    bool public auctionClosed;
    bool public winnerRevealed;
    uint256 public totalBids;

    euint64 private highestBid;
    euint64 private secondHighestBid;
    eaddress private highestBidder;

    uint64 public winningBid;
    uint64 public paymentAmount;
    address public winningBidder;

    mapping(address => bool) public hasBid;
    address[] public bidderList;

    event AuctionCreated(
        address indexed auctioneer,
        string itemName,
        uint64 reservePrice,
        uint256 endTime
    );
    event BidPlaced(address indexed bidder, uint256 timestamp, uint256 totalBidsNow);
    event AuctionClosed(uint256 timestamp, uint256 finalCount);
    event WinnerRevealed(
        address indexed winner,
        uint64 winningBid,
        uint64 paymentAmount,
        uint256 timestamp
    );

    modifier onlyAuctioneer() {
        if (msg.sender != auctioneer) revert NotAuctioneer();
        _;
    }

    modifier whileActive() {
        if (auctionClosed) revert AuctionAlreadyClosed();
        if (block.timestamp >= auctionEndTime) revert AuctionExpired();
        _;
    }

    modifier whenClosed() {
        if (!auctionClosed) revert AuctionNotClosed();
        _;
    }

    constructor(
        string memory _itemName,
        string memory _itemDescription,
        uint64 _reservePrice,
        uint256 _duration
    ) {
        if (bytes(_itemName).length == 0) revert EmptyItemName();
        if (_reservePrice == 0) revert ZeroReservePrice();
        if (_duration == 0) revert ZeroDuration();

        auctioneer = msg.sender;
        itemName = _itemName;
        itemDescription = _itemDescription;
        reservePrice = _reservePrice;
        auctionEndTime = block.timestamp + _duration;

        highestBid = FHE.asEuint64(0);
        FHE.allowThis(highestBid);

        secondHighestBid = FHE.asEuint64(0);
        FHE.allowThis(secondHighestBid);

        highestBidder = FHE.asEaddress(address(0));
        FHE.allowThis(highestBidder);

        emit AuctionCreated(msg.sender, _itemName, _reservePrice, auctionEndTime);
    }

    function bid(uint64 amount) external whileActive {
        if (amount < reservePrice) revert BelowReservePrice();

        euint64 enc = FHE.asEuint64(amount);
        FHE.allowThis(enc);

        ebool isHighest = FHE.gt(enc, highestBid);
        FHE.allowThis(isHighest);

        ebool isSecond = FHE.gt(enc, secondHighestBid);
        FHE.allowThis(isSecond);

        secondHighestBid = FHE.select(
            isHighest,
            highestBid,
            FHE.select(isSecond, enc, secondHighestBid)
        );
        FHE.allowThis(secondHighestBid);

        highestBid = FHE.max(enc, highestBid);
        FHE.allowThis(highestBid);

        highestBidder = FHE.select(
            isHighest,
            FHE.asEaddress(msg.sender),
            highestBidder
        );
        FHE.allowThis(highestBidder);

        if (!hasBid[msg.sender]) {
            hasBid[msg.sender] = true;
            bidderList.push(msg.sender);
        }
        totalBids++;

        emit BidPlaced(msg.sender, block.timestamp, totalBids);
    }

    function setThreshold(uint64) external pure {
        revert WrongModeFunction();
    }

    function checkAndMatch(address) external pure {
        revert WrongModeFunction();
    }

    function closeBidding() external onlyAuctioneer {
        if (auctionClosed) revert AuctionAlreadyClosed();

        FHE.allowPublic(highestBid);
        FHE.allowPublic(secondHighestBid);
        FHE.allowPublic(highestBidder);

        auctionClosed = true;
        emit AuctionClosed(block.timestamp, totalBids);
    }

    /**
     * @notice Reveal the Vickrey result using Threshold Network proofs.
     *         The winner is identified by the highest bid, but pays the second-highest bid.
     */
    function revealWinner(
        euint64 bidCtHash,
        uint64 bidPlaintext,
        bytes calldata bidSignature,
        euint64 secondBidCtHash,
        uint64 secondBidPlaintext,
        bytes calldata secondBidSignature,
        eaddress bidderCtHash,
        address bidderPlaintext,
        bytes calldata bidderSignature
    ) external whenClosed {
        if (winnerRevealed) revert AlreadyRevealed();

        FHE.publishDecryptResult(bidCtHash, bidPlaintext, bidSignature);
        FHE.publishDecryptResult(secondBidCtHash, secondBidPlaintext, secondBidSignature);
        FHE.publishDecryptResult(bidderCtHash, bidderPlaintext, bidderSignature);

        winningBid = bidPlaintext;
        paymentAmount = secondBidPlaintext;
        winningBidder = bidderPlaintext;
        winnerRevealed = true;

        emit WinnerRevealed(bidderPlaintext, bidPlaintext, secondBidPlaintext, block.timestamp);
    }

    function timeRemaining() external view returns (uint256) {
        if (block.timestamp >= auctionEndTime) return 0;
        return auctionEndTime - block.timestamp;
    }

    function getHighestBidHandle() external view whenClosed returns (euint64) {
        return highestBid;
    }

    function getSecondHighestBidHandle() external view whenClosed returns (euint64) {
        return secondHighestBid;
    }

    function getHighestBidderHandle() external view whenClosed returns (eaddress) {
        return highestBidder;
    }

    function getParticipantCount() external view returns (uint256) {
        return bidderList.length;
    }
}
