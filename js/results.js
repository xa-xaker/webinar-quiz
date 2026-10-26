(() => {
  const $ = (id) => document.getElementById(id);
  const dateFmt = new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const IDLE_AFTER_MS = 5 * 60 * 1000; // без відповідей стільки часу — «неактивний»

  let rows = [];
  let results = []; // завершені сесії
  let live = []; // сесії в процесі
  let knownFinished = null; // null — перший рендер, без підсвічування
  let knownLive = null;
  let pendingDelete = null;

  $('quiz-title').textContent = QUIZ_TITLE;

  function sortResults(list) {
    return [...list].sort((a, b) => b.score - a.score || a.duration_ms - b.duration_ms);
  }

  // ---------- зведення ----------

  function renderSummary() {
    const n = results.length;
    $('stat-count').textContent = n;
    $('stat-live').textContent = live.length;
    if (!n) {
      $('stat-avg').textContent = '—';
      $('stat-time').textContent = '—';
      return;
    }
    const avgScore = results.reduce((s, r) => s + r.score, 0) / n;
    const avgTime = results.reduce((s, r) => s + r.duration_ms, 0) / n;
    $('stat-avg').textContent = `${avgScore.toFixed(1).replace('.', ',')} / ${QUESTIONS.length}`;
    $('stat-time').textContent = formatDuration(avgTime);
  }

  // ---------- видалення з підтвердженням ----------

  function deleteControl(r) {
    if (pendingDelete !== r.id) {
      const del = el('button', { type: 'button', className: 'link-btn' }, 'Видалити');
      del.setAttribute('aria-label', `Видалити ${r.name}`);
      del.addEventListener('click', () => {
        pendingDelete = r.id;
        rerender();
      });
      return del;
    }
    const yes = el('button', { type: 'button', className: 'btn btn--danger btn--small' }, 'Так');
    const no = el('button', { type: 'button', className: 'btn btn--ghost btn--small' }, 'Ні');
    yes.addEventListener('click', async () => {
      yes.disabled = no.disabled = true;
      try {
        await DataStore.deleteResult(r.id);
      } catch (err) {
        console.error(err);
        yes.disabled = no.disabled = false;
        return;
      }
      pendingDelete = null;
      await refresh();
    });
    no.addEventListener('click', () => {
      pendingDelete = null;
      rerender();
    });
    return el('span', { className: 'confirm' }, yes, no);
  }

  // ---------- хто проходить зараз ----------

  function answeredCount(r) {
    return (r.answers || []).filter((a) => a != null).length;
  }

  function renderLive() {
    $('live-empty').classList.toggle('hidden', live.length > 0);
    $('live-list').replaceChildren(
      ...live.map((r) => {
        const done = answeredCount(r);
        const bar = el('div', { className: 'progress__bar' });
        bar.style.width = `${(done / r.total) * 100}%`;

        const item = el('li', { className: 'session' },
          el('div', { className: 'session__head' },
            el('span', { className: 'session__name' }, r.name),
            el('span', { className: 'session__count' }, `${done} з ${r.total}`),
          ),
          el('div', { className: 'progress session__progress' }, bar),
          el('div', { className: 'session__foot' },
            el('span', { className: 'session__meta' },
              el('span', { className: 'session__time' }),
              el('span', { className: 'session__state' }),
            ),
            deleteControl(r),
          ),
        );
        item.dataset.started = r.created_at;
        item.dataset.updated = r.updated_at;
        if (knownLive && !knownLive.has(r.id)) item.classList.add('row--new');
        return item;
      }),
    );
    tickLive();
  }

  // Щосекунди оновлюємо лише таймери, без повного перерендеру.
  function tickLive() {
    const now = Date.now();
    $('live-list').querySelectorAll('.session').forEach((item) => {
      const idle = now - new Date(item.dataset.updated).getTime() > IDLE_AFTER_MS;
      item.classList.toggle('session--idle', idle);
      item.querySelector('.session__time').textContent = `⏱ ${formatDuration(now - new Date(item.dataset.started).getTime())}`;
      item.querySelector('.session__state').textContent = idle ? ' · неактивний' : '';
    });
  }

  setInterval(tickLive, 1000);

  // ---------- таблиця лідерів ----------

  function renderBoard() {
    const sorted = sortResults(results);
    $('board-empty').classList.toggle('hidden', sorted.length > 0);

    $('board-body').replaceChildren(
      ...sorted.map((r, i) => {
        const rank = i + 1;
        const time = formatDuration(r.duration_ms);
        const date = dateFmt.format(new Date(r.created_at));
        const tr = el('tr', {},
          el('td', { className: 'c-rank' }, el('span', { className: `rank${rank <= 3 ? ` rank--${rank}` : ''}` }, rank)),
          el('td', { className: 'c-name' }, r.name),
          el('td', { className: 'c-score' }, `${r.score} / ${r.total}`),
          el('td', { className: 'c-time' }, time),
          el('td', { className: 'c-date' }, date),
          el('td', { className: 'c-meta' }, `⏱ ${time} · ${date}`),
          el('td', { className: 'c-action' }, deleteControl(r)),
        );
        if (knownFinished && !knownFinished.has(r.id)) tr.classList.add('row--new');
        return tr;
      }),
    );
  }

  // ---------- статистика по питаннях (лише завершені сесії) ----------

  function renderQuestionStats() {
    $('qstats').replaceChildren(
      ...QUESTIONS.map((q, qi) => {
        const counts = Array(q.options.length).fill(0);
        let answered = 0;
        results.forEach((r) => {
          const a = r.answers?.[qi];
          if (a == null || !(a in counts)) return;
          counts[a] += 1;
          answered += 1;
        });

        const pct = answered ? Math.round((counts[q.correct] / answered) * 100) : null;
        const level = pct == null ? '' : pct >= 75 ? 'good' : pct >= 50 ? 'mid' : 'bad';

        let wrongIdx = -1;
        counts.forEach((c, i) => {
          if (i !== q.correct && c > 0 && (wrongIdx < 0 || c > counts[wrongIdx])) wrongIdx = i;
        });

        const wrongLine = wrongIdx < 0
          ? el('div', { className: 'qstat__wrong' }, 'Найчастіша помилка: —')
          : el('div', { className: 'qstat__wrong' },
              'Найчастіша помилка: ',
              el('strong', {}, `${OPTION_LETTERS[wrongIdx]}) ${q.options[wrongIdx]}`),
              ` — ${counts[wrongIdx]} з ${answered}`,
            );

        const bar = el('div', { className: `meter__bar${level ? ` meter__bar--${level}` : ''}` });
        bar.style.width = `${pct ?? 0}%`;

        return el('article', { className: 'qstat' },
          el('div', { className: 'qstat__head' },
            el('span', { className: 'qstat__text' }, `${qi + 1}. ${q.text}`),
            el('span', { className: 'qstat__pct' }, pct == null ? '—' : `${pct}%`),
          ),
          el('div', { className: 'meter' }, bar),
          wrongLine,
        );
      }),
    );
  }

  // ---------- оновлення ----------

  function rerender() {
    renderLive();
    renderBoard();
  }

  function render(list) {
    rows = list;
    // Рядки без статусу — записи, збережені до появи сесій.
    results = rows.filter((r) => r.status !== 'in_progress');
    live = rows
      .filter((r) => r.status === 'in_progress')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (pendingDelete && !rows.some((r) => r.id === pendingDelete)) pendingDelete = null;

    renderSummary();
    rerender();
    renderQuestionStats();
    knownFinished = new Set(results.map((r) => r.id));
    knownLive = new Set(live.map((r) => r.id));
  }

  async function refresh() {
    render(await DataStore.getResults());
  }

  DataStore.subscribe(render);
  refresh().catch((err) => {
    console.error(err);
    $('board-empty').textContent = 'Не вдалося завантажити результати. Перевірте з’єднання й оновіть сторінку.';
  });
})();
