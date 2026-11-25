"use client";

import { useState } from "react";
import { isFeedSource } from "@/lib/live";
import { formatCount, groupByFolder, sameView, type UnreadCounts, type View } from "@/lib/reader-view";
import type { Source } from "@/lib/types";
import { AddArticle } from "./AddArticle";
import { AddSubscription } from "./AddSubscription";

interface Props {
  sources: Source[];
  counts: UnreadCounts;
  view: View;
  onView: (view: View) => void;
  /** True while live feeds are being fetched. */
  busy: boolean;
  onAddFeed: (url: string) => Promise<boolean>;
  onAddArticle: (url: string) => Promise<boolean>;
  onImport: (file: File, onProgress: (done: number, total: number) => void) => Promise<boolean>;
}

export function Sidebar({ sources, counts, view, onView, busy, onAddFeed, onAddArticle, onImport }: Props) {
  const [closed, setClosed] = useState<string[]>([]);
  const feeds = sources.filter(isFeedSource);
  const saved = sources.filter((source) => source.saved);

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
    <nav className="sidebar" aria-label="Feeds and saved pages">
      <AddSubscription busy={busy} onAdd={onAddFeed} onImport={onImport} />
      <AddArticle busy={busy} onAdd={onAddArticle} />
      {item({ kind: "all" }, "All items", counts.all, "nav-all")}
      {item({ kind: "starred" }, "Starred items", null, "nav-starred")}
      <h2 className="nav-heading">Subscriptions</h2>
      <ul className="nav-feeds">
        {groupByFolder(feeds).map(({ folder, sources: members }) => {
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
      {saved.length > 0 ? (
        <>
          <h2 className="nav-heading">Saved pages</h2>
          <ul className="nav-feeds">{saved.map(feed)}</ul>
        </>
      ) : null}
    </nav>
  );
}
