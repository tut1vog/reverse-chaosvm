When working with crypto parameters (XTEA keys, deltas, round counts), token structure (segment layout, field counts, assembly order), opcode semantics, or any behavior documented in `docs/`:

1. **Verify against live behavior** via dynamic tracing or testing — do not assume documentation is correct.
2. Existing documentation has known inaccuracies (e.g., `docs/VERSION_DIFFERENCES.md` stated the XTEA key was "LIKELY IDENTICAL" across templates, but dynamic tracing proved it differs).
3. When you find a discrepancy between documentation and live behavior, update the documentation and note the correction.
4. The token generator produces byte-identical output for tdc.js (Template A), but parameters for other templates are unverified until dynamically confirmed.
