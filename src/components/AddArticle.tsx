"use client";

import { useId, useRef, useState } from "react";

interface Props {
  busy: boolean;
  /** Resolves to true when the article was saved, so the form can close. */
  onAdd: (url: string) => Promise<boolean>;
}

/** Saves one article page without subscribing to the site's feed. */
export function AddArticle({ busy, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);

  if (!open) {
    return (
      <button
        type="button"
        className="article-button"
        onClick={() => {
          setOpen(true);
          window.setTimeout(() => input.current?.focus(), 0);
        }}
      >
        Add article by URL
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
        Article page URL
      </label>
      <input
        ref={input}
        id={inputId}
        type="url"
        className="subscribe-input"
        placeholder="https://example.com/article"
        value={url}
        disabled={busy}
        onChange={(event) => setUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      />
      <div className="subscribe-actions">
        <button type="submit" className="subscribe-add" disabled={busy || !url.trim()}>
          {busy ? "Saving…" : "Save article"}
        </button>
        <button type="button" className="subscribe-cancel" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <p className="subscribe-note">Saves only this page in your browser. It won’t subscribe you to the site’s feed.</p>
    </form>
  );
}
