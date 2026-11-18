"use client";

import { useId, useRef, useState } from "react";

interface Props {
  busy: boolean;
  /** Resolves to true when the feed was added, so the form can close. */
  onAdd: (url: string) => Promise<boolean>;
}

/** Google Reader's "Add a subscription" button, with a form for a feed URL. */
export function AddSubscription({ busy, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);

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

  return (
    <form
      className="subscribe-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!url.trim() || busy) return;
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
        disabled={busy}
        onChange={(event) => setUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      />
      <div className="subscribe-actions">
        <button type="submit" className="subscribe-add" disabled={busy || !url.trim()}>
          {busy ? "Adding…" : "Add"}
        </button>
        <button type="button" className="subscribe-cancel" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <p className="subscribe-note">Real feeds run live: articles stay in this browser, and stories are compared by AI.</p>
    </form>
  );
}
