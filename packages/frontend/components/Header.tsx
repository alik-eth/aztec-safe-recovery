"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { Shield, Bug } from "lucide-react";

export function Header() {
  return (
    <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-blue-500" />
            <span className="text-lg font-semibold text-white">
              Aztec Guardian Recovery
            </span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/setup"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Setup
            </Link>
            <Link
              href="/guardians"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Manage Guardians
            </Link>
            <Link
              href="/guardian"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Guardian Portal
            </Link>
            <Link
              href="/debug"
              className="flex items-center gap-1 text-sm text-yellow-500/70 hover:text-yellow-500 transition-colors"
            >
              <Bug className="h-4 w-4" />
              Debug
            </Link>
            <ConnectButton />
          </nav>
        </div>
      </div>
    </header>
  );
}
