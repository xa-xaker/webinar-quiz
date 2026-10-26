// Спільні дрібні помічники для обох сторінок.

// 83000 → "01:23"; понад годину → "1:01:23"
function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const OPTION_LETTERS = ['А', 'Б', 'В', 'Г'];

// Створює елемент: el('div', { className: 'x' }, 'текст', childNode)
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  children.flat().forEach((child) => {
    if (child == null || child === false) return;
    node.append(child instanceof Node ? child : String(child));
  });
  return node;
}
