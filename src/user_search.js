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
    this.fetchGeneration = 0; // Added to track the generation of fetch requests
  }

  setQuery(q) {
    this.query = q;
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      // Use the latest page and query for the fetch
      this._runFetch(this.query, this.page); 
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
      totalPages: Math.ceil(this.total / this.pageSize), // Use Math.ceil
      loading: this.loading,
    };
  }

  async _runFetch(query, page) {
    this.loading = true;
    this._emit();
    
    this.fetchGeneration++; // Increment the generation for this fetch
    const currentGeneration = this.fetchGeneration;
    let result;
    try {
      result = await this.fetchUsers(query, page, this.pageSize);
    } catch (err) {
      this.loading = false;
      this._emit();
      throw err;
    }
    
    // Only apply the result if the generation matches the latest fetch request
    if (currentGeneration === this.fetchGeneration) {
      this.users = result.users;
      this.total = result.total;
    }

    this.loading = false;
    this._emit();
  }

  // Other methods remain unchanged
}
