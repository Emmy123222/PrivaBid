/** Minimal ABI fragments for PrivaBid integration (ethers v6). */

export const FACTORY_V2_ABI = [
  "function createAuction(uint8 mode, string itemName, string itemDescription, uint64 reservePrice, uint256 duration, uint64 dutchStartPrice, uint64 dutchFloorPrice, uint256 dutchDecrement, bool useEncryptedReserve) returns (address)",
  "function getAllAuctions() view returns (tuple(address contractAddress, uint8 mode, string itemName, address creator, uint256 createdAt, bool useEncryptedReserve)[])",
  "event AuctionDeployed(address indexed creator, address indexed contractAddress, uint8 mode, string itemName, uint256 timestamp)",
] as const;

export const PRIVABID_V2_READ_ABI = [
  "function getAuctionState() view returns (uint8,string,uint64,uint256,bool,bool,uint256,uint256,address,uint64,uint64)",
  "function timeRemaining() view returns (uint256)",
  "function auctioneer() view returns (address)",
  "function closeBidding() external",
  "function bid(uint64 amount) external",
  "function submitAsk(uint64 price) external",
  "function setThreshold(uint64 threshold) external",
  "function getMySealedAmountHandle() view returns (uint256)",
  "function useEncryptedReserve() view returns (bool)",
] as const;

export const PRIVABID_V2_REVEAL_ABI = [
  "function getHighestBidHandle() view returns (uint256)",
  "function getHighestBidderHandle() view returns (uint256)",
  "function getSecondHighestBidHandle() view returns (uint256)",
  "function getLowestAskHandle() view returns (uint256)",
  "function getLowestSellerHandle() view returns (uint256)",
  "function getDutchThresholdHandle(address bidder) view returns (uint256)",
  "function getReserveMetHandle() view returns (uint256)",
  "function revealWinner((uint256,uint64,bytes,uint256,address,bytes,uint256,uint64,bytes) p)",
  "function revealVickreyWinner((uint256,uint64,bytes,uint256,uint64,bytes,uint256,address,bytes,uint256,uint64,bytes) p)",
  "function revealDutchWinner(address winner, uint256 thresholdCtHash, uint64 thresholdPlaintext, bytes thresholdSignature)",
] as const;

export const REVERSE_STANDALONE_ABI = [
  "function buyer() view returns (address)",
  "function budgetCeiling() view returns (uint64)",
  "function submitAsk(uint64 price) external",
  "function closeBidding() external",
  "function getLowestAskHandle() view returns (uint256)",
  "function getLowestSellerHandle() view returns (uint256)",
  "function revealWinner(uint64 askPlaintext, bytes askSignature, address sellerPlaintext, bytes sellerSignature)",
] as const;

export const ALL_ABIS = {
  FACTORY_V2: FACTORY_V2_ABI,
  PRIVABID_V2_READ: PRIVABID_V2_READ_ABI,
  PRIVABID_V2_REVEAL: PRIVABID_V2_REVEAL_ABI,
  REVERSE_STANDALONE: REVERSE_STANDALONE_ABI,
} as const;
