All JavaScript in this project follows these conventions:

- **Module system**: CommonJS (`'use strict';`, `require()`, `module.exports`)
- **Indentation**: 2 spaces (no tabs)
- **Quotes**: Single quotes for strings
- **Semicolons**: Required
- **Variables**: `const` and `let` only — never `var`
- **Dependencies**: Minimize external packages — prefer Node.js built-ins. New npm packages require user confirmation.
- **Language**: Node.js for all JS. Python is only used for `puppeteer/slide-solver.py`.
- **Naming**: camelCase for variables/functions, PascalCase for classes
