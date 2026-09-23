"use client";

import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  connectWallet,
  getArtisanDashboard,
  getConnectedAddressIfAvailable,
  releaseVouches,
  slashFraud,
  vouchFor
} from "../../src/utils/contract";

const MIN_VOUCH_STAKE = 50;

export default function VouchPage() {
  const [hydrated, setHydrated] = useState(false);
  const [address, setAddress] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const [candidateAddress, setCandidateAddress] = useState("");
  const [stake, setStake] = useState(String(MIN_VOUCH_STAKE));
  const [vouching, setVouching] = useState(false);

  const [releaseAddress, setReleaseAddress] = useState("");
  const [releasing, setReleasing] = useState(false);

  const [slashAddress, setSlashAddress] = useState("");
  const [slashing, setSlashing] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const existing = getConnectedAddressIfAvailable();
    if (existing) {
      setAddress(existing);
    }
  }, [hydrated]);

  async function loadDashboard(wallet) {
    setLoading(true);
    try {
      const data = await getArtisanDashboard(wallet);
      setDashboard(data);
    } catch (error) {
      setStatus(error?.shortMessage || error?.message || "Could not load artisan dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (address) {
      loadDashboard(address);
    } else {
      setDashboard(null);
    }
  }, [address]);

  async function onConnect() {
    try {
      const result = await connectWallet();
      setAddress(result.address);
    } catch (error) {
      setStatus(error?.shortMessage || error?.message || "Failed to connect wallet.");
    }
  }

  async function onVouch(event) {
    event.preventDefault();
    setStatus("");

    if (!candidateAddress || !candidateAddress.startsWith("0x") || candidateAddress.length !== 42) {
      setStatus("Enter a valid candidate wallet address.");
      return;
    }

    const stakeNumber = Number(stake);
    if (!Number.isFinite(stakeNumber) || stakeNumber < MIN_VOUCH_STAKE) {
      setStatus("Stake must be at least " + MIN_VOUCH_STAKE + ".");
      return;
    }

    setVouching(true);
    try {
      const receipt = await vouchFor(candidateAddress, stakeNumber);
      const txHash = receipt?.transactionHash || receipt?.hash || "";
      setStatus(
        "Vouched for " +
        candidateAddress +
        " with " +
        stakeNumber +
        " reputation." +
        (txHash ? " Tx: https://sepolia.etherscan.io/tx/" + txHash : "")
      );
      await loadDashboard(address);
    } catch (error) {
      setStatus(error?.shortMessage || error?.message || "Vouch failed.");
    } finally {
      setVouching(false);
    }
  }

  async function onRelease(event) {
    event.preventDefault();
    setStatus("");

    if (!releaseAddress || !releaseAddress.startsWith("0x") || releaseAddress.length !== 42) {
      setStatus("Enter a valid candidate wallet address to release.");
      return;
    }

    setReleasing(true);
    try {
      const receipt = await releaseVouches(releaseAddress);
      const txHash = receipt?.transactionHash || receipt?.hash || "";
      setStatus(
        "Released vouches for " +
        releaseAddress +
        "." +
        (txHash ? " Tx: https://sepolia.etherscan.io/tx/" + txHash : "")
      );
      await loadDashboard(address);
    } catch (error) {
      setStatus(error?.shortMessage || error?.message || "Release failed (owner-only action).");
    } finally {
      setReleasing(false);
    }
  }

  async function onSlash(event) {
    event.preventDefault();
    setStatus("");

    if (!slashAddress || !slashAddress.startsWith("0x") || slashAddress.length !== 42) {
      setStatus("Enter a valid fraudulent artisan wallet address.");
      return;
    }

    setSlashing(true);
    try {
      const receipt = await slashFraud(slashAddress);
      const txHash = receipt?.transactionHash || receipt?.hash || "";
      setStatus(
        "Slashed " +
        slashAddress +
        " -- every voucher's stake is burned and their royalty penalty increased." +
        (txHash ? " Tx: https://sepolia.etherscan.io/tx/" + txHash : "")
      );
    } catch (error) {
      setStatus(error?.shortMessage || error?.message || "Slash failed (owner-only action).");
    } finally {
      setSlashing(false);
    }
  }

  if (!hydrated) {
    return (
      <section className="grid gap-4">
        <h1 className="m-0 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[#f3f6f4]">
          Web of Trust
        </h1>
        <p className="m-0 text-[#aebbb5]">Loading...</p>
      </section>
    );
  }

  const profile = dashboard?.profile;

  return (
    <section className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[#f3f6f4]">
          Web of Trust
        </h1>
        <p className="m-0 text-[#aebbb5]">
          Stake your reputation to vouch for another artisan. If they&apos;re later found fraudulent, your stake is
          burned and your own future royalties are permanently reduced.
        </p>
      </div>

      <div>
        <Button onClick={onConnect} className="min-w-44">
          {address ? "Connected: " + address.slice(0, 8) + "..." : "Connect Wallet"}
        </Button>
      </div>

      {status && <p className="m-0 text-[#aebbb5]">{status}</p>}

      {!address && (
        <Card className="max-w-3xl">
          <CardContent className="pt-6 text-sm text-[#aebbb5]">
            Connect your wallet to see your reputation and vouch for other artisans.
          </CardContent>
        </Card>
      )}

      {address && (
        <Card className="max-w-3xl">
          <CardHeader className="pb-2">
            <CardTitle>Your Reputation</CardTitle>
            <CardDescription>{loading ? "Loading..." : "Read directly from ArtisanRegistry."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-3">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Verified</p>
              <Badge variant={dashboard?.verified ? "default" : "warm"}>{dashboard?.verified ? "Yes" : "No"}</Badge>
            </div>
            <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-3">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Reputation Score</p>
              <p className="m-0 text-lg font-semibold text-[#f3f6f4]">{String(profile?.reputationScore ?? "-")}</p>
            </div>
            <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-3">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Locked (staked on others)</p>
              <p className="m-0 text-lg font-semibold text-[#f3f6f4]">{String(profile?.lockedReputation ?? "-")}</p>
            </div>
            <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-3">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Available to Stake</p>
              <p className="m-0 text-lg font-semibold text-[#4ade80]">{String(dashboard?.availableReputation ?? "-")}</p>
            </div>
            <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-3 md:col-span-2">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">
                Royalty Penalty (from past slashing)
              </p>
              <p className="m-0 text-lg font-semibold text-[#f3f6f4]">
                {dashboard?.penaltyBps ? (dashboard.penaltyBps / 100).toFixed(2) + "%" : "0%"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="max-w-3xl">
        <CardHeader className="pb-2">
          <CardTitle>Vouch for an Artisan</CardTitle>
          <CardDescription>
            Requires you to be a verified artisan. The candidate must already be registered and Aadhaar-verified.
            Minimum stake: {MIN_VOUCH_STAKE}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onVouch} className="grid gap-3">
            <Input
              required
              placeholder="Candidate wallet address (0x...)"
              value={candidateAddress}
              onChange={(e) => setCandidateAddress(e.target.value)}
            />
            <Input
              required
              type="number"
              min={MIN_VOUCH_STAKE}
              placeholder={"Reputation stake (min " + MIN_VOUCH_STAKE + ")"}
              value={stake}
              onChange={(e) => setStake(e.target.value)}
            />
            <Button type="submit" disabled={vouching} className="w-fit">
              {vouching ? "Vouching..." : "Vouch"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-3xl border-[#26312b] bg-[#131917]">
        <CardHeader className="pb-2">
          <CardTitle>Owner-Only Actions</CardTitle>
          <CardDescription>
            These will revert unless your connected wallet is the contract owner -- shown here for
            transparency about what the platform administrator can do, and why.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form onSubmit={onRelease} className="grid gap-3">
            <p className="m-0 text-sm font-semibold text-[#f3f6f4]">Release Vouches (candidate cleared review)</p>
            <Input
              required
              placeholder="Candidate wallet address (0x...)"
              value={releaseAddress}
              onChange={(e) => setReleaseAddress(e.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={releasing} className="w-fit">
              {releasing ? "Releasing..." : "Release Vouches"}
            </Button>
          </form>

          <form onSubmit={onSlash} className="grid gap-3">
            <p className="m-0 text-sm font-semibold text-[#f3f6f4]">Report Fraud (slash)</p>
            <Input
              required
              placeholder="Fraudulent artisan wallet address (0x...)"
              value={slashAddress}
              onChange={(e) => setSlashAddress(e.target.value)}
            />
            <Button type="submit" variant="destructive" disabled={slashing} className="w-fit">
              {slashing ? "Slashing..." : "Slash"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
