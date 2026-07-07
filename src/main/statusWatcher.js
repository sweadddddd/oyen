'use strict';

const fs = require('fs');
const { EventEmitter } = require('events');

// Watches a local JSON file (default ~/.oyen-status.json) for a { status }
// field so any external workflow can drive the cat's mood:
//   { "status": "thinking" | "done" | "idle" }
// See scripts/oyen-status.sh for an example writer.

class StatusWatcher extends EventEmitter {
  constructor(filePath) {
    super();
    this.filePath = filePath;
    this.watcher = null;
    this.pollTimer = null;
    this.lastStatus = 'idle';
    this._lastMtime = 0;
  }

  setFile(filePath) {
    if (filePath === this.filePath) return;
    this.stop();
    this.filePath = filePath;
    this.start();
  }

  _read() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const status = String(parsed.status || 'idle').toLowerCase();
      if (['thinking', 'done', 'idle'].includes(status) && status !== this.lastStatus) {
        this.lastStatus = status;
        this.emit('status', status);
      }
    } catch (err) {
      // File missing or invalid JSON — treat as idle, but don't spam.
    }
  }

  start() {
    // Initial read (file may already exist).
    this._read();

    // fs.watch is efficient but can miss on some editors/FSes; back it with a
    // low-frequency mtime poll for robustness.
    try {
      this.watcher = fs.watch(
        require('path').dirname(this.filePath),
        (evt, name) => {
          if (!name || this.filePath.endsWith(name)) this._read();
        }
      );
    } catch (err) {
      // Directory may not exist yet; polling will cover it.
    }

    this.pollTimer = setInterval(() => {
      try {
        const stat = fs.statSync(this.filePath);
        if (stat.mtimeMs !== this._lastMtime) {
          this._lastMtime = stat.mtimeMs;
          this._read();
        }
      } catch (err) {
        // ignore
      }
    }, 1000);
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

module.exports = { StatusWatcher };
