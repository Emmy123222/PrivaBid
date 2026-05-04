import { useState } from "react";
import { Contract } from "ethers";
import { Link, useNavigate } from "react-router-dom";
import { createBrowserProvider } from "../lib/browserProvider";
import { getTrustedMetaMaskProvider } from "../lib/metamask";
import NetworkGateBanner from "../components/NetworkGateBanner";

import { CONTRACTS } from "../config/contracts";

const FACTORY_ABI = [
  "function createAuction(uint8 mode, string itemName, string itemDescription, uint64 reservePrice, uint256 duration, uint64 dutchStartPrice, uint64 dutchFloorPrice, uint256 dutchDecrement) returns (address)",
  "event AuctionDeployed(address indexed contractAddress, uint8 mode, string itemName, address indexed creator)",
] as const;

const FACTORY_ADDRESS = CONTRACTS.FACTORY.address;

type AuctionMode = "first-price" | "vickrey" | "dutch" | "reverse";

const AUCTION_MODES = [
  { value: "first-price", label: "First-Price Sealed Bid", modeId: 0 },
  { value: "vickrey", label: "Vickrey (Second-Price)", modeId: 1 },
  { value: "dutch", label: "Blind Dutch Auction", modeId: 2 },
  { value: "reverse", label: "Reverse / Procurement", modeId: 3 },
] as const;

const DURATIONS = [
  { value: 3600, label: "1 hour" },
  { value: 21600, label: "6 hours" },
  { value: 86400, label: "24 hours" },
  { value: 604800, label: "7 days" },
] as const;

function getReservePriceLabel(mode: AuctionMode): string {
  switch (mode) {
    case "reverse":
      return "Budget Ceiling (max you will pay)";
    case "dutch":
      return "Floor Price";
    default:
      return "Minimum Bid";
  }
}

function isZeroAddress(address: string): boolean {
  return !address || address.toLowerCase() === "0x0000000000000000000000000000000000000000";
}

