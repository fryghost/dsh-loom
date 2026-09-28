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

/*
 * ALIGNMENT, checked as arithmetic rather than by eye.
 *
 * The control sat visibly off the tree's axes for several rounds, and the cause
 * was never the metric anyone would check (height, font size) — it was two
 * half-pixel/one-box errors that no screenshot of the control alone can show.
 * So the left edges are computed from the sidebar's own padding and compared.
 */
/**
 * The first declaration block whose selector matches `selector`.
 *
 * Anchored on the selector itself rather than on a preceding `}`, because a rule
 * may be preceded by a COMMENT — which is the case for the very rules this file
 * checks, since each carries a long rationale above it. Requiring a brace first
 * silently matched nothing and made three assertions vacuous.
 */
function ruleFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(styles);
  assert.ok(match !== null, `no rule for ${selector}`);
  return match[1];
}
/** One `property: <n>px` value from a declaration block. */
function px(block, property) {
  const match = new RegExp(`(?:^|;)\\s*${property}:\\s*(-?[\\d.]+)px`).exec(block);
  assert.ok(match !== null, `${property} is not a px value in: ${block.trim()}`);
  return Number(match[1]);
}
/**
 * The four sides of a `padding` shorthand, expanded the way CSS expands it.
 *
 * 1 value  -> all four
 * 2 values -> [vertical, horizontal]
 * 3 values -> [top, horizontal, bottom]
 * 4 values -> [top, right, bottom, left]
 *
 * An earlier version collapsed anything that was not 4 values into four copies
 * of the first, which silently read `0 6px` as `0` and `6px 4px 16px` as `6`.
 * The alignment assertions then compared the wrong edges — they failed, but for
 * a reason in the test rather than in the stylesheet.
 */
function padding(block) {
  const match = /(?:^|;)\s*padding:\s*([^;]+)/.exec(block);
  assert.ok(match !== null, 'no padding declared');
  const v = match[1].trim().split(/\s+/).map(value => Number(value.replace('px', '')));
  if (v.length === 1) return [v[0], v[0], v[0], v[0]];
  if (v.length === 2) return [v[0], v[1], v[0], v[1]];
  if (v.length === 3) return [v[0], v[1], v[2], v[1]];
  return v;
}

test('the search control sits on the tree\'s leading-slot axis', () => {
  const sidebar = padding(ruleFor('.loom-sidebar'));
  const search = ruleFor('.loom-search');
  const searchPadding = padding(search);
  const icon = ruleFor('.loom-search-icon');

  // Left edge of the sidebar's content box.
  const origin = sidebar[3];
  // The icon SLOT must start where a tree row's 16px slot starts: the sidebar's
  // padding plus the row's own horizontal padding.
  const groupHead = ruleFor('.loom-group-head');
  const groupPadding = padding(groupHead);
  const slotStart = origin + groupPadding[3];
  const searchSlotStart = origin + searchPadding[3];

  assert.equal(searchSlotStart, slotStart,
    'the search icon slot must begin on the same axis as every row slot below it');
  assert.equal(px(icon, 'width'), 16,
    'the leading slot is 16px, matching the tree; the shipped control 28px box belongs to its icon-only button');
});

test('the search text sits on the tree\'s text axis', () => {
  const sidebar = padding(ruleFor('.loom-sidebar'));
  const search = ruleFor('.loom-search');
  const searchPadding = padding(search);
  const icon = ruleFor('.loom-search-icon');
  const origin = sidebar[3];

  // Search text = origin + padding-left + icon slot + flex gap.
  const searchGap = px(search, 'gap');
  const searchText = origin + searchPadding[3] + px(icon, 'width') + searchGap;

  // Group name text = origin + group padding + slot + group gap.
  const groupHead = ruleFor('.loom-group-head');
  const groupPadding = padding(groupHead);
  const groupText = origin + groupPadding[3] + 16 + px(groupHead, 'gap');

  assert.equal(searchText, groupText,
    'the search text must begin where group names begin, or the control reads as misaligned');
});

test('the search hairline does not enter the layout', () => {
  // A transparent BORDER keeps layout stable across hover but still offsets the
  // content inside it by half a pixel, which is what put this control on a
  // different axis from the tree. An outline with a negative offset draws the
  // same hairline outside the flow.
  const rule = ruleFor('.loom-search');
  assert.doesNotMatch(rule, /(?:^|;)\s*border:\s*0?\.?5px/,
    'a hairline border shifts every position inside the control');
  assert.match(rule, /outline:\s*0?\.?5px\s*solid\s*transparent/,
    'the resting hairline must be an outline');
  assert.match(rule, /outline-offset:\s*-0?\.?5px/,
    'and drawn inside the box');
});

test('the search hairline still appears on hover and focus', () => {
  assert.match(styles, /\.loom-search:hover,[\s\S]{0,80}\.loom-search:focus-within\s*\{\s*outline-color:/,
    'the affordance must survive the switch from border to outline');
});