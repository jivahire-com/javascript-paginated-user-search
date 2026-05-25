/**
 * Paginated user search controller.
 *
 * Models the data layer that a React/Vue/Svelte UI would sit on top of when
 * rendering a searchable, paginated user list:
 *
 *   - `setQuery(q)` debounces, then fetches the matching first page.
 *   - `setPage(p)` switches pages immediately (no debounce — clicking page 2
 *     should not wait for keystroke debounce to elapse).
 *   - `subscribe(cb)` notifies subscribers of every state transition.
 *   - `getState()` returns the latest snapshot for the renderer.
 *
 * Expected shapes:
 *   fetchUsers(query, page, pageSize) -> Promise<{ users: User[], total: number }>
 *   User  = { id: string, name: string, email: string }
 *   State = { query, page, pageSize, users, total, totalPages, loading }
 */

export class UserSearch {
  /**
   * @param {{
   *   fetchUsers: (query: string, page: number, pageSize: number) =>
   *     Promise<{ users: Array<{id:string,name:string,email:string}>, total: number }>,
   *   pageSize: number,
   *   debounceMs?: number,
   * }} opts
   */
  constructor(opts) {
    this.fetchUsers = opts.fetchUsers;
    this.pageSize = opts.pageSize;
    this.debounceMs = opts.debounceMs ?? 150;

    this.listeners = new Set();
    this.query = "";
    this.page = 1;
    this.users = [];
    this.total = 0;
    this.loading = false;
    this.debounceTimer = null;

    // FIX Bug 2: counter incremented before every fetch; each async
    // invocation closes over its own snapshot and discards itself if a
    // newer fetch has started by the time it resolves.
    this.currentRequestId = 0;
  }

  /** Update the search query. Debounced. Subsequent calls cancel the prior timer. */
  setQuery(q) {
    this.query = q;
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      // FIX Bug 1: read this.page HERE (when the timer fires), not at
      // scheduling time. Any setPage() calls that happened during the
      // debounce window are now correctly picked up.
      void this._runFetch(q, this.page);
    }, this.debounceMs);
  }

  /** Switch to a specific page (1-indexed). Triggers a fetch immediately — not debounced. */
  setPage(p) {
    if (!Number.isInteger(p) || p < 1) {
      throw new RangeError("page must be a positive integer");
    }
    this.page = p;
    void this._runFetch(this.query, p);
  }

  /** Current snapshot for the renderer. */
  getState() {
    return {
      query: this.query,
      page: this.page,
      pageSize: this.pageSize,
      users: this.users,
      total: this.total,
      // FIX Bug 3: Math.ceil so a trailing partial page is counted.
      // e.g. 11 users / pageSize 5 → ceil(2.2) = 3 pages, not floor = 2.
      // Edge case: total 0 → ceil(0) = 0, which is acceptable per the tests.
      totalPages: Math.ceil(this.total / this.pageSize),
      loading: this.loading,
    };
  }

  subscribe(cb) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Cancel pending work and drop subscribers. Idempotent. */
  dispose() {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.listeners.clear();
  }

  async _runFetch(query, page) {
    // FIX Bug 2: stamp this request before the await so any later fetch
    // that starts while this one is in flight will invalidate us.
    const requestId = ++this.currentRequestId;

    this.loading = true;
    this._emit();

    let result;
    try {
      result = await this.fetchUsers(query, page, this.pageSize);
    } catch (err) {
      // Only clear loading for the request that is still current.
      if (requestId === this.currentRequestId) {
        this.loading = false;
        this._emit();
      }
      throw err;
    }

    // FIX Bug 2: if a newer request has started since we awaited, discard
    // this stale response entirely — do not touch users, total, or loading.
    if (requestId !== this.currentRequestId) return;

    this.users = result.users;
    this.total = result.total;
    this.loading = false;
    this._emit();
  }

  _emit() {
    const state = this.getState();
    for (const l of this.listeners) l(state);
  }
}
