---
trigger: always_on
---

Always prefer Bun-native APIs over Node.js equivalents:
- Use `Bun.file()` and `Bun.write()` for file operations
- Use `Bun.spawn()` for process execution
- Use `Bun.which()` for binary lookup
- Use `fetch()` (globally available) for HTTP requests
- Use `bun:test` for testing