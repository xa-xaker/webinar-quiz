(() => {
  const STATE_KEY = 'quiz-session-v1';
  const total = QUESTIONS.length;

  const $ = (id) => document.getElementById(id);
  const screens = {
    start: $('screen-start'),
    quiz: $('screen-quiz'),
    result: $('screen-result'),
  };

  let state = loadState();
  let timerId = null;
  let syncChain = Promise.resolve();

  // ---------- стан у sessionStorage ----------

  function freshState() {
    return { name: '', sessionId: null, answers: Array(total).fill(null), current: 0, startedAt: null, finishedAt: null, saved: false };
  }

  function loadState() {
    try {
      const s = JSON.parse(sessionStorage.getItem(STATE_KEY));
      if (s && Array.isArray(s.answers) && s.answers.length === total) return s;
    } catch {}
    return freshState();
  }

  function saveState() {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {}
  }

  // ---------- синхронізація прогресу з сервером ----------

  // Запити йдуть строго по черзі, щоб старіший стан не перезаписав новіший.
  // Помилки не блокують тест: наступна синхронізація повторить спробу.
  function syncProgress() {
    syncChain = syncChain
      .then(async () => {
        if (state.finishedAt) return;
        if (!state.sessionId) {
          const { id } = await DataStore.createSession({ name: state.name, total, answers: state.answers });
          state.sessionId = id;
          saveState();
        } else {
          await DataStore.updateSession(state.sessionId, { answers: state.answers });
        }
      })
      .catch((err) => console.error('Не вдалося синхронізувати прогрес', err));
    return syncChain;
  }

  // ---------- екрани ----------

  function show(name) {
    Object.entries(screens).forEach(([key, node]) => node.classList.toggle('hidden', key !== name));
    window.scrollTo({ top: 0 });
  }

  function renderStart() {
    $('quiz-title').textContent = QUIZ_TITLE;
    $('intro-count').textContent = `${total} питань`;
    $('name-input').value = state.name;
    show('start');
  }

  function renderQuestion() {
    const q = QUESTIONS[state.current];
    const selected = state.answers[state.current];

    $('q-counter').textContent = `Питання ${state.current + 1} з ${total}`;
    $('progress-bar').style.width = `${(state.current / total) * 100}%`;
    $('q-text').textContent = q.text;

    const options = $('options');
    options.replaceChildren(
      ...q.options.map((text, i) => {
        const btn = el('button', { type: 'button', className: 'option' },
          el('span', { className: 'option__letter' }, OPTION_LETTERS[i]),
          el('span', {}, text),
        );
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', String(selected === i));
        btn.addEventListener('click', () => selectOption(i));
        return btn;
      }),
    );

    $('btn-prev').classList.toggle('hidden', state.current === 0);
    $('btn-next').disabled = selected == null;
    $('btn-next').textContent = state.current === total - 1 ? 'Завершити' : 'Далі';

    const box = $('question-box');
    box.classList.remove('fade-in');
    void box.offsetWidth; // перезапуск анімації
    box.classList.add('fade-in');

    show('quiz');
    startTimer();
  }

  function selectOption(i) {
    state.answers[state.current] = i;
    saveState();
    syncProgress();
    $('options').querySelectorAll('.option').forEach((btn, idx) => btn.setAttribute('aria-checked', String(idx === i)));
    $('btn-next').disabled = false;
  }

  // ---------- таймер ----------

  function tick() {
    $('timer').textContent = formatDuration(Date.now() - state.startedAt);
  }

  function startTimer() {
    if (timerId) return;
    tick();
    timerId = setInterval(tick, 1000);
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
  }

  // ---------- завершення ----------

  function computeScore() {
    return state.answers.reduce((sum, a, i) => sum + (a === QUESTIONS[i].correct ? 1 : 0), 0);
  }

  async function finish() {
    stopTimer();
    if (!state.finishedAt) state.finishedAt = Date.now();
    saveState();

    if (!state.saved) {
      const btn = $('btn-next');
      btn.disabled = true;
      const result = {
        score: computeScore(),
        duration_ms: state.finishedAt - state.startedAt,
        answers: state.answers,
      };
      try {
        await syncChain;
        if (state.sessionId) {
          await DataStore.finishSession(state.sessionId, result);
        } else {
          await DataStore.saveResult({ name: state.name, total, ...result });
        }
        state.saved = true;
        saveState();
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        alertInline('Не вдалося зберегти результат. Перевірте з’єднання й спробуйте ще раз.');
        return;
      }
    }
    renderResult();
  }

  function alertInline(message) {
    let box = $('save-error');
    if (!box) {
      box = el('p', { id: 'save-error', className: 'field__error' });
      box.setAttribute('role', 'alert');
      screens.quiz.append(box);
    }
    box.textContent = message;
  }

  function verdict(pct) {
    if (pct === 100) return 'Бездоганно! Ви чудово орієнтуєтесь у темі.';
    if (pct >= 75) return 'Відмінний результат!';
    if (pct >= 50) return 'Непогано, але є що підтягнути.';
    return 'Варто ще раз переглянути матеріал.';
  }

  function renderResult() {
    const score = computeScore();
    const pct = Math.round((score / total) * 100);

    $('score-ring').style.setProperty('--pct', pct);
    $('score-value').textContent = `${score} / ${total}`;
    $('score-pct').textContent = `${pct}%`;
    $('result-name').textContent = state.name;
    $('result-time').textContent = `⏱ ${formatDuration(state.finishedAt - state.startedAt)}`;
    $('score-verdict').textContent = verdict(pct);

    const mistakes = QUESTIONS
      .map((q, i) => ({ q, i, answer: state.answers[i] }))
      .filter(({ q, answer }) => answer !== q.correct);

    const review = $('review');
    if (mistakes.length === 0) {
      $('review-title').textContent = 'Помилок немає';
      review.replaceChildren(
        el('div', { className: 'perfect' },
          el('div', { className: 'perfect__emoji' }, '🎉'),
          el('p', { className: 'muted' }, 'Усі відповіді правильні. Так тримати!'),
        ),
      );
    } else {
      $('review-title').textContent = `Розбір помилок (${mistakes.length})`;
      review.replaceChildren(
        ...mistakes.map(({ q, i, answer }) =>
          el('article', { className: 'review__item' },
            el('div', { className: 'review__q' }, `${i + 1}. ${q.text}`),
            el('div', { className: 'answer answer--wrong' },
              el('span', { className: 'answer__tag' }, '✗'),
              el('span', {}, `Ваша відповідь: ${q.options[answer] ?? '—'}`),
            ),
            el('div', { className: 'answer answer--right' },
              el('span', { className: 'answer__tag' }, '✓'),
              el('span', {}, `Правильно: ${q.options[q.correct]}`),
            ),
            el('p', { className: 'review__explain' }, q.explanation),
          ),
        ),
      );
    }
    show('result');
  }

  // ---------- події ----------

  $('start-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('name-input').value.trim().replace(/\s+/g, ' ');
    if (name.length < 2) {
      $('name-error').textContent = 'Введіть ім’я (щонайменше 2 символи).';
      $('name-input').focus();
      return;
    }
    $('name-error').textContent = '';
    state = freshState();
    state.name = name;
    state.startedAt = Date.now();
    saveState();
    renderQuestion();
    syncProgress();
  });

  $('btn-next').addEventListener('click', () => {
    if (state.answers[state.current] == null) return;
    if (state.current < total - 1) {
      state.current += 1;
      saveState();
      renderQuestion();
    } else {
      finish();
    }
  });

  $('btn-prev').addEventListener('click', () => {
    if (state.current === 0) return;
    state.current -= 1;
    saveState();
    renderQuestion();
  });

  $('btn-restart').addEventListener('click', () => {
    const name = state.name;
    state = freshState();
    state.name = name;
    saveState();
    renderStart();
  });

  // ---------- старт ----------

  if (state.finishedAt && state.saved) {
    renderResult();
  } else if (state.finishedAt) {
    // Тест завершено, але збереження не вдалося — пробуємо ще раз.
    renderQuestion();
    finish();
  } else if (state.startedAt) {
    renderQuestion();
    if (!state.sessionId) syncProgress();
  } else {
    renderStart();
  }
})();
