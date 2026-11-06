// App-wide constants and URL flags. Browser-only (reads location).
export const FLAGS = Object.freeze({
  // ?debug=1 starts with the debug HUD and debug layers on (the Debug button toggles them at runtime)
  debug: new URLSearchParams(location.search).get('debug') === '1'
});

export const SCALE = Object.freeze({ MIN: 0.4, MAX: 3, STEP: 1.15 });

// XR "select" and the DOM tap can both fire for one touch: accept only one within this window
export const TAP_DEDUPE_MS = 350;
