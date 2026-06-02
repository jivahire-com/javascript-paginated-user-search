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
 * The starter passes the simplest happy paths but has planted bugs in
 * (a) what the debounced callback closes over, (b) how overlapping fetches
 * are reconciled, and (c) the totalPages math. Read the failing public tests
 * before changing anything — they point at the bugs without naming them.
 *
 * Expected shapes:
 *   fetchUsers(query, page, pageSize) -> Promise<{ users: User[], total: number }>
 *   User  = { id: string, name: string, email: string }
 *   State = { query, page, pageSize, users, total, totalPages, loading }
 */

export class UserSearch {
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
    this._fetchGeneration = 0; // monotonically increasing; guards against stale responses
  }

  /** Update the search query. Debounced. Subsequent calls cancel the prior timer. */
  setQuery(q) {
    this.query = q;
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);

    // Fix: read this.page at fire time, not at schedule time.
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this._runFetch(this.query, this.page);
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
      // Fix: ceil so a trailing partial page is counted.
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
    // Increment generation so any currently in-flight fetch becomes stale.
    const generation = ++this._fetchGeneration;

    this.loading = true;
    this._emit();

    let result;
    try {
      result = await this.fetchUsers(query, page, this.pageSize);
    } catch (err) {
      // Only clear loading if this is still the current fetch.
      if (generation === this._fetchGeneration) {
        this.loading = false;
        this._emit();
      }
      throw err;
    }

    // Fix: discard the response if a newer fetch has since been started.
    if (generation !== this._fetchGeneration) {
      return;
    }

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
