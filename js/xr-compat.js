// Workaround: some Android Chrome versions don't composite WebXR projection layers in AR/VR.
// Hiding the layers API makes three.js / A-Frame use the classic XRWebGLLayer path.
// Add ?xrlayers=1 to the URL to keep Chrome's layers path (for A/B testing).
(() => {
  window.__xrLayersDisabled = false;
  const ua = navigator.userAgent;
  const keep = new URLSearchParams(location.search).get('xrlayers') === '1';
  if (keep || !/Android/.test(ua) || /OculusBrowser|Quest/.test(ua)) return;   // phones only, not Quest
  try {
    if (typeof XRWebGLBinding !== 'undefined' && 'createProjectionLayer' in XRWebGLBinding.prototype) {
      delete XRWebGLBinding.prototype.createProjectionLayer;
      window.__xrLayersDisabled = true;
    }
    if (typeof XRRenderState !== 'undefined' && 'layers' in XRRenderState.prototype) {
      delete XRRenderState.prototype.layers;     // needed for older three.js versions
    }
  } catch (e) { console.warn('xr-compat failed', e); }
})();