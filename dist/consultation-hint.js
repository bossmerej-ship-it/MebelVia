export function initConsultationHint() {
  const hint = document.querySelector('#whatsapp-hint');
  const launcher = document.querySelector('.floating-whatsapp');
  const key = 'mebelvia:whatsapp-hint-dismissed';
  const desktop = matchMedia('(min-width:761px)');
  let dismissed = false;
  try { dismissed = localStorage.getItem(key) === '1'; } catch { /* Storage may be unavailable. */ }
  let ready = false;
  const sync = () => { hint.hidden = dismissed || !ready || !desktop.matches; };
  const dismiss = () => {
    dismissed = true;
    hint.hidden = true;
    try { localStorage.setItem(key, '1'); } catch { /* Dismissal still applies to this visit. */ }
  };
  hint.querySelector('button').addEventListener('click', () => {
    dismiss();
    launcher.focus({preventScroll:true});
  });
  document.querySelectorAll('[data-whatsapp]').forEach(link => link.addEventListener('click', dismiss));
  desktop.addEventListener('change', sync);
  if (!dismissed) setTimeout(() => { ready = true; sync(); }, 8000);
}
