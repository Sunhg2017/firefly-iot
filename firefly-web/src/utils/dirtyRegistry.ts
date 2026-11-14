/**
 * Tracks which mounted routes currently hold unsaved edits.
 *
 * The layout uses this registry before closing a page tab so that tab closing,
 * menu navigation and browser refresh all share one "unsaved changes" notion
 * instead of each page inventing its own prompt.
 */
const dirtyPaths = new Set<string>();

export function setPathDirty(path: string, dirty: boolean): void {
  if (dirty) {
    dirtyPaths.add(path);
  } else {
    dirtyPaths.delete(path);
  }
}

export function isPathDirty(path: string): boolean {
  return dirtyPaths.has(path);
}

export function clearPathDirty(path: string): void {
  dirtyPaths.delete(path);
}
