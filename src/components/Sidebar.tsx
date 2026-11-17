"use client";

import { useState } from "react";
import { formatCount, groupByFolder, sameView, type UnreadCounts, type View } from "@/lib/reader-view";
import type { Source } from "@/lib/types";

interface Props {
  sources: Source[];
  counts: UnreadCounts;
  view: View;
  onView: (view: View) => void;
}

export function Sidebar({ sources, counts, view, onView }: Props) {
  const [closed, setClosed] = useState<string[]>([]);

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

  const feed = (source: Source) => (
    <li key={source.id}>{item({ kind: "source", sourceId: source.id }, source.name, counts.bySource[source.id] ?? 0)}</li>
  );

  return (
    <nav className="sidebar" aria-label="Feeds">
      {item({ kind: "all" }, "All items", counts.all, "nav-all")}
      {item({ kind: "starred" }, "Starred items", null, "nav-starred")}
      <h2 className="nav-heading">Subscriptions</h2>
      <ul className="nav-feeds">
        {groupByFolder(sources).map(({ folder, sources: members }) => {
          if (!folder) return members.map(feed);
          const open = !closed.includes(folder);
          const total = members.reduce((sum, source) => sum + (counts.bySource[source.id] ?? 0), 0);
          return (
            <li key={`folder:${folder}`} className="nav-folder">
              <div className="nav-folder-head">
                <button
                  type="button"
                  className="nav-folder-toggle"
                  aria-expanded={open}
                  aria-label={`${open ? "Collapse" : "Expand"} ${folder}`}
                  onClick={() => setClosed(open ? [...closed, folder] : closed.filter((name) => name !== folder))}
                >
                  {open ? "▾" : "▸"}
                </button>
                {item({ kind: "folder", folder }, folder, total, "nav-folder-name")}
              </div>
              {open ? <ul className="nav-feeds nav-folder-feeds">{members.map(feed)}</ul> : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
