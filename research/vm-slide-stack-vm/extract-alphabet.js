'use strict';

// Phase 43 task 43.2 — alphabet extraction from vm-slide bytecode.
//
// Reads output/vm-slide/bytecode.json (24,273-element decoded bytecode array
// from the Phase 40 walker) and walks the OP_04 + OP_10 sequence starting at
// pc 16932 to recover the custom base64 alphabet character-for-character.
//
// Background. Task 43.1 hardcoded the alphabet as a 65-char string in
// research/vm-slide-stack-vm/vdata-dynamic-trace.js. This script is the
// authoritative ground truth: it reads the bytes vm-slide actually pushes
// onto its stack, in order, with no human transcription.
//
// Encoding model:
//   pc 16932  OP_04        ; push empty string ""
//   pc 16933  OP_10 71     ; append char(71)='G'
//   pc 16935  OP_10 86     ; append char(86)='V'
//   ...
//   pc 17061  OP_10 89     ; append char(89)='Y'  (last)
//   pc 17063  OP_24        ; (not OP_10) — sequence terminator
//
// Each OP_10 takes two slots in the bytecode array: opcode (10) + char code.
// Output: prints the count, the character sequence, and a comparison against
// the hardcoded string in vdata-dynamic-trace.js. Exits non-zero if the two
// disagree.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BYTECODE_PATH = path.join(ROOT, 'output', 'vm-slide', 'bytecode.json');

const HARDCODED_ALPHABET =
  'GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY';

function main() {
  const bc = JSON.parse(fs.readFileSync(BYTECODE_PATH, 'utf8'));
  if (!Array.isArray(bc)) {
    throw new Error('bytecode.json is not an array');
  }

  const ALPHABET_PC = 16932;
  if (bc[ALPHABET_PC] !== 4) {
    throw new Error(
      'expected OP_04 (=4) at pc ' + ALPHABET_PC + ', got ' + bc[ALPHABET_PC]
    );
  }

  const chars = [];
  const charCodes = [];
  let pc = ALPHABET_PC + 1;
  while (bc[pc] === 10) {
    const code = bc[pc + 1];
    if (typeof code !== 'number') {
      throw new Error('OP_10 at pc ' + pc + ' has non-numeric arg');
    }
    charCodes.push(code);
    chars.push(String.fromCharCode(code));
    pc += 2;
  }

  const terminator = bc[pc];
  const alphabet = chars.join('');

  console.log('=== alphabet extraction from bytecode ===');
  console.log('start pc:', ALPHABET_PC, '(OP_04)');
  console.log('terminator pc:', pc, '(opcode =', terminator + ')');
  console.log('OP_10 count:', chars.length);
  console.log('alphabet:', JSON.stringify(alphabet));
  console.log('alphabet length:', alphabet.length);
  console.log('char codes:', charCodes.join(','));

  console.log('');
  console.log('=== comparison with hardcoded string in vdata-dynamic-trace.js ===');
  console.log('hardcoded:', JSON.stringify(HARDCODED_ALPHABET));
  console.log('hardcoded length:', HARDCODED_ALPHABET.length);
  const equal = alphabet === HARDCODED_ALPHABET;
  console.log('byte-for-byte equal:', equal);
  if (!equal) {
    console.error('MISMATCH between bytecode and hardcoded alphabet!');
    process.exit(1);
  }

  return alphabet;
}

if (require.main === module) {
  main();
}

module.exports = { main };
