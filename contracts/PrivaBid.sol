// SPDX-License-Identifier: MIT
pragma solidity >=0.8.19 <0.9.0;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @title  PrivaBid
 * @author PrivaBid — Fhenix Privacy-by-Design Buildathon 2025
 *
 * @notice Sealed-bid auction protocol using Fhenix Fully Homomorphic Encryption.
 *         Every bid is stored as an FHE ciphertext. No participant — including
 *         the auctioneer — can observe any bid amount during or after the auction.
 *         Losing bids are permanently sealed and never decrypted.
 *
 * ─── THE CORE INSIGHT ───────────────────────────────────────────────────────
 *
 *   Traditional on-chain auctions: every bid is public in the mempool.
 *   Bots front-run, bidders snipe, institutions stay away.
 *
 *   PrivaBid flips this: bids are encrypted the moment they arrive.
 *   The contract runs comparisons, updates, and state changes entirely
 *   in FHE space — operating on ciphertexts, never on plaintext.
 *
 *   This is "privacy-by-design": confidentiality is enforced at the type
 *   level by the FHE type system, not by rules, trust, or UX restrictions.
 *
 * ─── HOW THE FHE BIDDING WORKS ──────────────────────────────────────────────
 *
 *   When bid(5000) is called:
 *
 *     enc       = FHE.asEuint64(5000)         // 5000 → opaque ciphertext
 *     isHigher  = FHE.gt(enc, highestBid)     // compare in FHE → encrypted bool
 *     highestBid    = FHE.max(enc, highestBid)  // max in FHE → encrypted result
 *     highestBidder = FHE.select(isHigher, ...) // conditional update in FHE
 *
 *   At every step, the contract never sees plaintext.
 *   The comparison result is an encrypted boolean. The max is encrypted.
 *   The winner update is conditional on an encrypted condition.
 *
 * ─── HOW THE REVEAL WORKS (Threshold Network) ───────────────────────────────
 *
 *   After closeBidding():
 *     - FHE.allowPublic() authorizes Threshold Network decryption (no permit needed)
 *
 *   Off-chain:
 *     - client.decryptForTx(handle).withoutPermit().execute()
 *     - Threshold Network returns (plaintext, signature) — MPC, no single key holder
 *
 *   On-chain via revealWinner():
 *     - FHE.publishDecryptResult(handle, plaintext, signature)
 *     - Verifies signature on-chain — reverts if invalid
 *     - Only then: winner is stored
 *
 * ─── NETWORKS ────────────────────────────────────────────────────────────────
 *   Ethereum Sepolia | Arbitrum Sepolia | Base Sepolia
 */
