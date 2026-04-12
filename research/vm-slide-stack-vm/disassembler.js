'use strict';

// Linear disassembler for the stack-based ChaosVM variant. Consumes the JSON
// artifacts produced by decoder.js (dispatch-table.json + bytecode.json) and
// emits a text listing with placeholder opcode names (OP_NN). Semantic naming
// is out of scope for task 39.1 — see task 39.3.

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const outDir = path.resolve(__dirname, '..', '..', 'output', 'vm-slide');
  const args = {
    dispatch: path.join(outDir, 'dispatch-table.json'),
    bytecode: path.join(outDir, 'bytecode.json'),
    listing: path.join(outDir, 'disassembly.txt'),
    outDir
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dispatch' && i + 1 < argv.length) {
      args.dispatch = path.resolve(argv[++i]);
    } else if (argv[i] === '--bytecode' && i + 1 < argv.length) {
      args.bytecode = path.resolve(argv[++i]);
    }
  }
  return args;
}

function pad(value, width) {
  const s = String(value);
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dispatch = JSON.parse(fs.readFileSync(args.dispatch, 'utf8'));
  const bytecode = JSON.parse(fs.readFileSync(args.bytecode, 'utf8'));

  const lines = [];
  let pc = 0;
  let instrCount = 0;
  let halted = false;

  while (pc < bytecode.length) {
    const startPc = pc;
    const op = bytecode[pc++];
    if (typeof op !== 'number' || op < 0 || op >= dispatch.length) {
      lines.push(`${pad(startPc, 5)}  OP_?? ${op}`);
      process.stderr.write(
        `WARN: halt at pc=${startPc}: opcode ${op} out of range [0,${dispatch.length})\n`
      );
      halted = true;
      break;
    }
    const entry = dispatch[op];
    if (entry === null) {
      lines.push(`${pad(startPc, 5)}  OP_?? ${op}`);
      process.stderr.write(
        `WARN: halt at pc=${startPc}: opcode ${op} is a dispatch hole\n`
      );
      halted = true;
      break;
    }
    const operands = [];
    for (let k = 0; k < entry.operandCount; k++) {
      if (pc >= bytecode.length) {
        process.stderr.write(
          `WARN: halt at pc=${startPc}: opcode ${op} needs ${entry.operandCount} operands but bytecode ended\n`
        );
        halted = true;
        break;
      }
      operands.push(bytecode[pc++]);
    }
    if (halted) break;
    const opText = 'OP_' + pad(op, 2);
    const operandText = operands.length ? ' ' + operands.join(' ') : '';
    lines.push(`${pad(startPc, 5)}  ${opText}${operandText}`);
    instrCount++;
  }

  fs.mkdirSync(args.outDir, { recursive: true });
  fs.writeFileSync(args.listing, lines.join('\n') + '\n');

  process.stdout.write(
    `disassembled ${instrCount} instructions, PC range [0, ${pc})\n`
  );
}

main();
