import { randomUUID } from 'node:crypto';
import manifestCore from '../core/manifest.cjs';

const { normalizeComparablePath } = manifestCore;
const BATCH_SIZE = 16;
const MATCH_LIMIT = 8;
const READ_CONCURRENCY = 4;
const CATALOG_TTL = 120_000;
const TEXT_BUDGET = 12_000_000;
const SCOPES = new Set(['all', 'mine', 'assistant', 'title']);

export function createSessionSearchCache() {
  const catalogs = new Map();
  const transcripts = new Map();
  let characters = 0;
  return {
    getCatalog(id) {
      const entry = catalogs.get(id);
      return entry && entry.expires > Date.now() ? entry.records : undefined;
    },
    saveCatalog(records) {
      if (catalogs.size >= 8) catalogs.delete(catalogs.keys().next().value);
      const id = randomUUID();
      catalogs.set(id, { records, expires: Date.now() + CATALOG_TTL });
      return id;
    },
    getTranscript(id) {
      const entry = transcripts.get(id);
      if (entry) {
        transcripts.delete(id);
        transcripts.set(id, entry);
      }
      return entry;
    },
    saveTranscript(id, identity, revision, transcript) {
      const size = transcript.messages.reduce((sum, message) => sum + message.body.length + 64, transcript.title.length);
      if (size > TEXT_BUDGET) return;
      characters -= transcripts.get(id)?.size ?? 0;
      transcripts.delete(id);
      while (characters + size > TEXT_BUDGET || transcripts.size >= 1000) {
        const oldest = transcripts.keys().next().value;
        characters -= transcripts.get(oldest).size;
        transcripts.delete(oldest);
      }
      transcripts.set(id, { identity, revision, transcript, size });
      characters += size;
    },
  };
}

function excerpt(text, index, length) {
  const before = text.slice(Math.max(0, index - 55), index);
  const after = text.slice(index + length, index + length + 110);
  return {
    before: (index > before.length ? '…' : '') + before,
    match: text.slice(index, index + length),
    after: after + (index + length + after.length < text.length ? '…' : ''),
  };
}

function messageText(event) {
  if (event.surfaceOp !== 'append') return;
  const blocks = event.type === 'user/message' && event.data.source.kind === 'user'
    ? event.data.content
    : event.type === 'assistant/message' ? event.data.message.content : undefined;
  return blocks?.filter(block => block.type === 'text').map(block => block.text).join('\n');
}

function comparePosition(left, right) {
  return right.createdAt - left.createdAt || String(left.id).localeCompare(String(right.id));
}

function extractTranscript(events, includeMessages) {
  const titleEvent = events.findLast(event => event.type === 'session/title');
  const messages = [];
  const transcript = { title: titleEvent?.data.title || '', titleTime: titleEvent?.time, messages };
  if (!includeMessages) return transcript;
  const stepStarts = new Map();
  for (const event of events) {
    if (event.type === 'step/start') stepStarts.set(`${event.data.turn}:${event.data.step}`, event.seq);
    const body = messageText(event);
    if (!body) continue;
    messages.push({
      body,
      seq: event.seq,
      loadFrom: event.type === 'assistant/message'
        ? stepStarts.get(`${event.data.turn}:${event.data.step}`) ?? event.seq : event.seq,
      time: event.time,
      author: event.type === 'user/message' ? 'mine' : 'assistant',
    });
  }
  return transcript;
}

function matchSession({ title, titleTime, messages }, scope, pattern) {
  const titleMatch = scope === 'all' || scope === 'title' ? pattern.exec(title) : null;
  const matches = [];
  let matchCount = 0;
  if (scope !== 'title') {
    for (const { body, ...message } of messages) {
      if (scope !== 'all' && scope !== message.author) continue;
      const found = pattern.exec(body);
      if (!found) continue;
      matchCount++;
      if (matches.length === MATCH_LIMIT) continue;
      matches.push({
        ...message,
        excerpt: excerpt(body, found.index, found[0].length),
      });
    }
  }
  if (!titleMatch && matches.length === 0) return null;
  return {
    title,
    titleExcerpt: titleMatch ? excerpt(title, titleMatch.index, titleMatch[0].length) : undefined,
    time: matches[0]?.time ?? titleTime,
    matches,
    matchCount,
  };
}

