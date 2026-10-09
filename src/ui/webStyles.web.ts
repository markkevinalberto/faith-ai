/**
 * Global browser styles React Native can't express: a clearly visible keyboard-focus ring (3 px, in
 * the brand colour for each theme) and no double-tap zoom delay on buttons.
 */
const STYLE_ID = 'faith-web-styles';

const CSS = `
:focus-visible { outline: 3px solid #5B4FE0 !important; outline-offset: 2px; }
@media (prefers-color-scheme: dark) { :focus-visible { outline-color: #A39BFF !important; } }
button, [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"], a { touch-action: manipulation; }
`;

export function installWebStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}
