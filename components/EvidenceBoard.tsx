"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { OperatorDashboardDetails } from "@/components/OperatorDashboardDetails";
import { ProfileLink } from "@/components/ProfileLink";

type EvidenceProfile = {
  id: string;
  username: string;
  role: string;
  statusLabel: string;
  wired: boolean;
  health: number;
  operations: string;
  btcSats: number;
  liveChatMessages: number;
  travelStamps: number;
  punches: number;
};

type EvidenceNode = {
  id: string;
  username: string;
  role: string;
  x: number;
  y: number;
};

type EvidenceLine = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  focus: boolean;
  aUsername: string;
  bUsername: string;
};

type EvidenceBoardProps = {
  profile: EvidenceProfile;
  nodes: EvidenceNode[];
  lines: EvidenceLine[];
};

function normalizeSearch(value: string): string[] {
  const cleaned = value.toLowerCase().trim().replace(/^@+/, "");
  return cleaned.length ? cleaned.split(/\s+/).filter(Boolean) : [];
}

function usernameMatchesTokens(username: string, tokens: string[]): boolean {
  if (!tokens.length) {
    return true;
  }

  const lower = username.toLowerCase();
  return tokens.every((token) => lower.includes(token));
}

export function EvidenceBoard({ profile, nodes, lines }: EvidenceBoardProps) {
  const [query, setQuery] = useState("");
  const tokens = useMemo(() => normalizeSearch(query), [query]);

  const profileMatches = usernameMatchesTokens(profile.username, tokens);
  const matchingNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const node of nodes) {
      if (usernameMatchesTokens(node.username, tokens)) {
        ids.add(node.id);
      }
    }
    return ids;
  }, [nodes, tokens]);

  const resultsCount = (profileMatches ? 1 : 0) + matchingNodeIds.size;

  return (
    <div className="evidence-board" id="evidence-board">
      <form role="search" className="evidence-search" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="evidence-user-search" className="evidence-search__label">
          Search Operators
        </label>
        <input
          id="evidence-user-search"
          name="search"
          type="search"
          className="evidence-search__input"
          placeholder="Search by codename..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-controls="evidence-node-list"
        />
        <p className="meta evidence-search__meta">{tokens.length ? `${resultsCount} match(es)` : "Showing all operators"}</p>
      </form>

      <svg className="evidence-network" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {lines.map((line) => {
          const lineMatches =
            !tokens.length ||
            usernameMatchesTokens(line.aUsername, tokens) ||
            usernameMatchesTokens(line.bUsername, tokens);
          const className = !tokens.length
            ? line.focus
              ? "evidence-network__line evidence-network__line--focus"
              : "evidence-network__line"
            : lineMatches
              ? "evidence-network__line evidence-network__line--match"
              : "evidence-network__line evidence-network__line--dim";

          return <line key={line.key} className={className} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />;
        })}
      </svg>

      <div id="evidence-node-list">
        {nodes.map((node) => {
          const matches = usernameMatchesTokens(node.username, tokens);
          const className = !tokens.length
            ? "evidence-node evidence-node--scatter"
            : matches
              ? "evidence-node evidence-node--scatter evidence-node--match"
              : "evidence-node evidence-node--scatter evidence-node--dim";

          return (
            <Link
              key={node.id}
              href={`/profiles/${node.username}`}
              className={className}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              <strong>@{node.username}</strong>
              <small>{node.role}</small>
            </Link>
          );
        })}
      </div>

      <section className={!tokens.length || profileMatches ? "evidence-focus" : "evidence-focus evidence-focus--dim"}>
        <h2>
          <ProfileLink username={profile.username} />
        </h2>
        <OperatorDashboardDetails {...profile} />
      </section>
    </div>
  );
}
