import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionSearchCache, searchSessionPage } from '../src/host/session-search.js';

const keyword = '配置[11128]';
const user = (seq, text, source = 'user', surfaceOp = 'append') => ({
  type: 'user/message', seq, surfaceOp, time: seq + 100,
  data: { source: { kind: source }, content: [{ type: 'text', text }] },
});
const assistant = (seq, text, type = 'text') => ({
  type: 'assistant/message', seq, surfaceOp: 'append', time: seq + 100,
  data: { turn: 1, step: 2, message: { content: [{ type, text }] } },
});
const record = (id, createdAt, cwd = 'D:/main', extra) => ({
  header: { id, createdAt, cwd, ...extra },
});

function context(records, histories) {
  return {
    queryService: {
      listSessions: async () => records,
      readSession: async id => {
        if (!histories.has(id)) throw new Error('Failed read');
        return { events: histories.get(id) };
      },
    },
    projects: [{ id: 'main', title: 'Main project', members: [{ workspaceId: 'folder' }] }],
    paths: { folder: 'D:/main' },
    archivedIds: ['archived'],
  };
}

test('matches Chinese and symbol-bearing keywords on the selected transcript scope', async () => {
  const events = [
    { type: 'session/title', data: { title: `标题 ${keyword}` } },
    user(1, `请检查${keyword}是否正确`),
    user(2, keyword, 'system'),
    user(3, keyword, 'user', { op: 'replace' }),
    { type: 'step/start', seq: 4, data: { turn: 1, step: 2 } },
    assistant(5, `这里是${keyword}的结果`),
    assistant(6, keyword, 'reasoning'),
  ];
  const ctx = context(
    [record('old', 1), record('archived', 2), record('delegate', 3, 'D:/main', { origin: 'subagent' }),
      record('other', 4, 'D:/other'), record('missing', 5)],
    new Map([['old', events], ['archived', events], ['delegate', events], ['other', events]]),
  );
  const search = scope => searchSessionPage(ctx, { text: keyword, scope, projectId: 'main' });
  const mine = await search('mine');
  assert.equal(mine.skipped, 1);
  assert.deepEqual(mine.items.map(item => item.id), ['old']);
  assert.deepEqual(mine.items[0].projects, ['Main project']);
  assert.deepEqual(mine.items[0].matches, [{
    seq: 1, loadFrom: 1, time: 101, author: 'mine',
    excerpt: { before: '请检查', match: keyword, after: '是否正确' },
  }]);
  assert.equal(mine.items[0].titleExcerpt, undefined);

  const replies = await search('assistant');
  assert.deepEqual(replies.items[0].matches.map(hit => [hit.seq, hit.loadFrom]), [[5, 4]]);
  assert.equal((await search('title')).items[0].matches.length, 0);
  const all = await search('all');
  assert.equal(all.items[0].titleExcerpt.match, keyword);
  assert.equal(all.items[0].matchCount, 2);
});

test('continues past a batch of nonmatches to find an older session', async () => {
  const records = Array.from({ length: 18 }, (_, id) => record(String(id), id));
  const histories = new Map(records.map(({ header }) => [header.id, header.id === '0' ? [user(1, keyword)] : []]));
  const ctx = context(records, histories);
  ctx.cache = createSessionSearchCache();
  let lists = 0;
  ctx.queryService.listSessions = async () => { lists++; return records; };
  const request = { text: keyword, scope: 'mine' };
  const first = await searchSessionPage(ctx, request);
  assert.deepEqual(first.items, []);
  assert.equal(first.next.createdAt, 2);
  assert.equal(first.next.id, '2');
  const second = await searchSessionPage(ctx, { ...request, after: first.next });
  assert.deepEqual(second.items.map(item => item.id), ['0']);
  assert.equal(second.next, null);
  assert.equal(lists, 1);
});

test('reuses a cold transcript until storage revision or live state changes', async () => {
  const ctx = context([record('old', 1)], new Map());
  ctx.cache = createSessionSearchCache();
  let revision = 'r1';
  let live = false;
  let reads = 0;
  ctx.sessions = { get: () => live ? {} : undefined };
  ctx.persistence = { identity: Symbol(), stat: async () => ({ revision }) };
  ctx.queryService.observeSession = async () => {
    reads++;
    return {
      source: live ? 'live' : 'prepared', revision,
      events: [user(1, live ? 'live input' : `cold ${revision}`)],
      [Symbol.dispose]() {},
    };
  };
  const find = text => searchSessionPage(ctx, { text, scope: 'mine' });
  assert.equal((await find('cold')).items.length, 1);
  assert.equal((await find('r1')).items.length, 1);
  assert.equal(reads, 1);
  revision = 'r2';
  assert.equal((await find('r1')).items.length, 0);
  assert.equal(reads, 2);
  live = true;
  assert.equal((await find('live input')).items.length, 1);
  assert.equal(reads, 3);
});
