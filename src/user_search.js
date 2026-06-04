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
    this.activeFetchToken = 0;
  }

  setQuery(q) {
    this.query = q;
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);

    // Reads `this.page` at fire time — fixes stale closure bug
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
      // Math.ceil fixes trailing partial page bug: ceil(11/5)=3, floor(11/5)=2
      totalPages: Math.ceil(this.total / this.pageSize),
      loading: this.loading,
    };
  }

  // Was missing — caused "s.subscribe is not a function" errors in tests
  subscribe(cb) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // Was missing — caused "s.dispose is not a function" errors in tests
  dispose() {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.listeners.clear();
  }

  async _runFetch(query, page) {
    this.loading = true;
    this._emit();

    // Captures token at launch time — fixes out-of-order fetch bug
    const myToken = ++this.activeFetchToken;

    let result;
    try {
      result = await this.fetchUsers(query, page, this.pageSize);
    } catch (err) {
      if (myToken === this.activeFetchToken) {
        this.loading = false;
        this._emit();
      }
      throw err;
    }

    // If a newer fetch has started since, discard this stale result
    if (myToken !== this.activeFetchToken) return;

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
