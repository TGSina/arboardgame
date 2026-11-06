// DOM overlay controller: status line, debug text panel, log lines, debug-button state.
export function createHud({ statusEl, hudEl, btnDebug, btnAnchor }) {
  const logLines = [];
  const t0 = performance.now();
  let baseStatus = '';
  let statusTimer = null;

  function setStatus(text) {
    baseStatus = text;
    statusEl.textContent = text;
  }

  /** Shows text briefly, then restores the base status. */
  function flashStatus(text) {
    statusEl.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { statusEl.textContent = baseStatus; }, 1400);
  }

  function log(msg) {
    logLines.push(`${((performance.now() - t0) / 1000).toFixed(1)}s ${msg}`);
    if (logLines.length > 6) logLines.shift();
  }

  function setDebugUi(on) {
    btnDebug.textContent = 'Debug: ' + (on ? 'ON' : 'OFF');
    hudEl.hidden = !on;
    btnAnchor.hidden = !on;
  }

  function setAnchorButton(on) {
    btnAnchor.textContent = 'Anchor: ' + (on ? 'ON' : 'OFF');
  }

  function render(text) {
    hudEl.textContent = text;
  }

  return { setStatus, flashStatus, log, setDebugUi, setAnchorButton, render, getLog: () => logLines };
}
