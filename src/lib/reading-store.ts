// The visitor's reading state. It lives in this browser's localStorage, so every visitor,
// including each judge, gets their own history. There are no accounts.

export interface ReadingState {
  /** Article IDs in first-read order. */
  history: string[];
  /** Article IDs pulled out of their clusters with X, in order. */
  detached: string[];
  /** Starred story IDs. */
  starred: string[];
  /** Show stories instead of every article. Off on the first visit, so the overload shows first. */
  grouped: boolean;
}

const STORAGE_KEY = "reader:v1";

export const EMPTY_READING_STATE: ReadingState = { history: [], detached: [], starred: [], grouped: false };

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string"))] : [];
}

/** Reads stored state. Missing or damaged data gives an empty state instead of an error. */
export function parseReadingState(raw: string | null): ReadingState {
  if (!raw) return EMPTY_READING_STATE;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return EMPTY_READING_STATE;
    const record = value as Record<string, unknown>;
    return {
      history: uniqueStrings(record.history),
      detached: uniqueStrings(record.detached),
      starred: uniqueStrings(record.starred),
      grouped: record.grouped === true,
    };
  } catch {
    return EMPTY_READING_STATE;
  }
}

/** Stars or unstars a story. */
export function toggleStar(state: ReadingState, clusterId: string): ReadingState {
  const starred = state.starred.includes(clusterId)
    ? state.starred.filter((id) => id !== clusterId)
    : [...state.starred, clusterId];
  return { ...state, starred };
}

/** Adds articles to the history in order, skipping ones already read. Returns the same state if nothing changed. */
export function markRead(state: ReadingState, articleIds: readonly string[]): ReadingState {
  const unread = articleIds.filter((id, index) => !state.history.includes(id) && articleIds.indexOf(id) === index);
  return unread.length === 0 ? state : { ...state, history: [...state.history, ...unread] };
}

/** Drops deleted articles and follows story IDs when deletion chooses a new primary article. */
export function pruneReading(
  state: ReadingState,
  articleIds: readonly string[],
  storyIds: Readonly<Record<string, string | null>>,
): ReadingState {
  const removed = new Set(articleIds);
  const starred = state.starred.flatMap((id): string[] => {
    const replacement = storyIds[id];
    if (replacement === null) return [];
    return [replacement ?? id];
  });
  return {
    ...state,
    history: state.history.filter((id) => !removed.has(id)),
    detached: state.detached.filter((id) => !removed.has(id)),
    starred: [...new Set(starred)],
  };
}

// Storage, with an in-memory fallback when localStorage is blocked or full.
let memory: string | null = null;
let memoryOnly = false;

function readRaw(): string | null {
  if (memoryOnly) return memory;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    memoryOnly = true;
    return memory;
  }
}

function writeRaw(raw: string): void {
  memory = raw;
  if (memoryOnly) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    memoryOnly = true;
  }
}

// An external store for useSyncExternalStore.
let cachedRaw: string | null | undefined;
let cachedState: ReadingState = EMPTY_READING_STATE;
const listeners = new Set<() => void>();

export function getReadingSnapshot(): ReadingState {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = parseReadingState(raw);
  }
  return cachedState;
}

export function getServerReadingSnapshot(): ReadingState {
  return EMPTY_READING_STATE;
}

export function subscribeReading(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function updateReading(change: (state: ReadingState) => ReadingState): void {
  const current = getReadingSnapshot();
  const next = change(current);
  if (next === current) return;
  writeRaw(JSON.stringify(next));
  for (const listener of listeners) listener();
}
