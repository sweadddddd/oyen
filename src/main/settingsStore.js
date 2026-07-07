'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Persists user settings as JSON in the OS user-data dir. Kept tiny and
// dependency-free (no electron-store) so the portable build stays self-contained.

const DEFAULTS = Object.freeze({
  userName: '',
  muteSound: false,

  // Stretch reminder (minutes). Spec default 45-60 -> 50.
  stretchIntervalMin: 50,
  stretchEnabled: true,

  // Pomodoro (minutes).
  pomodoroEnabled: false,
  pomodoroFocusMin: 25,
  pomodoroBreakMin: 5,

  // One-shot message reminder. time is "HH:MM" 24h, empty = disabled.
  reminderTime: '',
  reminderText: 'Time for a little break!',
  reminderEnabled: false,

  // Persistent pinned bubble above the cat's head.
  pinnedMessage: '',
  pinnedEnabled: false,

  // Agent-status file to watch (stretch feature).
  statusFile: path.join(os.homedir(), '.oyen-status.json'),
  statusWatchEnabled: true,

  // Overall scale multiplier for the sprite (4-6x pixel scaling).
  spriteScale: 5,
});

class SettingsStore {
  constructor(userDataDir) {
    this.file = path.join(userDataDir, 'oyen-settings.json');
    this.data = { ...DEFAULTS };
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      // Merge over defaults so new keys in updated versions are filled in.
      this.data = { ...DEFAULTS, ...parsed };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('[settings] failed to read, using defaults:', err.message);
      }
      this.data = { ...DEFAULTS };
    }
    return this.data;
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('[settings] failed to write:', err.message);
    }
  }

  get() {
    return this.data;
  }

  update(patch) {
    this.data = { ...this.data, ...patch };
    this.save();
    return this.data;
  }
}

module.exports = { SettingsStore, DEFAULTS };