export default function CreateAuction() {
  const navigate = useNavigate();
  
  const [mode, setMode] = useState<AuctionMode>("first-price");
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [reservePrice, setReservePrice] = useState("");
  const [duration, setDuration] = useState(3600);
  
  // Dutch-specific fields
  const [dutchStartPrice, setDutchStartPrice] = useState("");
  const [dutchDecrementAmount, setDutchDecrementAmount] = useState("");
  const [dutchDecrementInterval, setDutchDecrementInterval] = useState("");
  
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDutchMode = mode === "dutch";
  const selectedMode = AUCTION_MODES.find(m => m.value === mode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isZeroAddress(FACTORY_ADDRESS)) {
      setError("Factory contract not configured yet.");
      return;
    }

    if (!itemName.trim() || !itemDescription.trim() || !reservePrice) {
      setError("Please fill in all required fields.");
      return;
    }

    if (isDutchMode && (!dutchStartPrice || !dutchDecrementAmount || !dutchDecrementInterval)) {
      setError("Please fill in all Dutch auction parameters.");
      return;
    }

    try {
      const mm = await getTrustedMetaMaskProvider();
      if (!mm) {
        setError("Connect MetaMask to deploy auction.");
        return;
      }

      setIsDeploying(true);

      const browser = createBrowserProvider(mm);
      const signer = await browser.getSigner();
      const factory = new Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);

      // Convert prices to microUSDC (6 decimals)
      const reservePriceMicro = BigInt(Math.floor(parseFloat(reservePrice) * 1_000_000));
      const dutchStartPriceMicro = isDutchMode 
        ? BigInt(Math.floor(parseFloat(dutchStartPrice) * 1_000_000))
        : 0n;
      const dutchFloorPriceMicro = isDutchMode 
        ? reservePriceMicro 
        : 0n;
      const dutchDecrementBlocks = isDutchMode 
        ? BigInt(dutchDecrementInterval)
        : 0n;

      const tx = await factory.createAuction(
        selectedMode!.modeId,
        itemName.trim(),
        itemDescription.trim(),
        reservePriceMicro,
        BigInt(duration),
        dutchStartPriceMicro,
        dutchFloorPriceMicro,
        dutchDecrementBlocks
      );

      const receipt = await tx.wait();
      
      // Find the AuctionDeployed event
      const event = receipt.logs.find((log: any) => {
        try {
          const parsed = factory.interface.parseLog(log);
          return parsed?.name === "AuctionDeployed";
        } catch {
          return false;
        }
      });

      if (!event) {
        throw new Error("Could not find AuctionDeployed event in transaction receipt");
      }

      const parsed = factory.interface.parseLog(event);
      const newAddress = parsed!.args.contractAddress;

      // Navigate to the new auction page
      navigate(`/auction/${mode}/${newAddress}`);

    } catch (e: any) {
      if (e?.code === "ACTION_REJECTED" || e?.code === 4001) {
        setError("Transaction cancelled");
      } else {
        setError(e?.message || "Failed to deploy auction");
      }
    } finally {
      setIsDeploying(false);
    }
  };

  if (isZeroAddress(FACTORY_ADDRESS)) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <Link
          to="/home"
          className="font-label text-xs uppercase tracking-wider text-[#00FF94]/90 hover:text-[#00FF94]"
        >
          ← Back to home
        </Link>
        <h1 className="mt-6 font-heading text-2xl font-bold text-white">
          Create New Auction
        </h1>
        <p className="mt-4 font-label text-sm text-amber-200/90">
          Factory contract not deployed yet. Please deploy the factory first.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link
        to="/home"
        className="font-label text-xs uppercase tracking-wider text-[#00FF94]/90 hover:text-[#00FF94]"
      >
        ← Back to home
      </Link>

      <NetworkGateBanner />

      <div className="mt-8">
        <h1 className="font-heading text-2xl font-bold text-white md:text-3xl">
          Create New Auction
        </h1>
        <p className="mt-2 font-label text-sm text-neutral-400">
          Deploy a new auction contract via the factory
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-6">
          <h2 className="font-heading text-lg font-semibold text-white">
            Auction Configuration
          </h2>

          <div className="mt-6 space-y-6">
            {/* Auction Mode */}
            <div>
              <label className="block font-label text-sm font-medium text-white">
                Auction Mode
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as AuctionMode)}
                disabled={isDeploying}
                className="mt-2 w-full rounded-lg border border-neutral-700 bg-priva-bg px-3 py-2 text-white outline-none ring-[#00FF94]/30 focus:ring-2 disabled:opacity-50"
              >
                {AUCTION_MODES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Item Name */}
            <div>
              <label className="block font-label text-sm font-medium text-white">
                Item Name *
              </label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                disabled={isDeploying}
                placeholder="e.g., Vintage Guitar, Software License, etc."
                className="mt-2 w-full rounded-lg border border-neutral-700 bg-priva-bg px-3 py-2 text-white outline-none ring-[#00FF94]/30 focus:ring-2 disabled:opacity-50"
                required
              />
            </div>

            {/* Item Description */}
            <div>
              <label className="block font-label text-sm font-medium text-white">
                Item Description *
              </label>
              <textarea
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                disabled={isDeploying}
                placeholder="Detailed description of the item or service being auctioned..."
                rows={4}
                className="mt-2 w-full rounded-lg border border-neutral-700 bg-priva-bg px-3 py-2 text-white outline-none ring-[#00FF94]/30 focus:ring-2 disabled:opacity-50"
                required
              />
            </div>

            {/* Reserve Price */}
            <div>
              <label className="block font-label text-sm font-medium text-white">
                {getReservePriceLabel(mode)} *
              </label>
              <div className="relative mt-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={reservePrice}
                  onChange={(e) => setReservePrice(e.target.value)}
                  disabled={isDeploying}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-neutral-700 bg-priva-bg px-3 py-2 pr-16 text-white outline-none ring-[#00FF94]/30 focus:ring-2 disabled:opacity-50"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label text-sm text-neutral-400">
                  USDC
                </span>
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="block font-label text-sm font-medium text-white">
                Duration
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                disabled={isDeploying}
                className="mt-2 w-full rounded-lg border border-neutral-700 bg-priva-bg px-3 py-2 text-white outline-none ring-[#00FF94]/30 focus:ring-2 disabled:opacity-50"
              >
                {DURATIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Dutch Mode Specific Fields */}
            {isDutchMode && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <h3 className="font-heading text-base font-semibold text-amber-200">
                  Dutch Auction Parameters
                </h3>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block font-label text-sm font-medium text-white">
                      Starting Price *
                    </label>
                    <div className="relative mt-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={dutchStartPrice}
                        onChange={(e) => setDutchStartPrice(e.target.value)}
                        disabled={isDeploying}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-neutral-700 bg-priva-bg px-3 py-2 pr-16 text-white outline-none ring-[#00FF94]/30 focus:ring-2 disabled:opacity-50"
                        required
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label text-sm text-neutral-400">
                        USDC
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block font-label text-sm font-medium text-white">
                      Decrement Amount *
                    </label>
                    <div className="relative mt-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={dutchDecrementAmount}
                        onChange={(e) => setDutchDecrementAmount(e.target.value)}
                        disabled={isDeploying}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-neutral-700 bg-priva-bg px-3 py-2 pr-16 text-white outline-none ring-[#00FF94]/30 focus:ring-2 disabled:opacity-50"
                        required
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label text-sm text-neutral-400">
                        USDC
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block font-label text-sm font-medium text-white">
                      Decrement Interval *
                    </label>
                    <div className="relative mt-2">
                      <input
                        type="number"
                        min="1"
                        value={dutchDecrementInterval}
                        onChange={(e) => setDutchDecrementInterval(e.target.value)}
                        disabled={isDeploying}
                        placeholder="100"
                        className="w-full rounded-lg border border-neutral-700 bg-priva-bg px-3 py-2 pr-20 text-white outline-none ring-[#00FF94]/30 focus:ring-2 disabled:opacity-50"
                        required
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label text-sm text-neutral-400">
                        blocks
                      </span>
                    </div>
                    <p className="mt-1 font-label text-xs text-neutral-500">
                      Price decreases every N blocks (~2 seconds per block on Arbitrum)
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-6 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              <p className="font-label text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="mt-8 flex justify-end">
            <button
              type="submit"
              disabled={isDeploying}
              className="rounded-xl border border-[#00FF94]/50 px-6 py-3 font-label text-sm font-semibold uppercase tracking-wide text-[#00FF94] hover:bg-[#00FF94]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeploying ? "Deploying auction..." : "Deploy Auction"}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}