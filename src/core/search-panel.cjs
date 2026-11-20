const React = require('react');
const h = React.createElement;

const PANEL_ID = 'loom-session-search';
const SCOPES = ['all', 'mine', 'assistant', 'title'];

function marked(excerpt) {
  return [excerpt.before, h('mark', { key: 'match' }, excerpt.match), excerpt.after];
}

function createSearchPanel({ bridge, ctx, translate }) {
  const emptyResults = { results: [], next: null, skipped: 0, searched: false, scrollTop: 0, expanded: [] };
  let page = {
    text: '', scope: 'all', projectId: '', projects: [], currentProjects: [],
    ...emptyResults,
  };
  let landing = null;
  let entry = 0;
  const listeners = new Set();
  const subscribe = listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const select = () => ctx.get('layout').selectPanel(PANEL_ID);

  function open(text, projects, currentProjects) {
    const keyword = text.trim() || page.text;
    const projectId = projects.some(project => project.id === page.projectId) ? page.projectId : '';
    const changed = projectId !== page.projectId || keyword !== page.text;
    landing = null;
    page = { ...page, ...(changed ? emptyResults : {}), text: keyword, projectId, projects, currentProjects };
    entry++;
    for (const listener of listeners) listener();
    select();
  }

  function SearchPanel(props) {
    const key = React.useSyncExternalStore(subscribe, () => entry);
    return h(SearchPage, { ...props, key });
  }

  function SearchPage({ t = translate } = {}) {
    const [text, setText] = React.useState(page.text);
    const [scope, setScope] = React.useState(page.scope);
    const [projectId, setProjectId] = React.useState(page.projectId);
    const [view, setView] = React.useState(page);
    const [pending, setPending] = React.useState(false);
    const [error, setError] = React.useState('');
    const [expanded, setExpanded] = React.useState(() => new Set(page.expanded));
    const scroll = React.useRef(null);
    const inFlight = React.useRef(null);
    const query = text.trim();

    async function run(filters, append = false) {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setPending(true);
      setError('');
      try {
        let items = append ? page.results : [];
        let next = append ? page.next : null;
        let skipped = append ? page.skipped : 0;
        const startingCount = items.length;
        do {
          const batch = await bridge.searchSessions({ ...filters, projectId: filters.projectId || null, after: next }, controller.signal);
          if (controller.signal.aborted) return;
          items = [...items, ...batch.items];
          next = batch.next;
          skipped += batch.skipped;
          page = { ...page, ...filters, results: items, next, skipped, searched: true };
          setView(page);
        } while (next && items.length - startingCount < 12);
      } catch (reason) {
        if (!controller.signal.aborted) setError(String(reason.message ?? reason));
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }

    React.useLayoutEffect(() => {
      if (scroll.current) scroll.current.scrollTop = page.scrollTop;
    }, []);

    React.useEffect(() => {
      if (query && !page.searched) void run({ text: query, scope, projectId });
      return () => inFlight.current?.abort();
    }, []);

    function changeFilters(filters) {
      page = { ...page, ...filters, ...emptyResults };
      setView(page);
      setExpanded(new Set());
      setError('');
      inFlight.current?.abort();
      setPending(false);
      if (scroll.current) scroll.current.scrollTop = 0;
    }

    function updateScope(value) {
      setScope(value);
      const filters = { text: query, scope: value, projectId };
      changeFilters(filters);
      if (query) void run(filters);
    }

    function updateProject(value) {
      setProjectId(value);
      const filters = { text: query, scope, projectId: value };
      changeFilters(filters);
      if (query) void run(filters);
    }

    function openHit(item, hit) {
      page = { ...page, scrollTop: scroll.current?.scrollTop ?? 0, expanded: [...expanded] };
      landing = { id: item.id, hit };
      ctx.get('uiWorkspace').openSession(item.id);
    }

    return h('section', { className: 'loom-advanced', ref: scroll, 'aria-label': t('advancedSearch') },
      h('div', { className: 'loom-advanced-inner' },
        h('header', { className: 'loom-advanced-header' },
          h('h1', null, t('advancedSearch')),
          h('button', { type: 'button', className: 'loom-advanced-button',
            onClick: () => ctx.get('layout').selectPanel(null) }, t('close')),
        ),
        h('form', { role: 'search', onSubmit: event => {
          event.preventDefault();
          if (!query) return;
          const filters = { text: query, scope, projectId };
          changeFilters(filters);
          void run(filters);
        } },
        h('div', { className: 'loom-advanced-query' },
          h('input', { type: 'search', autoFocus: !view.searched, maxLength: 256, value: text,
            'aria-label': t('searchKeyword'), placeholder: t('searchKeyword'),
            onChange: event => { setText(event.target.value); changeFilters({ text: event.target.value }); } }),
          h('button', { type: 'submit', className: 'loom-advanced-button loom-advanced-submit',
            disabled: !query || pending }, t('searchSubmit')),
        ),
        h('div', { className: 'loom-advanced-filters' },
          h('div', { className: 'loom-advanced-scopes', role: 'group', 'aria-label': t('searchScope') },
            SCOPES.map(value => h('button', { type: 'button', key: value, 'aria-pressed': scope === value,
              onClick: () => { if (scope !== value) updateScope(value); } }, t(`searchScope_${value}`)))),
          h('select', { value: projectId, 'aria-label': t('searchProjects'),
            onChange: event => updateProject(event.target.value) },
          h('option', { value: '' }, t('searchAllProjects')),
          view.projects.map(project => h('option', { key: project.id, value: project.id },
            view.currentProjects.includes(project.id)
              ? `${project.title} · ${t('searchCurrentProject')}` : project.title))),
        )),
        h('div', { className: 'loom-advanced-results', 'aria-busy': pending },
          view.results.map(item => h('article', { key: item.id },
            h('button', { type: 'button', className: 'loom-advanced-title', onClick: () => openHit(item) },
              item.titleExcerpt ? marked(item.titleExcerpt) : item.title || t('searchUntitled')),
            h('div', { className: 'loom-advanced-meta' },
              [...item.projects, new Date(item.time).toLocaleString()].join(' · ')),
            item.matches.slice(0, expanded.has(item.id) ? undefined : 1).map(hit =>
              h('button', { key: hit.seq, type: 'button', className: 'loom-advanced-hit', onClick: () => openHit(item, hit) },
                h('span', null, t(`searchAuthor_${hit.author}`)), h('span', null, marked(hit.excerpt)))),
            item.matches.length > 1 && h('button', { type: 'button', className: 'loom-advanced-more',
              'aria-expanded': expanded.has(item.id),
              onClick: () => setExpanded(current => {
                const next = new Set(current);
                if (!next.delete(item.id)) next.add(item.id);
                return next;
              }) }, t(expanded.has(item.id) ? 'searchCollapse' : 'searchExpand', { count: item.matchCount })),
            expanded.has(item.id) && item.matchCount > item.matches.length
              && h('small', { className: 'loom-advanced-meta' }, t('searchPreviewLimit', { count: item.matches.length })),
          )),
          pending && h('p', { role: 'status' }, t('searchLoading')),
          error && h('p', { role: 'alert' }, `${t('searchFailed')} ${error}`),
          !pending && !error && view.searched && view.results.length === 0 && h('p', { role: 'status' }, t('noMatches')),
          view.skipped > 0 && h('p', { role: 'status' }, t('searchSkipped', { count: view.skipped })),
          !pending && view.next && h('button', { type: 'button', className: 'loom-advanced-button',
            onClick: () => void run({ text: query, scope, projectId }, true) }, t('searchMore')),
        ),
      ),
    );
  }

  function SearchLanding({ sessionId, useConversation, t = translate }) {
    const target = landing?.id === sessionId ? landing : null;
    const hit = target?.hit;
    const [failed, setFailed] = React.useState(false);
    const key = useConversation?.(snapshot => {
      if (!hit) return undefined;
      const nodes = snapshot.views.get('chat')?.nodes.values() ?? [];
      return nodes.find(node => hit.author === 'assistant'
        ? node.kind === 'assistant-step' && node.data.finalNode?.seq === hit.seq
        : (node.kind === 'user' || node.kind === 'steering') && node.data.seq === hit.seq)?.key;
    });

    React.useEffect(() => {
      if (!hit) return;
      setFailed(false);
      let cancelled = false;
      const controller = new AbortController();
      const sessions = ctx.get('sessions');
      sessions.using(sessionId, { source: 'workspaceOperation', signal: controller.signal }, async reference => {
        const binding = await reference.ready;
        if (!cancelled) await binding.session.loadThrough(hit.loadFrom);
      }).catch(() => { if (!cancelled) setFailed(true); });
      const timeout = setTimeout(() => { if (!cancelled && !target.landed) setFailed(true); }, 12000);
      return () => {
        cancelled = true;
        clearTimeout(timeout);
        controller.abort();
      };
    }, [target, sessionId, hit]);

    React.useEffect(() => {
      if (!key || target.landed) return;
      let frame;
      let positioned = false;
      let visibleFrames = 0;
      function locate(attempt = 0) {
        const rows = document.querySelectorAll(`[data-chat-node-key="${CSS.escape(key)}"]`);
        const row = [...rows].find(element => element.dataset.chatGroupPart !== 'process') ?? rows[0];
        if (row) {
          for (let parent = row; parent; parent = parent.parentElement) {
            if (parent.getAttribute('hidden') === 'until-found') parent.dispatchEvent(new Event('beforematch'));
          }
          if (row.getClientRects().length && !row.closest('[hidden]')) {
            let scroller = row.parentElement;
            while (scroller && (scroller.clientHeight === 0 || scroller.scrollHeight <= scroller.clientHeight
              || !/^(auto|scroll|overlay)$/.test(document.defaultView.getComputedStyle(scroller).overflowY))) {
              scroller = scroller.parentElement;
            }
            const viewport = scroller?.getBoundingClientRect();
            const bounds = row.getBoundingClientRect();
            const visible = viewport === undefined || (bounds.top < viewport.bottom && bounds.bottom > viewport.top);
            if (positioned && visible) {
              if (++visibleFrames >= 3) {
                row.animate?.([{ outline: '2px solid var(--dsw-alias-state-business-primary)' }, { outlineColor: 'transparent' }], 1800);
                target.landed = true;
                setFailed(false);
                return;
              }
            } else {
              visibleFrames = 0;
              // Chat treats beforematch as reader navigation and releases its pending tail-follow animation.
              row.dispatchEvent(new Event('beforematch', { bubbles: true }));
              if (scroller) {
                scroller.scrollTop += bounds.top - viewport.top - (viewport.height - bounds.height) / 2;
                // Let the chat adopt this exact location before the next content layout.
                scroller.dispatchEvent(new Event('scroll'));
              } else {
                row.scrollIntoView({ block: 'center', behavior: 'instant' });
              }
              positioned = true;
            }
          }
        }
        if (attempt < 120) frame = requestAnimationFrame(() => locate(attempt + 1));
      }
      frame = requestAnimationFrame(() => locate());
      return () => cancelAnimationFrame(frame);
    }, [key, target]);

    if (!target) return null;
    return h('button', { type: 'button', className: 'loom-advanced-button',
      title: failed ? t('searchJumpFailed') : undefined,
      onClick: () => { landing = null; select(); } },
    failed ? `${t('searchJumpFailed')} · ${t('searchBack')}` : t('searchBack'));
  }

  return { open, SearchPanel, SearchLanding };
}

module.exports = { createSearchPanel, PANEL_ID };
