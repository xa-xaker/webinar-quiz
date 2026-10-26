// Шар даних на Supabase. API: createSession, updateSession, finishSession,
// saveResult, getResults, deleteResult, subscribe.
const DataStore = (() => {
  const TABLE = 'results';
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });
  const listeners = new Set();
  let channel = null;
  let refetchTimer = null;

  function unwrap({ data, error }) {
    if (error) throw error;
    return data;
  }

  async function getResults() {
    return unwrap(await db.from(TABLE).select('*').order('created_at', { ascending: true }));
  }

  // Будь-яка зміна в таблиці → перечитуємо список (з невеликою паузою,
  // щоб серія вставок під час вебінару дала один запит, а не десятки).
  function scheduleRefetch() {
    clearTimeout(refetchTimer);
    refetchTimer = setTimeout(async () => {
      try {
        const list = await getResults();
        listeners.forEach((cb) => cb(list));
      } catch (err) {
        console.error('Не вдалося оновити результати', err);
      }
    }, 300);
  }

  function ensureChannel() {
    if (channel) return;
    channel = db
      .channel('results-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, scheduleRefetch)
      .subscribe((status) => {
        // Після перепідключення могли пропустити події — перечитуємо.
        if (status === 'SUBSCRIBED') scheduleRefetch();
      });
  }

  return {
    // Сесія створюється одразу після введення імені.
    async createSession({ name, total, answers }) {
      return unwrap(
        await db.from(TABLE).insert({ name, total, answers, status: 'in_progress' }).select('id').single(),
      );
    },

    async updateSession(id, { answers }) {
      unwrap(await db.from(TABLE).update({ answers }).eq('id', id));
    },

    // Якщо сесію вже завершено (повторна спроба після обриву зв'язку),
    // RLS просто не знайде рядок для оновлення — це не помилка.
    async finishSession(id, { score, duration_ms, answers }) {
      unwrap(await db.from(TABLE).update({ score, duration_ms, answers, status: 'finished' }).eq('id', id));
    },

    // Запасний шлях, якщо сесію на старті створити не вдалося.
    async saveResult(result) {
      const { name, score, total, duration_ms, answers } = result;
      return unwrap(
        await db.from(TABLE).insert({ name, score, total, duration_ms, answers }).select().single(),
      );
    },

    getResults,

    async deleteResult(id) {
      unwrap(await db.from(TABLE).delete().eq('id', id));
    },

    subscribe(callback) {
      listeners.add(callback);
      ensureChannel();
      return () => listeners.delete(callback);
    },
  };
})();
