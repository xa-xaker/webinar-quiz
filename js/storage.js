// Шар даних. Зараз — localStorage; пізніше цей файл буде замінено на Supabase
// з тим самим асинхронним API: saveResult, getResults, deleteResult, subscribe.
const DataStore = (() => {
  const KEY = 'quiz-results-v1';
  const listeners = new Set();

  function read() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function write(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
    notify();
  }

  function notify() {
    const list = read();
    listeners.forEach((cb) => cb(list));
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // Зміни з інших вкладок (імітація realtime).
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) notify();
  });

  return {
    async saveResult(result) {
      const record = { ...result, id: uuid(), created_at: new Date().toISOString() };
      write([...read(), record]);
      return record;
    },

    async getResults() {
      return read();
    },

    async deleteResult(id) {
      write(read().filter((r) => r.id !== id));
    },

    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
})();
