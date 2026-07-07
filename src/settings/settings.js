'use strict';

// Settings form: loads current values, auto-saves on change (debounced), and
// shows a brief "saved" confirmation. All persistence goes through the main
// process via the preload bridge.

const FIELDS = {
  userName: 'value',
  spriteScale: 'value',
  muteSound: 'checked',
  stretchEnabled: 'checked',
  stretchIntervalMin: 'value',
  pomodoroEnabled: 'checked',
  pomodoroFocusMin: 'value',
  pomodoroBreakMin: 'value',
  reminderEnabled: 'checked',
  reminderTime: 'value',
  reminderText: 'value',
  pinnedEnabled: 'checked',
  pinnedMessage: 'value',
  statusWatchEnabled: 'checked',
  statusFile: 'value',
};

const NUMERIC = new Set([
  'spriteScale',
  'stretchIntervalMin',
  'pomodoroFocusMin',
  'pomodoroBreakMin',
]);

const el = (id) => document.getElementById(id);
let saveTimer = null;

function populate(s) {
  for (const [id, prop] of Object.entries(FIELDS)) {
    const node = el(id);
    if (!node) continue;
    if (prop === 'checked') node.checked = !!s[id];
    else node.value = s[id] != null ? s[id] : '';
  }
  el('spriteScaleOut').textContent = `${s.spriteScale}x`;
}

function collect() {
  const patch = {};
  for (const [id, prop] of Object.entries(FIELDS)) {
    const node = el(id);
    if (!node) continue;
    if (prop === 'checked') patch[id] = node.checked;
    else if (NUMERIC.has(id)) patch[id] = Number(node.value) || 0;
    else patch[id] = node.value;
  }
  return patch;
}

function flashSaved() {
  const s = el('saved');
  s.classList.remove('hidden');
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => s.classList.add('hidden'), 1200);
}

async function save() {
  const patch = collect();
  await window.oyenSettings.save(patch);
  flashSaved();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

async function init() {
  const s = await window.oyenSettings.load();
  populate(s);

  for (const id of Object.keys(FIELDS)) {
    const node = el(id);
    if (!node) continue;
    node.addEventListener('input', () => {
      if (id === 'spriteScale') {
        el('spriteScaleOut').textContent = `${el('spriteScale').value}x`;
      }
      scheduleSave();
    });
    node.addEventListener('change', scheduleSave);
  }

  el('closeBtn').addEventListener('click', async () => {
    await save();
    window.oyenSettings.close();
  });
}

window.addEventListener('DOMContentLoaded', init);
