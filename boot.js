// Apply the motion preference before first paint (kept external so the CSP can forbid inline scripts).
try {
  var lib = JSON.parse(localStorage.getItem('ms.library.guest.v1') || 'null');
  var pref = lib && lib.prefs && lib.prefs.motion;
  var reduce = pref === 'reduce' || ((!pref || pref === 'system') && matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.documentElement.dataset.motion = reduce ? 'reduce' : 'full';
} catch (e) {}
