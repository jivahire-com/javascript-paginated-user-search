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

    // BUG FIX (b): generation counter — incremented on every _runFetch call.
    // Each async invocation captures its own generation at call time and
    // checks it after the await. If the counter has moved on, the response
    // is stale and must be discarded.
    this._fetchGeneration = 0;
  }

  /** Update the search query. Debounced. Subsequent calls cancel the prior timer. */
  setQuery(q) {
    this.query = q;
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);

    // BUG FIX (a): do NOT capture this.page here at scheduling time.
    // Read this.page inside the callback so it reflects any page changes
    // (e.g. via setPage) that happen while the debounce is still pending.
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
      // BUG FIX (c): Math.floor cuts off the trailing partial page.
      // Math.ceil correctly rounds up so 11 users / pageSize 5 → 3 pages.
      // Special-case total=0 → 0 pages (ceil(0/n) is already 0, so no
      // extra branch needed, but being explicit keeps the intent clear).
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
    // Bump the generation so any in-flight fetch is silently discarded.
    this._fetchGeneration++;
    this.listeners.clear();
  }

  async _runFetch(query, page) {
    // BUG FIX (b): capture the generation BEFORE the await so we can detect
    // whether a newer fetch has started by the time this one resolves.
    const generation = ++this._fetchGeneration;

    this.loading = true;
    this._emit();

    let result;
    try {
      result = await this.fetchUsers(query, page, this.pageSize);
    } catch (err) {
      // Only clear loading if this fetch is still the current one.
      if (generation === this._fetchGeneration) {
        this.loading = false;
        this._emit();
      }
      throw err;
    }

    // Discard stale responses — a newer fetch has already taken ownership.
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
