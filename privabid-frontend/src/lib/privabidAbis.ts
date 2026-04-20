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

/** First-price / reverse-style reveal on PrivaBid.sol (FIRST_PRICE route). */
export const FIRST_PRICE_REVEAL_ABI = [
  "function getHighestBidHandle() view returns (uint256)",
  "function getHighestBidderHandle() view returns (uint256)",
  "function revealWinner(uint256 bidCtHash, uint64 bidPlaintext, bytes bidSignature, uint256 bidderCtHash, address bidderPlaintext, bytes bidderSignature)",
] as const;

/** PrivaBidVickrey.sol standalone reveal. */
export const VICKREY_REVEAL_ABI = [
  "function getHighestBidHandle() view returns (uint256)",
  "function getSecondHighestBidHandle() view returns (uint256)",
  "function getHighestBidderHandle() view returns (uint256)",
  "function revealWinner(uint256 bidCtHash, uint64 bidPlaintext, bytes bidSignature, uint256 secondBidCtHash, uint64 secondBidPlaintext, bytes secondBidSignature, uint256 bidderCtHash, address bidderPlaintext, bytes bidderSignature)",
] as const;

/** PrivaBidDutch.sol — auctioneer supplies winner address + threshold proof. */
export const DUTCH_REVEAL_ABI = [
  "function getDutchThresholdHandle(address bidder) view returns (uint256)",
  "function revealWinner(address winner, uint256 thresholdCtHash, uint64 thresholdPlaintext, bytes thresholdSignature)",
] as const;
