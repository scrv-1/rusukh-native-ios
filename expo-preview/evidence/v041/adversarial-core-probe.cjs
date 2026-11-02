// Independent review probe: run from expo-preview with Node and installed TypeScript.
// Reads source in memory; does not change the application or generated test build.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { performance } = require('node:perf_hooks');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/core.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const target = { exports: {} };
new Function('require', 'module', 'exports', compiled)(require, target, target.exports);
const { wikiLinks, replaceWikiLinks } = target.exports;

function reference(body) {
  const regex = /\[\[([^\]|\n]+)(?:\|[^\]\n]*)?\]\]/g;
  const found = [], seen = new Set();
  let match;
  while ((match = regex.exec(body))) {
    const name = match[1].trim();
    const key = name.replace(/\s+/g, ' ').toLocaleLowerCase();
    if (name && !seen.has(key)) { seen.add(key); found.push(name); }
  }
  return found;
}

let cases = 0;
function compare(input) {
  cases++;
  const expected = reference(input), actual = wikiLinks(input);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(JSON.stringify({ input, expected, actual }));
  }
  for (const selective of [false, true]) {
    const rewrite = (full, name, alias) => selective && name.length % 2 === 0
      ? full : `X${JSON.stringify([name, alias])}Y`;
    const expectedRewrite = input.replace(/\[\[([^\]|\n]+)(\|[^\]\n]*)?\]\]/g, rewrite);
    const actualRewrite = replaceWikiLinks(input, rewrite);
    if (expectedRewrite !== actualRewrite) {
      throw new Error(JSON.stringify({ input, selective, expectedRewrite, actualRewrite }));
    }
  }
}
const alphabet = ['[', ']', '|', '\n', 'a', ' ', 'ع'];
function enumerate(prefix, remaining) {
  compare(prefix);
  if (remaining) for (const char of alphabet) enumerate(prefix + char, remaining - 1);
}
enumerate('', 7);
let state = 0x041a11;
const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
const fuzzAlphabet = [...alphabet, 'A', '\r', '\t'];
for (let i = 0; i < 20000; i++) {
  let text = '';
  const length = 1 + Math.floor(random() * 200);
  for (let j = 0; j < length; j++) text += fuzzAlphabet[Math.floor(random() * fuzzAlphabet.length)];
  compare(text);
}
const timings = [];
for (const [kind, input] of [
  ['unclosed-40k', '['.repeat(40000)],
  ['unclosed-1m', '['.repeat(1000000)],
  ['unclosed-alias-1m', '[[a|'.repeat(250000)],
  ['valid-5000', Array.from({ length: 5000 }, (_, i) => `[[العنوان ${i}|عرض]]`).join(' ')],
]) {
  const started = performance.now();
  const links = wikiLinks(input);
  timings.push({ kind, characters: input.length, links: links.length, ms: +(performance.now() - started).toFixed(3) });
}
console.log(JSON.stringify({ runtime: process.version, platform: process.platform, parityCases: cases, rewriteComparisons: cases * 2, parity: 'pass', timings }, null, 2));
