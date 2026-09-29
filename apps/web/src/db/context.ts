/**
 * Sync Context Management for Loop Protection and Echo Suppression
 * Ensures changes written by the remote sync pull handler do NOT re-enqueue
 * outbound sync jobs.
 */

let remoteSyncActive = false;

/**
 * Returns whether the current execution thread is running an incoming remote sync.
 */
export function isRemoteSync(): boolean {
  return remoteSyncActive;
}

/**
 * Explicitly sets the remote sync execution state.
 */
export function setRemoteSync(active: boolean): void {
  remoteSyncActive = active;
}

/**
 * Executes an async operation with remote sync mode enabled.
 * Restores previous state on completion or error.
 */
export async function withRemoteSync<T>(operation: () => Promise<T>): Promise<T> {
  const previousState = remoteSyncActive;
  remoteSyncActive = true;
  try {
    return await operation();
  } finally {
    remoteSyncActive = previousState;
  }
}