async function searchHistory({ queryService, persistence, sessions, cache, signal }, id, scope, pattern) {
  const cached = persistence && sessions && cache?.getTranscript(id);
  if (cached && cached.identity === persistence.identity && !sessions.get(id)) {
    const stored = await persistence.stat(id, { signal });
    if (stored?.revision === cached.revision && !sessions.get(id)) {
      return matchSession(cached.transcript, scope, pattern);
    }
  }
  if (typeof queryService.observeSession !== 'function') {
    const { events } = await queryService.readSession(id);
    return matchSession(extractTranscript(events, scope !== 'title'), scope, pattern);
  }
  const observation = await queryService.observeSession(id, { projectionMode: 'none', signal });
  try {
    const transcript = extractTranscript(observation.events, scope !== 'title');
    if (scope !== 'title' && persistence && observation.source === 'prepared' && observation.revision !== undefined) {
      cache?.saveTranscript(id, persistence.identity, observation.revision, transcript);
    }
    return matchSession(transcript, scope, pattern);
  } finally {
    observation[Symbol.dispose]();
  }
}

export async function searchSessionPage(environment, request) {
  const { queryService, projects, paths, archivedIds, cache, signal } = environment;
  const { text, scope, projectId, after } = request ?? {};
  if (typeof text !== 'string' || !text.trim() || text.length > 256 || !SCOPES.has(scope)
    || (projectId != null && typeof projectId !== 'string')
    || (after != null && !(Number.isSafeInteger(after.createdAt) && typeof after.id === 'string'
      && (after.catalogId === undefined || typeof after.catalogId === 'string')))) {
    throw new Error('Invalid session search request');
  }
  if (queryService === undefined) throw new Error('DSH session history service is unavailable');

  const archived = new Set(archivedIds);
  const projectFolders = projects.map(project => ({
    id: project.id,
    title: project.title,
    paths: new Set(project.members.map(member => normalizeComparablePath(paths[member.workspaceId])).filter(Boolean)),
  }));
  const selected = projectFolders.find(project => project.id === projectId);
  if (projectId != null && selected === undefined) throw new Error('Search project no longer exists');

  let catalogId = after?.catalogId;
  let catalog = cache?.getCatalog(catalogId);
  if (!catalog) {
    catalog = await queryService.listSessions(signal);
    catalogId = cache?.saveCatalog(catalog);
  }
  const records = catalog
    .filter(({ header }) => header.cwd !== undefined && header.origin !== 'subagent'
      && !archived.has(header.id)
      && (selected === undefined || selected.paths.has(normalizeComparablePath(header.cwd)))
      && (after == null || comparePosition(header, after) > 0))
    .sort((left, right) => comparePosition(left.header, right.header));
  const needle = text.trim();
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu');
  const items = [];
  let skipped = 0;
  const batch = records.slice(0, BATCH_SIZE);
  for (let offset = 0; offset < batch.length; offset += READ_CONCURRENCY) {
    const group = batch.slice(offset, offset + READ_CONCURRENCY);
    const matches = await Promise.allSettled(group.map(({ header }) =>
      searchHistory(environment, header.id, scope, pattern)));
    for (const [index, result] of matches.entries()) {
      signal?.throwIfAborted();
      if (result.status === 'rejected') {
        skipped++;
        continue;
      }
      const match = result.value;
      if (!match) continue;
      const { header } = group[index];
      const cwd = normalizeComparablePath(header.cwd);
      items.push({
        ...match,
        id: header.id,
        projects: projectFolders.filter(project => project.paths.has(cwd)).map(project => project.title),
        time: match.time ?? header.createdAt,
      });
    }
  }
  signal?.throwIfAborted();
  const last = batch.at(-1)?.header;
  const next = records.length > batch.length
    ? { id: last.id, createdAt: last.createdAt, ...(catalogId && { catalogId }) } : null;
  return { items, skipped, next };
}
