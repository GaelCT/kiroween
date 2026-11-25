// Browser file I/O for complete archive backups. Importing never fetches a feed or calls an API.

import { BackupParseError, parseArchiveBackup, serializeArchiveBackup, type ArchiveBackupData } from "./archive-backup";
import { getLiveSnapshot, restoreLiveState, type LiveResult } from "./live-store";
import { getReadingSnapshot, updateReading } from "./reading-store";

export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

/** Downloads a human-readable JSON snapshot of this browser's archive and reading state. */
export function downloadArchiveBackup(): LiveResult {
  try {
    const raw = serializeArchiveBackup(getLiveSnapshot().state, getReadingSnapshot());
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `reader-archive-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return { ok: true, message: "Archive backup downloaded." };
  } catch {
    return { ok: false, message: "Couldn't create the archive backup in this browser." };
  }
}

/** Reads and validates a file without changing the current archive. */
export async function readArchiveBackupFile(file: File): Promise<ArchiveBackupData> {
  if (file.size > MAX_BACKUP_BYTES) throw new BackupParseError("That backup is too large. Choose a Reader JSON backup smaller than 25 MB.");
  let raw: string;
  try {
    raw = await file.text();
  } catch {
    throw new BackupParseError("Couldn't read that backup file.");
  }
  return parseArchiveBackup(raw);
}

/** Replaces both local stores after the file has been validated and the reader has confirmed. */
export function replaceArchiveBackup(backup: ArchiveBackupData): LiveResult {
  restoreLiveState(backup.archive);
  updateReading(() => backup.reading);
  const articles = Object.keys(backup.archive.articles).length;
  const feeds = backup.archive.sources.filter((source) => !source.saved).length;
  return {
    ok: true,
    message: `Restored ${articles} ${articles === 1 ? "article" : "articles"} from ${feeds} ${feeds === 1 ? "feed" : "feeds"}, plus saved pages and reading state.`,
  };
}
