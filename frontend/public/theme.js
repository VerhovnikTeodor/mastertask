// Tema se nastavi pred izrisom, da ni utripanja svetle teme.
try {
  var t = localStorage.getItem('mt-theme') || 'system';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
} catch (e) {}
