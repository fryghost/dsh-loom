/**
 * Spacing and structure rules for the sidebar that are invisible to a
 * source-reading test but visible on screen.
 *
 * Both of these were real defects, and neither could be caught by asserting that
 * a class exists — the class was there and the rule was correct; it simply never
 * applied.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const source = readFileSync(join(__dirname, '..', 'src', 'client.cjs'), 'utf8');
const styles = /const STYLES = `([\s\S]*?)`;/.exec(source)[1];

test('the first section band is selected by class, not by :first-of-type', () => {
  // :first-of-type matched NOTHING here. The search field is a div too, so the
  // first .loom-section-head is not the first div among its siblings — meaning
  // the rule meant to suppress the first band's rule applied to no band at all,
  // and every section drew a hairline directly under the search field.
  assert.doesNotMatch(styles, /\.loom-section-head:first-of-type/,
    ':first-of-type cannot select the first band; the search field is also a div');
  assert.match(styles, /\.loom-section-head-first\s*\{/,
    'the first band needs an explicit class');
  assert.match(source, /loom-section-head loom-section-head-first/,
    'and the first section must actually be given that class');
});

test('a section band puts its space below the rule, not above it', () => {
  // 22px above and 0 below made each band read as a footer of the group above
  // it rather than the heading of the group below.
  const rule = /\.loom-section-head\s*\{([^}]*)\}/.exec(styles)[1];
  const marginTop = Number(/margin-top:\s*(\d+)px/.exec(rule)[1]);
  const padding = /padding:\s*([\d]+)px 0 (\d+)px/.exec(rule);
  assert.ok(padding !== null, 'the band padding must be explicit');
  const paddingBottom = Number(padding[2]);

  assert.ok(marginTop >= 12, 'a band needs real space above it to separate groups');
  assert.ok(paddingBottom >= 2,
    'a band needs space BELOW its rule, or it reads as a footer of the group above');
});

test('the sidebar search matches the shipped control, not the dialog Input atom', () => {
  // The Input atom is a dialog-form control: 32px, filled, 12px radius, 14px
  // text. Dropped into the sidebar it became the only opaque box in a column
  // whose whole language is "transparent at rest, filled on hover".
  const rule = /\.loom-search\s*\{([^}]*)\}/.exec(styles)[1];
  assert.match(rule, /height:\s*28px/, 'the shipped sidebar search is 28px tall');
  assert.match(rule, /background:\s*transparent/, 'it rests transparent, like every row');
  assert.match(rule, /border-radius:\s*var\(--dsw-radius-sm\)/, 'radius-sm (8px), not the atom radius');
  assert.doesNotMatch(rule, /background:\s*var\(--dsw-alias-bg-layer-1\)/,
    'a filled surface is what made it read as a foreign object');
  // And the sidebar must no longer render the atom.
  assert.doesNotMatch(source, /className: 'loom-input',\s*\n\s*value: query/,
    'the sidebar search must not be the Input atom');
});

test('the search field offers a clear control and Escape', () => {
  assert.match(source, /loom-search-clear/, 'a filled field needs a way to empty it');
  assert.match(source, /key === 'Escape'/, 'Escape must clear the query');
});