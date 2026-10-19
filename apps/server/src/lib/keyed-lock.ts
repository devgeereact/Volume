/**
 * An in-process lock per key: `run(key, fn)` waits for every earlier `fn` with the same key to settle, then runs. The
 * server is one Node process (D-038), so this makes a check-then-enqueue step atomic for one key, for example one
 * paid job per book even when the owner double-clicks.
 */
export class KeyedLock {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const before = this.tails.get(key) ?? Promise.resolve();
    const mine = before.then(fn, fn);
    // The tail never rejects, so a failed step does not block the next one.
    const tail = mine.catch(() => undefined);
    this.tails.set(key, tail);
    try {
      return await mine;
    } finally {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}
