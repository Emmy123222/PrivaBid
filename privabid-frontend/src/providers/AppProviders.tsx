import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { usePublicClient, useWalletClient } from "wagmi";
import { CofheProvider } from "@cofhe/react";
import { cofheConfig } from "../lib/cofhe";
import { wagmiConfig } from "../lib/wagmi";

function CofheBridge({ children }: { children: ReactNode }) {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  return (
    <CofheProvider
      config={cofheConfig}
      walletClient={walletClient}
      publicClient={publicClient}
    >
      {children}
    </CofheProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <div className="isolate min-h-dvh">
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <CofheBridge>{children}</CofheBridge>
        </QueryClientProvider>
      </WagmiProvider>
    </div>
  );
}
