"use client";

import { useRef, useState } from "react";

interface Props {
  busy: boolean;
  onExport: () => void;
  /** Resolves to true when a backup was restored, so the panel can close. */
  onImport: (file: File) => Promise<boolean>;
}

/** Complete JSON backup controls, kept separate from feed-only OPML import. */
export function ArchiveBackup({ busy, onExport, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const locked = busy || importing;

  if (!open) {
    return (
      <button type="button" className="article-button backup-button" onClick={() => setOpen(true)}>
        Backup & restore
      </button>
    );
  }

  return (
    <section className="subscribe-form backup-panel" aria-label="Archive backup">
      <h2 className="subscribe-label">Archive backup</h2>
      <div className="backup-actions">
        <button type="button" className="subscribe-import-button" disabled={locked} onClick={onExport}>
          Export JSON backup
        </button>
        <button type="button" className="subscribe-import-button" disabled={locked} onClick={() => fileInput.current?.click()}>
          Import JSON backup
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file || locked) return;
            setImporting(true);
            try {
              if (await onImport(file)) setOpen(false);
            } finally {
              setImporting(false);
            }
          }}
        />
      </div>
      <p className="subscribe-note">
        JSON includes feeds, saved pages, stories, stars, and history. Import replaces this browser’s archive after confirmation.
      </p>
      <button type="button" className="subscribe-cancel" disabled={locked} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </section>
  );
}
