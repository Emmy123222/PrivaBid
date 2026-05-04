// SPDX-License-Identifier: MIT
pragma solidity >=0.8.19 <0.9.0;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @title  PrivaBidReverse
 * @notice Reverse/procurement auction where sellers compete with lowest encrypted asks.
 *         Buyer picks the winner automatically. Same architecture as PrivaBid but flipped.
 */
contract PrivaBidReverse {
    using FHE for euint64;
    using FHE for eaddress;
    using FHE for ebool;

    // ─── Custom Errors ───────────────────────────────────────────────────────
    error AuctionExpired();
    error AuctionNotClosed();
    error AuctionClosedError();
    error OnlyBuyer();
    error AboveBudget();
    error NoAsks();
    error AlreadySubmitted();

    // ─── State Variables ─────────────────────────────────────────────────────
    address public immutable buyer;
    string  public itemName;
    string  public itemDescription;
    uint64  public budgetCeiling;
    uint256 public auctionEndTime;
    bool    public auctionClosed;
    bool    public winnerRevealed;
    uint256 public totalAsks;

    // Encrypted state
    euint64  private lowestAsk;
    eaddress private lowestSeller;

    // Revealed after proof
    uint64  public winningAsk;
    address public winningSeller;

    // Participation tracking
    mapping(address => bool) public hasSubmitted;
    address[] public sellerList;

    // ─── Events ──────────────────────────────────────────────────────────────
    event AuctionCreated(address buyer, string itemName, uint64 budget, uint256 endTime);
    event AskSubmitted(address seller, uint256 timestamp, uint256 totalAsksNow);
    event AuctionClosed(uint256 timestamp, uint256 finalCount);
    event WinnerRevealed(address seller, uint64 amount, uint256 timestamp);

    // ─── Modifiers ───────────────────────────────────────────────────────────
    modifier onlyBuyer() {
        if (msg.sender != buyer) revert OnlyBuyer();
        _;
    }

    modifier whileActive() {
        if (auctionClosed) revert AuctionClosedError();
        if (block.timestamp >= auctionEndTime) revert AuctionExpired();
        _;
    }

    modifier whenClosed() {
        if (!auctionClosed) revert AuctionNotClosed();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(
        string memory _itemName,
        string memory _itemDescription,
        uint64 _budgetCeiling,
        uint256 _duration
    ) {
        buyer = msg.sender;
        itemName = _itemName;
        itemDescription = _itemDescription;
        budgetCeiling = _budgetCeiling;
        auctionEndTime = block.timestamp + _duration;

        // Initialize with maximum value (no asks yet)
        lowestAsk = FHE.asEuint64(type(uint64).max);
        lowestSeller = FHE.asEaddress(address(0));

        // Allow this contract to operate on encrypted values
        FHE.allowThis(lowestAsk);
        FHE.allowThis(lowestSeller);

        emit AuctionCreated(buyer, _itemName, _budgetCeiling, auctionEndTime);
    }

    // ─── Core Functions ──────────────────────────────────────────────────────

    /**
     * @notice Submit an encrypted ask (seller's price)
     * @param price The ask price (must be <= budgetCeiling)
     */
    function submitAsk(uint64 price) external whileActive {
        if (price > budgetCeiling) revert AboveBudget();
        if (hasSubmitted[msg.sender]) revert AlreadySubmitted();

        // Encrypt the ask
        euint64 encAsk = FHE.asEuint64(price);

        // Check if this ask is lower than current lowest
        ebool isLower = FHE.lt(encAsk, lowestAsk);

        // Update lowest ask (min of current and new)
        lowestAsk = FHE.min(encAsk, lowestAsk);

        // Update lowest seller (select new seller if their ask is lower)
        lowestSeller = FHE.select(
            isLower,
            FHE.asEaddress(msg.sender),
            lowestSeller
        );

        // Allow this contract to operate on updated encrypted values
        FHE.allowThis(lowestAsk);
        FHE.allowThis(lowestSeller);

        // Track participation
        hasSubmitted[msg.sender] = true;
        sellerList.push(msg.sender);
        totalAsks++;

        emit AskSubmitted(msg.sender, block.timestamp, totalAsks);
    }

    /**
     * @notice Close the auction (buyer only)
     */
    function closeBidding() external onlyBuyer {
        // Allow public access to encrypted values for decryption
        FHE.allowPublic(lowestAsk);
        FHE.allowPublic(lowestSeller);

        auctionClosed = true;
        emit AuctionClosed(block.timestamp, totalAsks);
    }

    /**
     * @notice Reveal the winner using FHE decryption proofs
     */
    function revealWinner(
        uint64 askPlaintext,
        bytes calldata askSignature,
        address sellerPlaintext,
        bytes calldata sellerSignature
    ) external whenClosed {
        if (totalAsks == 0) revert NoAsks();

        // Verify and publish decryption results
        FHE.publishDecryptResult(lowestAsk, askPlaintext, askSignature);
        FHE.publishDecryptResult(lowestSeller, sellerPlaintext, sellerSignature);

        // Store revealed values
        winningAsk = askPlaintext;
        winningSeller = sellerPlaintext;
        winnerRevealed = true;

        emit WinnerRevealed(sellerPlaintext, askPlaintext, block.timestamp);
    }

    // ─── View Functions ──────────────────────────────────────────────────────

    /**
     * @notice Get encrypted handle to lowest ask (after auction closed)
     */
    function getLowestAskHandle() external view whenClosed returns (euint64) {
        return lowestAsk;
    }

    /**
     * @notice Get encrypted handle to lowest seller (after auction closed)
     */
    function getLowestSellerHandle() external view whenClosed returns (eaddress) {
        return lowestSeller;
    }

    /**
     * @notice Get time remaining in auction
     */
    function timeRemaining() external view returns (uint256) {
        if (block.timestamp >= auctionEndTime) return 0;
        return auctionEndTime - block.timestamp;
    }

    /**
     * @notice Get complete auction state
     */
    function getAuctionState() external view returns (
        address _buyer,
        string memory _itemName,
        string memory _itemDescription,
        uint64 _budgetCeiling,
        uint256 _auctionEndTime,
        bool _auctionClosed,
        bool _winnerRevealed,
        uint256 _totalAsks,
        uint64 _winningAsk,
        address _winningSeller,
        uint256 _timeRemaining
    ) {
        return (
            buyer,
            itemName,
            itemDescription,
            budgetCeiling,
            auctionEndTime,
            auctionClosed,
            winnerRevealed,
            totalAsks,
            winningAsk,
            winningSeller,
            block.timestamp >= auctionEndTime ? 0 : auctionEndTime - block.timestamp
        );
    }

    /**
     * @notice Get list of all sellers who submitted asks
     */
    function getSellerList() external view returns (address[] memory) {
        return sellerList;
    }
}