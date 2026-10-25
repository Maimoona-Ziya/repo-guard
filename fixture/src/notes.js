const notes = [];

export function add(text) {
  notes.push({ text });
  return notes.length;
}

export function list() {
  return [...notes];
}

export function clear() {
  notes.length = 0;
}
