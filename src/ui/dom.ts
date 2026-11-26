// Tiny DOM helpers: h('div.class', {attrs}, ...children)
type Child = Node | string | number | null | undefined | false | Child[];
export function h<K extends keyof HTMLElementTagNameMap>(sel: string, attrs: Record<string, any> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const [tag, ...cls] = sel.split('.');
  const el = document.createElement(tag || 'div') as HTMLElementTagNameMap[K];
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(3) as Child[]) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
export const btn = (label: string, onClick: () => void, cls = '', attrs: Record<string, any> = {}) =>
  h('button.btn' + (cls ? '.' + cls.split(' ').join('.') : ''), { onclick: (e: Event) => { e.stopPropagation(); onClick(); }, ...attrs }, label);
export const money = (n: number) => '$' + Math.floor(n).toLocaleString('en-US');

export function modal(root: HTMLElement, title: string, body: Node[], onClose?: () => void, testid?: string) {
  const close = () => { bg.remove(); onClose?.(); };
  const box = h('div.modal', { 'data-testid': testid }, h('h2', {}, title), btn('✕', close, 'red small close', { 'aria-label': 'Close' }), ...body);
  const bg = h('div.modal-bg', { onpointerdown: (e: Event) => { if (e.target === bg) close(); } }, box);
  root.append(bg);
  return { close, box, bg };
}

export function download(name: string, text: string) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove();
}
export function pickFile(): Promise<string | null> {
  return new Promise((res) => {
    const i = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' }) as HTMLInputElement;
    document.body.append(i); // keep it attached so the change event always fires
    i.onchange = async () => { res(i.files?.[0] ? await i.files[0].text() : null); i.remove(); };
    i.click();
  });
}