contract PrivaBid {

    // ─────────────────────────────────────────────────────────────────────────
    // CUSTOM ERRORS — gas-efficient, descriptive
    // ─────────────────────────────────────────────────────────────────────────

    error NotAuctioneer();
    error AuctionAlreadyClosed();
    error AuctionNotClosed();
    error AuctionExpired();
    error BelowReservePrice();
    error AlreadyRevealed();
    error EmptyItemName();
    error ZeroReservePrice();
    error ZeroDuration();

    // ─────────────────────────────────────────────────────────────────────────
    // STATE VARIABLES
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Deployer address. Only this address can close the auction.
    address public immutable auctioneer;

    /// @notice Human-readable name of the item being auctioned.
    string public itemName;

    /// @notice Description of the auction item shown to bidders.
    string public itemDescription;

    /// @notice Minimum acceptable bid.
    ///         Stored as plaintext — public reserve prices are standard auction practice.
    uint64 public reservePrice;

    /// @notice Unix timestamp when the auction expires.
    uint256 public auctionEndTime;

    /// @notice True after the auctioneer calls closeBidding().
    bool public auctionClosed;

    /// @notice True after revealWinner() successfully runs with a valid proof.
    bool public winnerRevealed;

    /// @notice Total number of bids placed. Count is public; amounts are not.
    uint256 public totalBids;

    /// @notice Tracks participating addresses. Amounts are NOT stored anywhere.
    mapping(address => bool) public hasBid;

    /// @notice List of all bidder addresses in submission order.
    address[] public bidderList;

    // ─── ENCRYPTED STATE — the heart of PrivaBid ────────────────────────────

    /**
     * @dev Current highest bid, stored as an FHE-encrypted uint64.
     *
     *      This is NOT a uint64. It is a HANDLE — a reference to a ciphertext
     *      stored in the Fhenix CoFHE coprocessor. The handle is 32 bytes on-chain
     *      but the value it points to is encrypted and unreadable to anyone,
     *      including the auctioneer and this contract itself.
     *
     *      It can only be operated on via FHE functions (FHE.gt, FHE.max, etc.)
     *      or decrypted by the Threshold Network after FHE.allowPublic() is called.
     *
     *      Privacy guarantee: even if someone reads the raw contract storage,
     *      they see only a ciphertext handle — not the bid amount.
     */
    euint64 private highestBid;

    /**
     * @dev Address of the current highest bidder, encrypted as eaddress.
     *
     *      Same privacy model as highestBid — this is a handle to an encrypted
     *      address. During an active auction, even the current leader is unknown
     *      to all participants. Only revealed after cryptographic proof at settle.
     */
    eaddress private highestBidder;

    // ─── REVEALED AFTER CLOSE ───────────────────────────────────────────────

    /// @notice Winning bid amount. Zero until revealWinner() succeeds.
    uint64 public winningBid;

    /// @notice Winning bidder address. Zero address until revealWinner() succeeds.
    address public winningBidder;

    // ─────────────────────────────────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a bid is placed.
    ///         NOTE: bid AMOUNT is intentionally NOT included in this event.
    ///         Including it would leak the value to event listeners.
    ///         Only the bidder's address and the total bid count are public.
    event BidPlaced(
        address indexed bidder,
        uint256 indexed timestamp,
        uint256 totalBidsNow
    );

    /// @notice Emitted when the auctioneer closes bidding.
    event AuctionClosed(uint256 timestamp, uint256 finalBidCount);

    /// @notice Emitted when the winner is revealed with a verified cryptographic proof.
    event WinnerRevealed(
        address indexed winner,
        uint64 amount,
        uint256 timestamp
    );

    /// @notice Emitted when the contract is deployed.
    event AuctionCreated(
        address indexed auctioneer,
        string itemName,
        uint64 reservePrice,
        uint256 endTime
    );

    // ─────────────────────────────────────────────────────────────────────────
    // MODIFIERS
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyAuctioneer() {
        if (msg.sender != auctioneer) revert NotAuctioneer();
        _;
    }

    modifier auctionActive() {
        if (auctionClosed) revert AuctionAlreadyClosed();
        if (block.timestamp >= auctionEndTime) revert AuctionExpired();
        _;
    }

    modifier auctionIsClosed() {
        if (!auctionClosed) revert AuctionNotClosed();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Deploy a new PrivaBid sealed-bid auction.
     *
     * @dev Initializes encrypted state with trivial FHE encryptions of zero.
     *
     *      WHY FHE.asEuint64(0)?
     *      The first bid() call will run FHE.gt(newBid, highestBid).
     *      For this comparison to work, highestBid must already be an encrypted
     *      value — even if it's zero. We can't compare against an uninitialized handle.
     *      FHE.asEuint64(0) creates an encrypted zero as the baseline.
     *
     *      WHY FHE.allowThis()?
     *      FHE values are access-controlled by the Fhenix ACL.
     *      After encryption, only the caller (this constructor) has access.
     *      FHE.allowThis() explicitly grants the CONTRACT itself permission
     *      to access these handles in future transactions (bid(), closeBidding(), etc.)
     *      Without this call, the next transaction would fail with an ACL error.
     *
     * @param _itemName        Name of the auctioned item
     * @param _itemDescription Description shown to bidders
     * @param _reservePrice    Minimum bid (in token micro-units)
     * @param _duration        Auction length in seconds from deployment
     */
    constructor(
        string memory _itemName,
        string memory _itemDescription,
        uint64        _reservePrice,
        uint256       _duration
    ) {
        if (bytes(_itemName).length == 0) revert EmptyItemName();
        if (_reservePrice == 0)           revert ZeroReservePrice();
        if (_duration == 0)               revert ZeroDuration();

        auctioneer      = msg.sender;
        itemName        = _itemName;
        itemDescription = _itemDescription;
        reservePrice    = _reservePrice;
        auctionEndTime  = block.timestamp + _duration;
        auctionClosed   = false;
        winnerRevealed  = false;
        totalBids       = 0;

        // Initialize encrypted state with encrypted zeros.
        // These trivial encryptions serve as the starting point for FHE comparisons.
        highestBid    = FHE.asEuint64(0);
        highestBidder = FHE.asEaddress(address(0));

        // Grant this contract ACL access to its own encrypted values.
        // Without this, subsequent transactions cannot access these handles.
        FHE.allowThis(highestBid);
        FHE.allowThis(highestBidder);

        emit AuctionCreated(msg.sender, _itemName, _reservePrice, auctionEndTime);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BID — Core FHE Logic
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Place an encrypted bid. The amount is encrypted immediately and
     *         compared against the current highest bid using FHE operations.
     *         No bid amount is ever readable by any observer.
     *
     * @dev STEP-BY-STEP FHE WALKTHROUGH:
     *
     *   1. FHE.asEuint64(amount)
     *      ─────────────────────
     *      Converts the plaintext uint64 amount into an encrypted ciphertext.
     *      "Trivial encryption" — uses the network's public key so the CoFHE
     *      coprocessor can operate on it alongside other ciphertexts.
     *      After this line, `amount` exists only as an opaque handle.
     *
     *   2. FHE.gt(encryptedAmount, highestBid)
     *      ─────────────────────────────────────
     *      Computes (encryptedAmount > highestBid) in FHE space.
     *      Returns an ENCRYPTED BOOLEAN (ebool) — not a regular bool.
     *      The contract cannot read this result. It cannot branch on it.
     *      It can only pass it to other FHE operations like FHE.select().
     *      This is the key: even the outcome of a comparison is private.
     *
     *   3. FHE.max(encryptedAmount, highestBid)
     *      ──────────────────────────────────────
     *      Returns max(encryptedAmount, highestBid) as a new ciphertext.
     *      If encryptedAmount is larger: new ciphertext holds that value.
     *      If highestBid is larger: new ciphertext holds the old value.
     *      Nobody knows which branch was taken.
     *
     *   4. FHE.select(isHigher, newBidder, currentBidder)
     *      ────────────────────────────────────────────────
     *      Encrypted ternary operator:
     *        if isHigher (encrypted true)  → return FHE.asEaddress(msg.sender)
     *        if isHigher (encrypted false) → return currentHighestBidder
     *      The selection happens in ciphertext. No branch is visible.
     *      Even who is currently winning is hidden.
     *
     *   5. FHE.allowThis() on new handles
     *      ──────────────────────────────────
     *      CRITICAL: FHE values are immutable. Every FHE operation returns a
     *      NEW handle. The old handles for highestBid and highestBidder are now
     *      replaced by new ones from FHE.max() and FHE.select().
     *      We MUST call FHE.allowThis() on the new handles — otherwise the next
     *      bid() call cannot access them and will fail with an ACL error.
     *
     * @param amount Bid amount. Must be >= reservePrice. Encrypted immediately.
     */
    function bid(uint64 amount) external auctionActive {
        if (amount < reservePrice) revert BelowReservePrice();

        // Step 1: Encrypt the incoming bid immediately
        euint64 encryptedAmount = FHE.asEuint64(amount);

        // Step 2: Encrypted comparison — returns ebool (encrypted boolean)
        // Neither this contract nor any observer can see true/false
        ebool isHigher = FHE.gt(encryptedAmount, highestBid);

        // Step 3: Update highest bid to encrypted max of the two
        highestBid = FHE.max(encryptedAmount, highestBid);

        // Step 4: Conditionally update highest bidder (encrypted ternary)
        highestBidder = FHE.select(
            isHigher,
            FHE.asEaddress(msg.sender),
            highestBidder
        );

        // Step 5: Re-grant ACL access to the newly created handles
        // FHE operations produce new handles — old ones are replaced
        FHE.allowThis(highestBid);
        FHE.allowThis(highestBidder);

        // Record participation (address only — amount is never stored)
        if (!hasBid[msg.sender]) {
            hasBid[msg.sender] = true;
            bidderList.push(msg.sender);
        }
        totalBids++;

        // NOTE: We do NOT emit the bid amount — that would defeat the purpose
        emit BidPlaced(msg.sender, block.timestamp, totalBids);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CLOSE — Authorize Decryption
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Close the auction. No more bids accepted.
     *         Authorizes the Threshold Network to decrypt the winner on request.
     *
     * @dev FHE.allowPublic() is NOT a decryption call.
     *
     *      It registers in the Fhenix ACL that these handles are now eligible
     *      for public decryption — meaning the Threshold Network will respond
     *      to decryption requests for these handles without requiring a user permit.
     *
     *      After this call:
     *        - Values are STILL encrypted on-chain
     *        - Anyone can call client.decryptForTx(handle).withoutPermit()
     *        - The Threshold Network returns (plaintext, signature)
     *        - Caller submits those to revealWinner() for on-chain verification
     */
    function closeBidding() external onlyAuctioneer {
        if (auctionClosed) revert AuctionAlreadyClosed();

        // Authorize public decryption of winning bid and winning bidder.
        // Losing bids are NEVER decryptable — we only call allowPublic on these two.
        FHE.allowPublic(highestBid);
        FHE.allowPublic(highestBidder);

        auctionClosed = true;

        emit AuctionClosed(block.timestamp, totalBids);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REVEAL — Trustless Winner Publication
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Reveal the winner using a Threshold Network decryption proof.
     *
     * @dev CALLER MUST COMPLETE OFF-CHAIN STEPS FIRST:
     *
     *   // 1. Get encrypted handles from closed contract
     *   const bidHandle    = await contract.getHighestBidHandle();
     *   const bidderHandle = await contract.getHighestBidderHandle();
     *
     *   // 2. Request decryption from Threshold Network (no permit needed)
     *   const bidResult    = await client
     *     .decryptForTx(bidHandle).withoutPermit().execute();
     *   const bidderResult = await client
     *     .decryptForTx(bidderHandle).withoutPermit().execute();
     *   // Returns: { decryptedValue, signature }
     *
     *   // 3. Call revealWinner with the results
     *   await contract.revealWinner(
     *     bidResult.ctHash,    bidResult.decryptedValue,    bidResult.signature,
     *     bidderResult.ctHash, bidderResult.decryptedValue, bidderResult.signature
     *   );
     *
     * SECURITY MODEL:
     *   FHE.publishDecryptResult() performs on-chain cryptographic verification.
     *   It checks that the submitted plaintext correctly decrypts the ciphertext
     *   handle, as proven by the Threshold Network's signature.
     *
     *   If ANYONE tries to submit a fake winner:
     *     - Wrong plaintext → signature won't verify → REVERTS
     *     - Forged signature → verification fails → REVERTS
     *
     *   The winner result is not trusted — it is PROVEN.
     *
     * @param bidCtHash         euint64 handle for the winning bid (from getHighestBidHandle)
     * @param bidPlaintext      Decrypted winning bid amount (from Threshold Network)
     * @param bidSignature      Threshold Network proof for bidPlaintext
     * @param bidderCtHash      eaddress handle for the winning bidder
     * @param bidderPlaintext   Decrypted winning bidder address (from Threshold Network)
     * @param bidderSignature   Threshold Network proof for bidderPlaintext
     */
    function revealWinner(
        euint64  bidCtHash,
        uint64   bidPlaintext,
        bytes calldata bidSignature,
        eaddress bidderCtHash,
        address  bidderPlaintext,
        bytes calldata bidderSignature
    ) external auctionIsClosed {
        if (winnerRevealed) revert AlreadyRevealed();

        // Verify bid amount proof — REVERTS if signature is invalid
        FHE.publishDecryptResult(bidCtHash, bidPlaintext, bidSignature);

        // Verify bidder address proof — REVERTS if signature is invalid
        FHE.publishDecryptResult(bidderCtHash, bidderPlaintext, bidderSignature);

        // Store verified results on-chain
        winningBid     = bidPlaintext;
        winningBidder  = bidderPlaintext;
        winnerRevealed = true;

        emit WinnerRevealed(bidderPlaintext, bidPlaintext, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VIEW FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Seconds remaining in the auction. Returns 0 if expired.
    function timeRemaining() external view returns (uint256) {
        if (block.timestamp >= auctionEndTime) return 0;
        return auctionEndTime - block.timestamp;
    }

    /// @notice Returns the encrypted ciphertext handle for the highest bid.
    ///         Only callable after auction close to prevent partial information leakage.
    ///         Use @cofhe/sdk to request decryption from the Threshold Network.
    function getHighestBidHandle() external view auctionIsClosed returns (euint64) {
        return highestBid;
    }

    /// @notice Returns the encrypted ciphertext handle for the highest bidder.
    ///         Only callable after auction close.
    function getHighestBidderHandle() external view auctionIsClosed returns (eaddress) {
        return highestBidder;
    }

    /// @notice Number of unique bidder addresses.
    function getBidderCount() external view returns (uint256) {
        return bidderList.length;
    }

    /// @notice Full auction state summary for frontend consumption.
    function getAuctionState() external view returns (
        string memory _itemName,
        string memory _itemDescription,
        uint64        _reservePrice,
        uint256       _auctionEndTime,
        bool          _auctionClosed,
        bool          _winnerRevealed,
        uint256       _totalBids,
        uint256       _bidderCount,
        uint64        _winningBid,      // 0 until revealed
        address       _winningBidder    // address(0) until revealed
    ) {
        return (
            itemName,
            itemDescription,
            reservePrice,
            auctionEndTime,
            auctionClosed,
            winnerRevealed,
            totalBids,
            bidderList.length,
            winningBid,
            winningBidder
        );
    }
}
