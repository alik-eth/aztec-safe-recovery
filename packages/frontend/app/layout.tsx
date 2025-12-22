import type { Metadata } from "next";
import "./globals.css";
import { WagmiProvider } from "@/components/providers/WagmiProvider";

export const metadata: Metadata = {
  title: "Aztec Guardian Recovery",
  description: "Privacy-preserving social recovery for Safe wallets using Aztec",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <WagmiProvider>{children}</WagmiProvider>
      </body>
    </html>
  );
}
