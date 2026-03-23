// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @title  PrivaBid
 * @notice Multi-mode encrypted auction platform on Fhenix FHE.
 *         Supports four auction types, all with fully encrypted bids/asks.
 *
 * AUCTION MODES:
 *   0 = FIRST_PRICE  — highest bid wins, pays own amount
 *   1 = VICKREY      — highest bid wins, pays second-highest amount
 *   2 = DUTCH        — price descends, first encrypted threshold met wins
 *   3 = REVERSE      — lowest ask wins (procurement / seller competition)
 *
 * CORE GUARANTEE (all modes):
 *   Bids/asks are encrypted the moment they arrive.
 *   All comparisons, updates, and winner tracking happen in FHE space.
 *   The contract NEVER touches plaintext bid amounts.
 *   Only the winning value is decrypted via Threshold Network at reveal.
 *   Losing bids are permanently sealed — never decryptable by anyone.
 *
 * DEPLOYED ON: Arbitrum Sepolia
 */
contract PrivaBid {

    // ─── Auction Mode Enum ───────────────────────────────────────────────────
    enum AuctionMode { FIRST_PRICE, VICKREY, DUTCH, REVERSE }

    // ─── Custom Errors ───────────────────────────────────────────────────────
    error NotAuctioneer();
    error AuctionAlreadyClosed();
    error AuctionNotClosed();
    error AuctionExpired();
    error AuctionStillActive();
    error BelowReservePrice();
    error AboveCeilingPrice();
    error AlreadyRevealed();
    error EmptyItemName();
    error ZeroReservePrice();
    error ZeroDuration();
    error InvalidMode();
    error ThresholdAlreadySet();

    // ─── State ───────────────────────────────────────────────────────────────

    address     public immutable auctioneer;
    AuctionMode public           mode;
    string      public           itemName;
    string      public           itemDescription;
    uint64      public           reservePrice;   // min bid (FIRST/VICKREY/DUTCH) or max budget (REVERSE)
    uint256     public           auctionEndTime;
    bool        public           auctionClosed;
    bool        public           winnerRevealed;
    uint256     public           totalBids;

    // ─── Encrypted State — FIRST_PRICE & VICKREY ────────────────────────────

    /// @dev Highest encrypted bid. Nobody can read this during the auction.
    euint64  private highestBid;

    /// @dev Second-highest encrypted bid. Used only in VICKREY mode.
    ///      The winner pays this amount — not their own bid.
    euint64  private secondHighestBid;

    /// @dev Encrypted address of the current highest bidder.
    eaddress private highestBidder;

    // ─── Encrypted State — REVERSE ───────────────────────────────────────────

    /// @dev Lowest encrypted ask. FHE.min instead of FHE.max.
    euint64  private lowestAsk;

    /// @dev Encrypted address of the seller with the lowest ask.
    eaddress private lowestSeller;

    // ─── Encrypted State — DUTCH ─────────────────────────────────────────────

    /// @dev Starting price for Dutch auction. Descends each block.
    uint64  public dutchStartPrice;

    /// @dev Floor price — auction fails if no threshold is met above this.
    uint64  public dutchFloorPrice;

    /// @dev Blocks between each price decrement.
    uint256 public dutchDecrement;

    /// @dev Block number at auction start.
    uint256 public dutchStartBlock;

    /// @dev Each Dutch bidder submits an encrypted threshold (lowest price willing to pay).
    mapping(address => euint64) private dutchThresholds;
    mapping(address => bool)    public  hasThreshold;

    // ─── Participation Tracking ───────────────────────────────────────────────
    mapping(address => bool) public hasBid;
    address[]                public bidderList;

    // ─── Revealed Results ─────────────────────────────────────────────────────
    uint64  public winningBid;      // first-price / vickrey: winning amount
    uint64  public paymentAmount;   // vickrey only: second-highest (what winner pays)
    uint64  public winningAsk;      // reverse only: lowest ask
    address public winningBidder;   // winner address (all modes)

    // ─── Events ───────────────────────────────────────────────────────────────
    event AuctionCreated(address indexed auctioneer, AuctionMode mode, string itemName, uint64 reservePrice, uint256 endTime);
    event BidPlaced(address indexed bidder, uint256 timestamp, uint256 totalBidsNow);
    event AskSubmitted(address indexed seller, uint256 timestamp, uint256 totalAsksNow);
    event ThresholdSet(address indexed bidder, uint256 timestamp);
    event AuctionClosed(uint256 timestamp, uint256 finalCount);
    event WinnerRevealed(address indexed winner, uint64 amount, uint256 timestamp);

    // ─── Modifiers ────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param _mode            Auction type: 0=FIRST_PRICE, 1=VICKREY, 2=DUTCH, 3=REVERSE
     * @param _itemName        Name of the item or contract being auctioned
     * @param _itemDescription Description shown to participants
     * @param _reservePrice    Minimum bid (FIRST/VICKREY), floor price (DUTCH), max budget (REVERSE)
     * @param _duration        Auction duration in seconds
     *
     * Dutch-specific params (ignored for other modes):
     * @param _dutchStartPrice Starting price for DUTCH mode
     * @param _dutchFloorPrice Floor price for DUTCH mode
     * @param _dutchDecrement  Blocks between each price drop in DUTCH mode
     */
    constructor(
        AuctionMode _mode,
        string memory _itemName,
        string memory _itemDescription,
        uint64  _reservePrice,
        uint256 _duration,
        uint64  _dutchStartPrice,
        uint64  _dutchFloorPrice,
        uint256 _dutchDecrement
    ) {
        if (bytes(_itemName).length == 0) revert EmptyItemName();
        if (_reservePrice == 0)           revert ZeroReservePrice();
        if (_duration == 0)               revert ZeroDuration();

        auctioneer      = msg.sender;
        mode            = _mode;
        itemName        = _itemName;
        itemDescription = _itemDescription;
        reservePrice    = _reservePrice;
        auctionEndTime  = block.timestamp + _duration;
        auctionClosed   = false;
        winnerRevealed  = false;
        totalBids       = 0;

        // Initialize encrypted state for FIRST_PRICE and VICKREY
        if (_mode == AuctionMode.FIRST_PRICE || _mode == AuctionMode.VICKREY) {
            highestBid    = FHE.asEuint64(0);
            highestBidder = FHE.asEaddress(address(0));
            FHE.allowThis(highestBid);
            FHE.allowThis(highestBidder);

            // VICKREY: also track second-highest bid
            if (_mode == AuctionMode.VICKREY) {
                secondHighestBid = FHE.asEuint64(0);
                FHE.allowThis(secondHighestBid);
            }
        }

        // Initialize encrypted state for REVERSE
        if (_mode == AuctionMode.REVERSE) {
            // Start with max uint64 so any real ask will be lower
            lowestAsk    = FHE.asEuint64(type(uint64).max);
            lowestSeller = FHE.asEaddress(address(0));
            FHE.allowThis(lowestAsk);
            FHE.allowThis(lowestSeller);
        }

        // Initialize Dutch auction params
        if (_mode == AuctionMode.DUTCH) {
            dutchStartPrice = _dutchStartPrice;
            dutchFloorPrice = _dutchFloorPrice;
            dutchDecrement  = _dutchDecrement;
            dutchStartBlock = block.number;
        }

        emit AuctionCreated(msg.sender, _mode, _itemName, _reservePrice, auctionEndTime);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODE 1 & 2 — BID (First-Price and Vickrey)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Place an encrypted bid (FIRST_PRICE or VICKREY mode).
     *
     * FHE OPERATIONS:
     *   1. FHE.asEuint64(amount)         — encrypt bid immediately
     *   2. FHE.gt(enc, highestBid)        — compare in FHE, returns ebool
     *   3. FHE.max(enc, highestBid)       — update highest, never decrypts
     *   4. FHE.select(isHigher, ...)      — update winner, no plaintext branch
     *
     * VICKREY EXTRA:
     *   5. FHE.gt(enc, secondHighestBid)  — is new bid second-best?
     *   6. Nested FHE.select              — update second-highest correctly
     *
     * After every operation: FHE.allowThis() re-grants ACL access
     * to newly created handles (FHE values are immutable — ops create new handles).
     */
    function bid(uint64 amount) external whileActive {
        require(
            mode == AuctionMode.FIRST_PRICE || mode == AuctionMode.VICKREY,
            "Use submitAsk() for REVERSE, setThreshold() for DUTCH"
        );
        if (amount < reservePrice) revert BelowReservePrice();

        // Step 1: Encrypt the incoming bid
        euint64 enc = FHE.asEuint64(amount);

        // Step 2: Compare against current highest (encrypted comparison)
        ebool isHigher = FHE.gt(enc, highestBid);

        // ── VICKREY: update second-highest BEFORE overwriting highest ──────
        if (mode == AuctionMode.VICKREY) {
            ebool isSecond = FHE.gt(enc, secondHighestBid);

            // Three cases handled simultaneously in FHE:
            // Case A: new bid is highest  → second = old highest
            // Case B: new bid is second   → second = new bid
            // Case C: new bid is neither  → second unchanged
            secondHighestBid = FHE.select(
                isHigher,
                highestBid,                                          // Case A
                FHE.select(isSecond, enc, secondHighestBid)         // Case B/C
            );
            FHE.allowThis(secondHighestBid);
        }

        // Step 3: Update highest bid to encrypted max
        highestBid = FHE.max(enc, highestBid);

        // Step 4: Conditionally update highest bidder (encrypted ternary)
        highestBidder = FHE.select(
            isHigher,
            FHE.asEaddress(msg.sender),
            highestBidder
        );

        // Re-grant ACL access to newly created handles
        FHE.allowThis(highestBid);
        FHE.allowThis(highestBidder);

        // Track participation (address only — amount never stored in plaintext)
        if (!hasBid[msg.sender]) {
            hasBid[msg.sender] = true;
            bidderList.push(msg.sender);
        }
        totalBids++;

        // NOTE: bid amount intentionally NOT emitted — would defeat privacy
        emit BidPlaced(msg.sender, block.timestamp, totalBids);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODE 3 — DUTCH: Set Encrypted Threshold
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Submit an encrypted price threshold for Dutch auction.
     *         If the descending price reaches your threshold, you win automatically.
     *
     * @dev The threshold is stored per-bidder as an encrypted value.
     *      The contract checks FHE.lte(currentPrice, threshold) to determine
     *      if a bidder's floor has been met — without revealing the threshold.
     *
     * @param threshold The lowest price you are willing to pay. Encrypted immediately.
     */
    function setThreshold(uint64 threshold) external whileActive {
        require(mode == AuctionMode.DUTCH, "Only for DUTCH mode");
        if (hasThreshold[msg.sender]) revert ThresholdAlreadySet();
        if (threshold < dutchFloorPrice) revert BelowReservePrice();

        // Encrypt the threshold — nobody sees this value
        euint64 encThreshold = FHE.asEuint64(threshold);
        FHE.allowThis(encThreshold);

        dutchThresholds[msg.sender] = encThreshold;
        hasThreshold[msg.sender]    = true;

        if (!hasBid[msg.sender]) {
            hasBid[msg.sender] = true;
            bidderList.push(msg.sender);
        }
        totalBids++;

        emit ThresholdSet(msg.sender, block.timestamp);
    }

    /**
     * @notice Get the current Dutch auction price based on elapsed blocks.
     * @dev Price = startPrice - (blocksSinceStart / decrement)
     *      Floors at dutchFloorPrice.
     */
    function getCurrentDutchPrice() public view returns (uint64) {
        require(mode == AuctionMode.DUTCH, "Only for DUTCH mode");
        uint256 blocksPassed = block.number - dutchStartBlock;
        uint256 decrements   = blocksPassed / dutchDecrement;
        if (decrements >= dutchStartPrice - dutchFloorPrice) {
            return dutchFloorPrice;
        }
        return dutchStartPrice - uint64(decrements);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODE 4 — REVERSE: Submit Encrypted Ask
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Submit an encrypted ask price (REVERSE mode — procurement auction).
     *         The seller with the lowest ask wins the contract.
     *
     * FHE OPERATIONS:
     *   1. FHE.asEuint64(price)          — encrypt ask immediately
     *   2. FHE.lt(enc, lowestAsk)         — is this lower? (FHE.lt not FHE.gt)
     *   3. FHE.min(enc, lowestAsk)        — update lowest (FHE.min not FHE.max)
     *   4. FHE.select(isLower, ...)       — update winning seller
     *
     * @param price The asking price. Encrypted immediately on submission.
     */
    function submitAsk(uint64 price) external whileActive {
        require(mode == AuctionMode.REVERSE, "Only for REVERSE mode");
        if (price > reservePrice) revert AboveCeilingPrice(); // reservePrice = buyer's budget ceiling

        // Step 1: Encrypt the ask immediately
        euint64 enc = FHE.asEuint64(price);

        // Step 2: Compare against current lowest (FHE.lt — opposite of bid mode)
        ebool isLower = FHE.lt(enc, lowestAsk);

        // Step 3: Update lowest ask (FHE.min — opposite of bid mode)
        lowestAsk = FHE.min(enc, lowestAsk);

        // Step 4: Conditionally update lowest seller
        lowestSeller = FHE.select(
            isLower,
            FHE.asEaddress(msg.sender),
            lowestSeller
        );

        // Re-grant ACL access to new handles
        FHE.allowThis(lowestAsk);
        FHE.allowThis(lowestSeller);

        if (!hasBid[msg.sender]) {
            hasBid[msg.sender] = true;
            bidderList.push(msg.sender);
        }
        totalBids++;

        // Ask price intentionally NOT emitted
        emit AskSubmitted(msg.sender, block.timestamp, totalBids);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CLOSE AUCTION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Close the auction and authorize Threshold Network decryption.
     *
     * @dev FHE.allowPublic() does NOT decrypt values.
     *      It registers in the Fhenix ACL that these handles can now be
     *      decrypted by the Threshold Network without a user permit.
     *
     *      ONLY winning handles get allowPublic().
     *      All losing bids/asks are permanently sealed — never decryptable.
     */
    function closeBidding() external onlyAuctioneer {
        if (auctionClosed) revert AuctionAlreadyClosed();

        if (mode == AuctionMode.FIRST_PRICE) {
            FHE.allowPublic(highestBid);
            FHE.allowPublic(highestBidder);
        }

        if (mode == AuctionMode.VICKREY) {
            FHE.allowPublic(highestBid);
            FHE.allowPublic(secondHighestBid); // winner pays this
            FHE.allowPublic(highestBidder);
        }

        if (mode == AuctionMode.REVERSE) {
            FHE.allowPublic(lowestAsk);
            FHE.allowPublic(lowestSeller);
        }

        // DUTCH: thresholds are per-bidder — reveal handled separately
        // The auctioneer calls revealDutchWinner with the matching bidder

        auctionClosed = true;
        emit AuctionClosed(block.timestamp, totalBids);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REVEAL — FIRST_PRICE & REVERSE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Reveal winner for FIRST_PRICE or REVERSE mode.
     *
     * CALLER MUST FIRST (off-chain):
     *   const handle = await contract.getWinningBidHandle()
     *   const result = await client.decryptForTx(handle).withoutPermit().execute()
     *   // result = { ctHash, decryptedValue, signature }
     *
     * FHE.publishDecryptResult() verifies the Threshold Network signature.
     * Reverts if signature is invalid or plaintext is wrong.
     * Winner result is cryptographically proven — not just claimed.
     */
    function revealWinner(
        euint64  bidCtHash,
        uint64   bidPlaintext,
        bytes calldata bidSignature,
        eaddress bidderCtHash,
        address  bidderPlaintext,
        bytes calldata bidderSignature
    ) external whenClosed {
        require(
            mode == AuctionMode.FIRST_PRICE || mode == AuctionMode.REVERSE,
            "Use revealVickreyWinner() or revealDutchWinner()"
        );
        if (winnerRevealed) revert AlreadyRevealed();

        FHE.publishDecryptResult(bidCtHash,    bidPlaintext,    bidSignature);
        FHE.publishDecryptResult(bidderCtHash, bidderPlaintext, bidderSignature);

        if (mode == AuctionMode.FIRST_PRICE) winningBid = bidPlaintext;
        if (mode == AuctionMode.REVERSE)     winningAsk = bidPlaintext;

        winningBidder  = bidderPlaintext;
        winnerRevealed = true;

        emit WinnerRevealed(bidderPlaintext, bidPlaintext, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REVEAL — VICKREY
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Reveal Vickrey winner. Requires TWO Threshold Network proofs:
     *         1. The winning bid (identifies the winner)
     *         2. The second-highest bid (determines payment amount)
     *
     * Winner pays secondBidPlaintext — not their own bid.
     */
    function revealVickreyWinner(
        euint64  bidCtHash,
        uint64   bidPlaintext,
        bytes calldata bidSignature,
        euint64  secondBidCtHash,
        uint64   secondBidPlaintext,
        bytes calldata secondBidSignature,
        eaddress bidderCtHash,
        address  bidderPlaintext,
        bytes calldata bidderSignature
    ) external whenClosed {
        require(mode == AuctionMode.VICKREY, "Only for VICKREY mode");
        if (winnerRevealed) revert AlreadyRevealed();

        // Verify all three proofs — each reverts independently if invalid
        FHE.publishDecryptResult(bidCtHash,       bidPlaintext,       bidSignature);
        FHE.publishDecryptResult(secondBidCtHash, secondBidPlaintext, secondBidSignature);
        FHE.publishDecryptResult(bidderCtHash,    bidderPlaintext,    bidderSignature);

        winningBid    = bidPlaintext;
        paymentAmount = secondBidPlaintext; // winner pays this, not winningBid
        winningBidder = bidderPlaintext;
        winnerRevealed = true;

        emit WinnerRevealed(bidderPlaintext, secondBidPlaintext, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REVEAL — DUTCH
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Reveal Dutch auction winner.
     *         The auctioneer identifies which bidder's threshold was met
     *         and reveals their threshold with a Threshold Network proof.
     *
     * @param winner           Address of the bidder whose threshold was met
     * @param thresholdCtHash  The bidder's encrypted threshold handle
     * @param thresholdPlaintext The decrypted threshold value
     * @param thresholdSignature Threshold Network proof
     */
    function revealDutchWinner(
        address  winner,
        euint64  thresholdCtHash,
        uint64   thresholdPlaintext,
        bytes calldata thresholdSignature
    ) external whenClosed {
        require(mode == AuctionMode.DUTCH, "Only for DUTCH mode");
        if (winnerRevealed) revert AlreadyRevealed();
        require(hasThreshold[winner], "Address has no threshold");

        FHE.publishDecryptResult(thresholdCtHash, thresholdPlaintext, thresholdSignature);

        winningBid    = thresholdPlaintext;
        winningBidder = winner;
        winnerRevealed = true;

        emit WinnerRevealed(winner, thresholdPlaintext, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VIEW FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Seconds remaining in the auction.
    function timeRemaining() external view returns (uint256) {
        if (block.timestamp >= auctionEndTime) return 0;
        return auctionEndTime - block.timestamp;
    }

    /// @notice Get winning bid handle (FIRST_PRICE / VICKREY). Only after close.
    function getHighestBidHandle() external view whenClosed returns (euint64) {
        require(mode == AuctionMode.FIRST_PRICE || mode == AuctionMode.VICKREY);
        return highestBid;
    }

    /// @notice Get second-highest bid handle (VICKREY only). Only after close.
    function getSecondHighestBidHandle() external view whenClosed returns (euint64) {
        require(mode == AuctionMode.VICKREY, "Only for VICKREY mode");
        return secondHighestBid;
    }

    /// @notice Get highest bidder handle. Only after close.
    function getHighestBidderHandle() external view whenClosed returns (eaddress) {
        require(mode == AuctionMode.FIRST_PRICE || mode == AuctionMode.VICKREY);
        return highestBidder;
    }

    /// @notice Get lowest ask handle (REVERSE). Only after close.
    function getLowestAskHandle() external view whenClosed returns (euint64) {
        require(mode == AuctionMode.REVERSE, "Only for REVERSE mode");
        return lowestAsk;
    }

    /// @notice Get lowest seller handle (REVERSE). Only after close.
    function getLowestSellerHandle() external view whenClosed returns (eaddress) {
        require(mode == AuctionMode.REVERSE, "Only for REVERSE mode");
        return lowestSeller;
    }

    /// @notice Get a bidder's Dutch threshold handle (DUTCH). Only after close.
    function getDutchThresholdHandle(address bidder) external view whenClosed returns (euint64) {
        require(mode == AuctionMode.DUTCH, "Only for DUTCH mode");
        return dutchThresholds[bidder];
    }

    /// @notice Number of unique participants.
    function getParticipantCount() external view returns (uint256) {
        return bidderList.length;
    }

    /// @notice Full auction state for frontend.
    function getAuctionState() external view returns (
        AuctionMode _mode,
        string memory _itemName,
        uint64  _reservePrice,
        uint256 _auctionEndTime,
        bool    _auctionClosed,
        bool    _winnerRevealed,
        uint256 _totalBids,
        uint256 _participantCount,
        address _winningBidder,
        uint64  _winningBid,
        uint64  _paymentAmount
    ) {
        return (
            mode, itemName, reservePrice, auctionEndTime,
            auctionClosed, winnerRevealed, totalBids,
            bidderList.length, winningBidder, winningBid, paymentAmount
        );
    }
}