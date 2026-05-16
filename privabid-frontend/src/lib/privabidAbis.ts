/** PrivaBid.sol (multi-mode) — first-price route uses this deployment. */
export const PRIVA_BID_ABI = [
  "function getAuctionState() view returns (uint8 _mode, string _itemName, uint64 _reservePrice, uint256 _auctionEndTime, bool _auctionClosed, bool _winnerRevealed, uint256 _totalBids, uint256 _participantCount, address _winningBidder, uint64 _winningBid, uint64 _paymentAmount)",
  "function timeRemaining() view returns (uint256)",
  "function itemName() view returns (string)",
  "function totalBids() view returns (uint256)",
  "function auctioneer() view returns (address)",
  "function closeBidding() external",
  "event BidPlaced(address indexed bidder, uint256 timestamp, uint256 totalBidsNow)",
  "event ThresholdSet(address indexed bidder, uint256 timestamp)",
] as const;

/** PrivaBidVickrey.sol — standalone Vickrey. */
export const VICKREY_ABI = [
  "function itemName() view returns (string)",
  "function reservePrice() view returns (uint64)",
  "function timeRemaining() view returns (uint256)",
  "function totalBids() view returns (uint256)",
  "function auctionClosed() view returns (bool)",
  "function winnerRevealed() view returns (bool)",
  "function winningBidder() view returns (address)",
  "function winningBid() view returns (uint64)",
  "function paymentAmount() view returns (uint64)",
  "function auctioneer() view returns (address)",
  "function closeBidding() external",
  "event BidPlaced(address indexed bidder, uint256 timestamp, uint256 totalBidsNow)",
] as const;

/** PrivaBidDutch.sol — standalone Dutch (no itemName; thresholds instead of bids). */
export const DUTCH_ABI = [
  "function getParticipantCount() view returns (uint256)",
  "function getCurrentPrice() view returns (uint64)",
  "function floorPrice() view returns (uint64)",
  "function auctionClosed() view returns (bool)",
  "function winnerRevealed() view returns (bool)",
  "function winningBidder() view returns (address)",
  "function winningBid() view returns (uint64)",
  "function auctioneer() view returns (address)",
  "function closeBidding() external",
  "event ThresholdSet(address indexed bidder, uint256 timestamp)",
  "event MatchChecked(address indexed bidder, uint64 currentPrice, uint256 timestamp)",
] as const;

/** decryptForView — participant's own sealed bid / ask / threshold. */
export const MY_SEALED_ABI = [
  "function getMySealedAmountHandle() view returns (uint256)",
] as const;

/** Dutch reveal prep (Threshold ACL). */
export const DUTCH_AUTHORIZE_ABI = [
  "function authorizeDutchWinnerReveal(address winner)",
] as const;

/** PrivaBid.sol multi-mode — all reveal entrypoints + preflight views. */
export const PRIVA_BID_MULTI_REVEAL_ABI = [
  ...MY_SEALED_ABI,
  ...DUTCH_AUTHORIZE_ABI,
  "function getHighestBidHandle() view returns (uint256)",
  "function getHighestBidderHandle() view returns (uint256)",
  "function getSecondHighestBidHandle() view returns (uint256)",
  "function getLowestAskHandle() view returns (uint256)",
  "function getLowestSellerHandle() view returns (uint256)",
  "function getDutchThresholdHandle(address bidder) view returns (uint256)",
  "function hasThreshold(address bidder) view returns (bool)",
  "function totalBids() view returns (uint256)",
  "function auctionClosed() view returns (bool)",
  "function winnerRevealed() view returns (bool)",
  "function revealWinner(uint256 bidCtHash, uint64 bidPlaintext, bytes bidSignature, uint256 bidderCtHash, address bidderPlaintext, bytes bidderSignature)",
  "function revealVickreyWinner(uint256 bidCtHash, uint64 bidPlaintext, bytes bidSignature, uint256 secondBidCtHash, uint64 secondBidPlaintext, bytes secondBidSignature, uint256 bidderCtHash, address bidderPlaintext, bytes bidderSignature)",
  "function revealDutchWinner(address winner, uint256 thresholdCtHash, uint64 thresholdPlaintext, bytes thresholdSignature)",
] as const;

