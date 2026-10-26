(() => {
  const $ = (id) => document.getElementById(id);
  const dateFmt = new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  let results = [];
  let knownIds = null; // null — перший рендер, без підсвічування
  let pendingDelete = null;

  $('quiz-title').textContent = QUIZ_TITLE;

  function sortResults(list) {
    return [...list].sort((a, b) => b.score - a.score || a.duration_ms - b.duration_ms);
  }

  // ---------- зведення ----------

  function renderSummary() {
    const n = results.length;
    $('stat-count').textContent = n;
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

  // ---------- таблиця лідерів ----------

  function actionCell(r) {
    const td = el('td', { className: 'c-action' });
    if (pendingDelete === r.id) {
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
        renderBoard();
      });
      td.append(el('span', { className: 'confirm' }, yes, no));
    } else {
      const del = el('button', { type: 'button', className: 'link-btn' }, 'Видалити');
      del.setAttribute('aria-label', `Видалити результат ${r.name}`);
      del.addEventListener('click', () => {
        pendingDelete = r.id;
        renderBoard();
      });
      td.append(del);
    }
    return td;
  }

  function renderBoard() {
    const sorted = sortResults(results);
    const body = $('board-body');
    $('board-empty').classList.toggle('hidden', sorted.length > 0);

    body.replaceChildren(
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
          actionCell(r),
        );
        if (knownIds && !knownIds.has(r.id)) tr.classList.add('row--new');
        return tr;
      }),
    );
  }

  // ---------- статистика по питаннях ----------

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

  function render(list) {
    results = list;
    if (pendingDelete && !results.some((r) => r.id === pendingDelete)) pendingDelete = null;
    renderSummary();
    renderBoard();
    renderQuestionStats();
    knownIds = new Set(results.map((r) => r.id));
  }

  async function refresh() {
    render(await DataStore.getResults());
  }

  DataStore.subscribe(render);
  refresh();
})();
