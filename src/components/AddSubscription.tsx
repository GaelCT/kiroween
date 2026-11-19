"use client";

import { useId, useRef, useState } from "react";

interface Progress {
  done: number;
  total: number;
}

interface Props {
  busy: boolean;
  /** Resolves to true when the feed was added, so the form can close. */
  onAdd: (url: string) => Promise<boolean>;
  /** Imports the feeds in an OPML file. Resolves to true when it subscribed to any, so the form can close. */
  onImport: (file: File, onProgress: (done: number, total: number) => void) => Promise<boolean>;
}

/** Google Reader's "Add a subscription" button, with a form for a feed URL or an OPML file. */
export function AddSubscription({ busy, onAdd, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const locked = busy || importing;

  if (!open) {
    return (
      <button
        type="button"
        className="subscribe-button"
        onClick={() => {
          setOpen(true);
          window.setTimeout(() => input.current?.focus(), 0);
        }}
      >
        Add a subscription
      </button>
    );
  }

  async function importFile(file: File) {
    setImporting(true);
    try {
      if (await onImport(file, (done, total) => setProgress({ done, total }))) setOpen(false);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  return (
    <form
      className="subscribe-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!url.trim() || locked) return;
        if (await onAdd(url.trim())) {
          setUrl("");
          setOpen(false);
        }
      }}
    >
      <label htmlFor={inputId} className="subscribe-label">
        RSS or Atom feed URL
      </label>
      <input
        ref={input}
        id={inputId}
        type="url"
        className="subscribe-input"
        placeholder="https://example.com/feed.xml"
        value={url}
        disabled={locked}
        onChange={(event) => setUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      />
      <div className="subscribe-actions">
        <button type="submit" className="subscribe-add" disabled={locked || !url.trim()}>
          {busy && !importing ? "Adding…" : "Add"}
        </button>
        <button type="button" className="subscribe-cancel" disabled={locked} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <div className="subscribe-import">
        <button type="button" className="subscribe-import-button" disabled={locked} onClick={() => fileInput.current?.click()}>
          Import subscriptions (OPML)
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".opml,.xml,text/x-opml,text/xml,application/xml"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared so that picking the same file again still counts as a change.
            event.target.value = "";
            if (file && !locked) void importFile(file);
          }}
        />
      </div>
      {progress ? (
        <p className="subscribe-progress" role="status">
          {progress.done < progress.total ? `Importing feeds: ${progress.done} of ${progress.total}…` : "Grouping and comparing stories…"}
        </p>
      ) : null}
      <p className="subscribe-note">Real feeds run live: articles stay in this browser, and stories are compared by AI.</p>
    </form>
  );
}
