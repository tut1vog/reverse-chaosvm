# key-mod

## Open question

The XTEA key-modification constants (not the STATE_A key, the constants applied during the modified round function) are extracted but never diffed across templates. Are they the same across A, B, C? If not, is there a pattern?

## Status

open

## Inputs

- `output/tdc*/pipeline-config.json` — existing extracted constants
- `output/tdc*/xtea-params.json` — existing extracted XTEA parameters

## How to reproduce

No runnable artifacts yet — see `project-brief.md` §Stream B for the definition of done.

## Notes