/** PrivaBidV2 — optional sealed reserve + extended reveal proofs. */
export const PRIVA_BID_V2_REVEAL_ABI = [
  ...PRIVA_BID_MULTI_REVEAL_ABI.filter(
    (s) => !s.startsWith("function revealWinner") && !s.startsWith("function revealVickreyWinner"),
  ),
  "function useEncryptedReserve() view returns (bool)",
  "function getReserveMetHandle() view returns (uint256)",
  "function revealWinner((uint256 bidCtHash, uint64 bidPlaintext, bytes bidSignature, uint256 bidderCtHash, address bidderPlaintext, bytes bidderSignature, uint256 reserveCheckCtHash, uint64 reserveCheckPlaintext, bytes reserveCheckSignature) p)",
  "function revealVickreyWinner((uint256 bidCtHash, uint64 bidPlaintext, bytes bidSignature, uint256 secondBidCtHash, uint64 secondBidPlaintext, bytes secondBidSignature, uint256 bidderCtHash, address bidderPlaintext, bytes bidderSignature, uint256 reserveCheckCtHash, uint64 reserveCheckPlaintext, bytes reserveCheckSignature) p)",
] as const;

/** First-price / reverse on PrivaBid.sol (subset). */
export const FIRST_PRICE_REVEAL_ABI = PRIVA_BID_MULTI_REVEAL_ABI;

/** PrivaBidVickrey.sol standalone reveal. */
export const VICKREY_REVEAL_ABI = [
  "function getHighestBidHandle() view returns (uint256)",
  "function getSecondHighestBidHandle() view returns (uint256)",
  "function getHighestBidderHandle() view returns (uint256)",
  "function totalBids() view returns (uint256)",
  "function auctionClosed() view returns (bool)",
  "function winnerRevealed() view returns (bool)",
  "function revealWinner(uint256 bidCtHash, uint64 bidPlaintext, bytes bidSignature, uint256 secondBidCtHash, uint64 secondBidPlaintext, bytes secondBidSignature, uint256 bidderCtHash, address bidderPlaintext, bytes bidderSignature)",
] as const;

/** PrivaBidDutch.sol — auctioneer supplies winner address + threshold proof. */
export const DUTCH_REVEAL_ABI = [
  ...MY_SEALED_ABI,
  ...DUTCH_AUTHORIZE_ABI,
  "function getDutchThresholdHandle(address bidder) view returns (uint256)",
  "function hasThreshold(address bidder) view returns (bool)",
  "function getParticipantCount() view returns (uint256)",
  "function auctionClosed() view returns (bool)",
  "function winnerRevealed() view returns (bool)",
  "function revealWinner(address winner, uint256 thresholdCtHash, uint64 thresholdPlaintext, bytes thresholdSignature)",
] as const;

/** PrivaBidReverse.sol — read + close for the reverse auction page. */
export const REVERSE_ABI = [
  ...MY_SEALED_ABI,
  "function itemName() view returns (string)",
  "function budgetCeiling() view returns (uint64)",
  "function timeRemaining() view returns (uint256)",
  "function totalAsks() view returns (uint256)",
  "function auctionClosed() view returns (bool)",
  "function winnerRevealed() view returns (bool)",
  "function winningVendor() view returns (address)",
  "function winningAsk() view returns (uint64)",
  "function buyer() view returns (address)",
  "function closeBidding() external",
  "event AskSubmitted(address indexed seller, uint256 timestamp, uint256 totalAsksNow)",
] as const;

/** PrivaBidReverse.sol — proofs bind to on-chain handles inside the contract. */
export const REVERSE_STANDALONE_REVEAL_ABI = [
  "function getLowestAskHandle() view returns (uint256)",
  "function getLowestSellerHandle() view returns (uint256)",
  "function totalAsks() view returns (uint256)",
  "function auctionClosed() view returns (bool)",
  "function winnerRevealed() view returns (bool)",
  "function revealWinner(uint64 askPlaintext, bytes askSignature, address sellerPlaintext, bytes sellerSignature)",
] as const;
