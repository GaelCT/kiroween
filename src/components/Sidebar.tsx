"use client";

import { formatCount, sameView, type UnreadCounts, type View } from "@/lib/reader-view";
import type { Source } from "@/lib/types";

interface Props {
  sources: Source[];
  counts: UnreadCounts;
  view: View;
  onView: (view: View) => void;
}

export function Sidebar({ sources, counts, view, onView }: Props) {
  const item = (target: View, label: string, count: number | null, className = "") => (
    <button
      type="button"
      className={`nav-item ${className}${sameView(view, target) ? " is-selected" : ""}${count ? " has-unread" : ""}`}
      aria-current={sameView(view, target) ? "page" : undefined}
      onClick={() => onView(target)}
    >
      {label}
      {count ? <span className="nav-count"> ({formatCount(count)})</span> : null}
    </button>
  );

  return (
    <nav className="sidebar" aria-label="Feeds">
      {item({ kind: "all" }, "All items", counts.all, "nav-all")}
      {item({ kind: "starred" }, "Starred items", null, "nav-starred")}
      <h2 className="nav-heading">Subscriptions</h2>
      <ul className="nav-feeds">
        {sources.map((source) => (
          <li key={source.id}>{item({ kind: "source", sourceId: source.id }, source.name, counts.bySource[source.id] ?? 0)}</li>
        ))}
      </ul>
    </nav>
  );
}
