import { BrowserRouter, Link, Outlet, Route, Routes } from "react-router-dom";
import WalletConnect from "./components/WalletConnect";
import { CHAIN_ID } from "./config/contracts";
import AuctionPage from "./pages/AuctionPage";
import Home from "./pages/Home";
import Landing from "./pages/Landing";

function AppLayout() {
  return (
    <>
      <header className="border-b border-neutral-800 bg-priva-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-4 px-4 py-4">
          <Link to="/home" className="block text-left no-underline">
            <h1 className="font-heading text-lg font-semibold tracking-tight text-white">
              PrivaBid
            </h1>
            <p className="font-label text-[11px] text-neutral-500">
              Arbitrum Sepolia · chain {CHAIN_ID}
            </p>
          </Link>
          <div className="ml-auto shrink-0">
            <WalletConnect />
          </div>
        </div>
      </header>
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-dvh bg-priva-bg text-neutral-200">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route element={<AppLayout />}>
            <Route path="/home" element={<Home />} />
            <Route path="/auction/:mode" element={<AuctionPage />} />
          </Route>
        </Routes>
      </div>
    </BrowserRouter>
  );
}
