'use strict';

// Timer/reminder engine: stretch reminder, Pomodoro cycle, one-shot timed
// message, and pinned note. Pure logic driven by settings + wall clock; emits
// via callbacks so the overlay can trigger animations and bubbles.

class Reminders {
  constructor(callbacks = {}) {
    this.cb = callbacks; // { onStretch, onMessage, onPomodoroPhase }
    this.settings = null;

    this._nextStretchAt = 0;
    this._msgFiredKey = ''; // "YYYY-MM-DD HH:MM" that already fired

    // Pomodoro
    this.pomo = { phase: 'idle', endsAt: 0, remaining: 0 };
  }

  name() {
    const n = (this.settings && this.settings.userName || '').trim();
    return n || 'friend';
  }

  interpolate(text) {
    return String(text || '').replace(/\{name\}/gi, this.name());
  }

  setSettings(s) {
    const prev = this.settings;
    this.settings = s;
    const now = Date.now();

    // (Re)schedule stretch reminder if interval changed or first run.
    if (
      !prev ||
      prev.stretchIntervalMin !== s.stretchIntervalMin ||
      prev.stretchEnabled !== s.stretchEnabled
    ) {
      this._nextStretchAt = now + s.stretchIntervalMin * 60000;
    }

    // Start/stop pomodoro.
    if (s.pomodoroEnabled && (!prev || !prev.pomodoroEnabled)) {
      this._startPomodoro('focus', now);
    } else if (!s.pomodoroEnabled && this.pomo.phase !== 'idle') {
      this.pomo = { phase: 'idle', endsAt: 0, remaining: 0 };
      if (this.cb.onPomodoroPhase) this.cb.onPomodoroPhase('idle');
    }
  }

  _startPomodoro(phase, now) {
    const mins =
      phase === 'focus'
        ? this.settings.pomodoroFocusMin
        : this.settings.pomodoroBreakMin;
    this.pomo = { phase, endsAt: now + mins * 60000, remaining: mins * 60 };
    if (this.cb.onPomodoroPhase) this.cb.onPomodoroPhase(phase);
  }

  // Called ~1/sec from the overlay loop.
  tick() {
    if (!this.settings) return;
    const now = Date.now();
    const s = this.settings;

    // Stretch reminder.
    if (s.stretchEnabled && now >= this._nextStretchAt) {
      this._nextStretchAt = now + s.stretchIntervalMin * 60000;
      if (this.cb.onStretch) {
        this.cb.onStretch(
          this.interpolate(`Hey {name}, stretch time! 🐾`)
        );
      }
    }

    // Timed message reminder (fires once when the clock hits HH:MM).
    if (s.reminderEnabled && s.reminderTime) {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const cur = `${hh}:${mm}`;
      if (cur === s.reminderTime) {
        const key = `${d.toDateString()} ${cur}`;
        if (this._msgFiredKey !== key) {
          this._msgFiredKey = key;
          if (this.cb.onMessage) {
            this.cb.onMessage(this.interpolate(s.reminderText || 'Reminder!'));
          }
        }
      }
    }

    // Pomodoro advance.
    if (this.pomo.phase !== 'idle') {
      this.pomo.remaining = Math.max(0, Math.round((this.pomo.endsAt - now) / 1000));
      if (now >= this.pomo.endsAt) {
        const nextPhase = this.pomo.phase === 'focus' ? 'break' : 'focus';
        this._startPomodoro(nextPhase, now);
        if (this.cb.onMessage) {
          const msg =
            nextPhase === 'break'
              ? this.interpolate(`Break time, {name}! Rest those paws 🐾`)
              : this.interpolate(`Back to focus, {name}! 🔥`);
          this.cb.onMessage(msg);
        }
      }
    }
  }

  countdownText() {
    if (this.pomo.phase === 'idle') return null;
    const s = this.pomo.remaining;
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    const label = this.pomo.phase === 'focus' ? 'FOCUS' : 'BREAK';
    return { text: `${label} ${m}:${ss}`, phase: this.pomo.phase };
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { Reminders };
if (typeof window !== 'undefined') window.Reminders = Reminders;
