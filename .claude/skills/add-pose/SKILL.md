---
name: add-pose
description: Workflow for adding a new pose/animation or a new reactive behavior to the Oyen desktop pet. Use when asked to add a new cat animation, pose, trick, or reaction to input/timers.
---

# Adding a pose or reactive behavior to Oyen

Oyen has no sprite frames or image assets — every pose is a parameter set consumed by one draw routine. Follow this order; skipping steps produces a pose that never renders or never triggers.

1. **Parameters** (`src/renderer/sprite.js`): check `OYEN.defaults()` first. Only add a new field if the pose needs a visual knob that doesn't exist yet (e.g. a new limb position). Wire it into `draw(ctx, p)` where the relevant body part is drawn.
2. **Pose case** (`src/renderer/stateMachine.js`): add a `case 'your-pose':` in `OyenState.params()`. Build the frame's params from `t` (seconds elapsed in this pose) and `this.mods` (cross-pose modifiers set by the behavior layer: pupil position, facing, tint, blush, offsets, stretch/squash). Looping poses just compute continuously; one-shot poses are declared at the *trigger* site via `{ duration, next }`, not here.
3. **Trigger it** from one of two places, matching how the pose should activate:
   - **Input-reactive** → `src/renderer/behaviors.js`. New reactions go into the fixed priority chain inside `update(dt)` (currently: overheat > busy one-shot > petting/purr > kneading > hunt > eye-follow). Decide where the new behavior sits in that precedence — appending it at the end means every higher-priority state can silently suppress it.
   - **Timer/reminder-driven** → `src/renderer/reminders.js`. `Reminders` is pure logic (settings + wall clock in, callbacks out: `onStretch`, `onMessage`, `onPomodoroPhase`); it never touches the cat directly. Wire a new callback there, then handle it in `src/renderer/overlay.js` where those callbacks call `cat.state.set(...)`.
   - Either way, transition with `cat.state.set('your-pose', { duration: <seconds>, next: 'idle' })` for a one-shot, or just `cat.state.set('your-pose')` for a loop the behavior layer will exit explicitly.
4. **Script tag**: only needed if you added a whole new renderer *file* — append its `<script>` tag to `src/renderer/index.html` in dependency order (it must come after anything it destructures off `window` at module-load time, before `overlay.js`). Adding a pose/behavior to an existing file needs no HTML change.
5. **Verify**: `npm start`, trigger the behavior for real (move the mouse fast nearby, type quickly, wait out a timer, etc.) and confirm the pose renders and returns to idle correctly. There's no automated test suite for animation — visual verification in the running overlay is the check.
