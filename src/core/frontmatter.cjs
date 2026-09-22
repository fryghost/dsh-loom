/**
 * Minimal frontmatter reader for skill files.
 *
 * DSH's own parser (packages/skill/skill-filesystem/src/index.ts) requires a
 * full YAML library and validates invocation policy. Loom only needs enough to
 * build a *preflight inventory* — name, description, whenToUse — and must
 * never disagree with DSH about whether a skill is loadable. So this parser is
 * deliberately conservative: anything it cannot parse confidently returns
 * `undefined`, and the preflight reports the file as unreadable rather than
 * claiming a skill exists that DSH would reject.
 */

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Split a `---` delimited frontmatter block from a body.
 * @returns `{ yaml, body }`, or `undefined` when the file has no frontmatter.
 */
function splitFrontmatter(raw) {
  if (typeof raw !== 'string') return undefined;
  const firstLineEnd = raw.indexOf('\n');
  if (firstLineEnd < 0) return undefined;
  if (raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') return undefined;

  let lineStart = firstLineEnd + 1;
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart);
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline;
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
      return {
        yaml: raw.slice(firstLineEnd + 1, lineStart),
        body: raw.slice(nextNewline < 0 ? raw.length : nextNewline + 1),
      };
    }
    if (nextNewline < 0) return undefined;
    lineStart = nextNewline + 1;
  }
  return undefined;
}

/**
 * Parse the flat `key: value` subset of YAML that skill frontmatter uses.
 *
 * Handles quoted strings, plain scalars, and block scalars (`|` / `>`), which
 * covers real skill files. Nested maps and lists are ignored — Loom never
 * needs them, and guessing at them would risk disagreeing with DSH.
 */
function parseFlatYaml(yaml) {
  const data = {};
  // Strip CR so CRLF files parse identically to LF ones: `.` does not match
  // `\r` in JavaScript, so a trailing CR would otherwise defeat the
  // `key: value` match entirely.
  const lines = String(yaml ?? '').split('\n').map(line => line.replace(/\r$/, ''));
  let blockKey;
  let blockLines = [];

  const flushBlock = () => {
    if (blockKey !== undefined) {
      data[blockKey] = blockLines.join('\n').trim();
      blockKey = undefined;
      blockLines = [];
    }
  };

  for (const line of lines) {
    if (blockKey !== undefined) {
      if (/^\s+\S/.test(line) || line.trim().length === 0) {
        blockLines.push(line.replace(/^\s{1,4}/, ''));
        continue;
      }
      flushBlock();
    }

    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (match === null) continue;
    const key = match[1];
    const rest = match[2].trim();

    if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
      blockKey = key;
      blockLines = [];
      continue;
    }
    data[key] = unquote(rest);
  }
  flushBlock();
  return data;
}

function unquote(value) {
  if (typeof value !== 'string') return value;
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Parse one skill markdown file into the metadata Loom reports.
 *
 * @returns `{ name, description, whenToUse }`, or `undefined` when the file
 *   lacks usable frontmatter — matching DSH's own refusal conditions for
 *   name/description so the preflight cannot over-report.
 */
function parseSkillMetadata(raw) {
  const split = splitFrontmatter(raw);
  if (split === undefined) return undefined;
  const data = parseFlatYaml(split.yaml);
  if (!isPlainObject(data)) return undefined;

  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (name.length === 0 || description.length === 0) return undefined;
  if (!SKILL_NAME.test(name)) return undefined;

  const whenToUse = typeof data.whenToUse === 'string' && data.whenToUse.trim().length > 0
    ? data.whenToUse.trim()
    : undefined;

  return { name, description, ...whenToUse === undefined ? {} : { whenToUse } };
}

module.exports = {
  SKILL_NAME,
  parseFlatYaml,
  parseSkillMetadata,
  splitFrontmatter,
  unquote,
};
