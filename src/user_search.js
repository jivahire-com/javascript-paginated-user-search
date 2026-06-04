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
    this.activeFetchToken = 0; // New field to track active fetch requests
  }

  setQuery(q) {
    this.query = q;
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);

    // Use the latest page when the timer fires
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this._runFetch(q, this.page);
    }, this.debounceMs);
  }

  setPage(p) {
    if (!Number.isInteger(p) || p < 1) {
      throw new RangeError("page must be a positive integer");
    }
    this.page = p;
    void this._runFetch(this.query, p);
  }

  getState() {
    return {
      query: this.query,
      page: this.page,
      pageSize: this.pageSize,
      users: this.users,
      total: this.total,
      // Correct the pagination formula using Math.ceil
      totalPages: Math.ceil(this.total / this.pageSize),
      loading: this.loading,
    };
  }

  async _runFetch(query, page) {
    this.loading = true;
    this._emit();
    const fetchToken = ++this.activeFetchToken; // Increment fetch token
    let result;
    try {
      result = await this.fetchUsers(query, page, this.pageSize);
      if (fetchToken !== this.activeFetchToken) return; // Discard stale results
    } catch (err) {
      if (fetchToken === this.activeFetchToken) {
        this.loading = false;
        this._emit();
      }
      throw err;
    }
    this.users = result.users;
    this.total = result.total;
    this.loading = false;
    this._emit();
  }
}
