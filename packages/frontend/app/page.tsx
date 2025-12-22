"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Shield, Users, Lock, ArrowRight, Zap } from "lucide-react";

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black">
      <Header />

      <main>
        {/* Hero Section */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
              Privacy-Preserving
              <br />
              <span className="text-blue-500">Social Recovery</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-zinc-400 max-w-2xl mx-auto">
              Protect your Safe wallet with secret guardians on Aztec.
              Your guardians remain anonymous until recovery is needed.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link href="/setup">
                <Button size="lg" className="gap-2">
                  Get Started <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/guardian">
                <Button size="lg" variant="outline">
                  Guardian Portal
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid gap-8 md:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-900/30 mb-4">
                  <Lock className="h-6 w-6 text-blue-400" />
                </div>
                <CardTitle>Secret Guardians</CardTitle>
                <CardDescription>
                  Your guardians are stored on Aztec Network, completely private
                  and hidden from public view.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-900/30 mb-4">
                  <Users className="h-6 w-6 text-green-400" />
                </div>
                <CardTitle>Threshold Voting</CardTitle>
                <CardDescription>
                  Set a threshold for recovery. Multiple guardians must agree
                  before any recovery action is executed.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-900/30 mb-4">
                  <Zap className="h-6 w-6 text-purple-400" />
                </div>
                <CardTitle>Cross-Chain Recovery</CardTitle>
                <CardDescription>
                  Guardians vote on Aztec, and the recovery is executed on your
                  Safe via Wormhole messaging.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        {/* How It Works */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <h2 className="text-2xl font-bold text-white text-center mb-12">
            How It Works
          </h2>
          <div className="grid gap-8 md:grid-cols-4">
            {[
              {
                step: "1",
                title: "Connect Safe",
                description: "Link your Safe wallet to the recovery system",
              },
              {
                step: "2",
                title: "Add Secret Guardians",
                description: "Add Aztec addresses as your hidden guardians",
              },
              {
                step: "3",
                title: "Set Threshold",
                description: "Choose how many guardians needed for recovery",
              },
              {
                step: "4",
                title: "Install Module",
                description: "Enable the recovery module on your Safe",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-lg mb-4">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-zinc-400">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Recovery Flow */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <Card className="bg-zinc-900/80">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold text-white mb-6">
                When Recovery is Needed
              </h2>
              <div className="grid gap-6 md:grid-cols-3">
                <div className="rounded-lg bg-zinc-800/50 p-6">
                  <div className="text-blue-400 font-semibold mb-2">Step 1</div>
                  <h3 className="text-white font-medium mb-2">Guardian Initiates</h3>
                  <p className="text-sm text-zinc-400">
                    A secret guardian starts a vote with a proposed new owner address
                  </p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-6">
                  <div className="text-blue-400 font-semibold mb-2">Step 2</div>
                  <h3 className="text-white font-medium mb-2">Guardians Vote</h3>
                  <p className="text-sm text-zinc-400">
                    Other guardians vote on Aztec - their identities remain private
                  </p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-6">
                  <div className="text-blue-400 font-semibold mb-2">Step 3</div>
                  <h3 className="text-white font-medium mb-2">Recovery Executes</h3>
                  <p className="text-sm text-zinc-400">
                    Once threshold reached, the new owner is set via Wormhole message
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to Protect Your Safe?
            </h2>
            <p className="text-zinc-400 mb-8 max-w-xl mx-auto">
              Set up secret guardian recovery in minutes. Your guardians stay
              anonymous, and you stay in control.
            </p>
            <Link href="/setup">
              <Button size="lg" className="gap-2">
                Start Setup <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              <span className="text-sm text-zinc-400">Aztec Guardian Recovery</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-zinc-500">
              <span>Built with Aztec Network</span>
              <span>&middot;</span>
              <span>Powered by Wormhole</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
