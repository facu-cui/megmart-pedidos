// Lógica de Megmart Pedidos sin pantalla ni base de datos (se puede probar con node).
// Lectura del mensaje de WhatsApp, etapas de cada producto y machete de logos.

/* ---------- lectura del mensaje ---------- */
const PREF_A = /^\[?\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?\s?m\.?)?\]?\s*(?:[-–]\s*)?[^:\n]{1,40}:\s*/i;
const PREF_B = /^\[\d{1,2}:\d{2}(?::\d{2})?,?\s+\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\]\s*[^:\n]{1,40}:\s*/;
const BUL = /^(?:[-–—•*·▪▫]|\p{Extended_Pictographic}️?|\d{1,3}[.)])\s*/u;
const QTY = /(^|\s)\(?(?:x\s?(\d{1,3})|(\d{1,3})\s?x)\)?(?=\s|$|[.,;])/i;
const HEAD = /^(bandejas?|protectores?|alfombras|combos?)\s*:?$/i;
const HEADK = { b: 'ban', p: 'pro', a: 'alf', c: 'combo' };

function sacarCant(t) {
  let c = 1, m = t.match(QTY);
  if (m) {
    c = parseInt(m[2] || m[3], 10);
    t = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  } else {
    m = t.match(/^(\d{1,2})\s+(?=\p{L})/u);
    if (m) { c = parseInt(m[1], 10); t = t.slice(m[0].length).trim(); }
  }
  if (!c || c < 1) c = 1;
  if (c > 999) c = 999;
  return { t, c };
}

function quitar(t, re) {
  const r = t.replace(re, ' ').replace(/\s+/g, ' ').trim();
  return r || t;
}

function tipo(t, sec) {
  if (sec === 'ban') return { k: 'ban', t: quitar(t, /^bandejas?\b/i) };
  if (sec === 'pro') return { k: 'pro', t: quitar(t, /^protectores?\b/i) };
  if (/\bcombos?\b/i.test(t)) return { k: 'combo', t: quitar(t, /\bcombos?\b/i) };
  if (/^bandejas?\b/i.test(t)) return { k: 'ban', t: quitar(t, /^bandejas?\b/i) };
  if (/^protectores?\b/i.test(t)) return { k: 'pro', t: quitar(t, /^protectores?\b/i) };
  return { k: sec || 'alf', t };
}

export function parseMsg(text, defSec, noTitle) {
  const rows = [];
  String(text || '').split(/\r?\n/).forEach((line) => {
    let s = line.trim();
    if (!s) return;
    let r = s.replace(PREF_A, '');
    if (r === s) r = s.replace(PREF_B, '');
    s = r.trim();
    for (let n = 0; n < 5 && s; n++) {
      const b = s.replace(BUL, '');
      if (b === s) break;
      s = b.trim();
    }
    if (!/[\p{L}\d]/u.test(s)) return;
    rows.push(s);
  });
  const explicit = rows.some((s) => QTY.test(s));
  let title = '', sec = defSec || null;
  const items = [];
  rows.forEach((s, idx) => {
    const h = s.match(HEAD);
    if (h) { sec = HEADK[h[1].charAt(0).toLowerCase()]; return; }
    if (!noTitle && idx === 0 && explicit && !QTY.test(s) && s.length <= 40) { title = s; return; }
    const q = sacarCant(s);
    if (!q.t) return;
    const ty = tipo(q.t, sec);
    items.push({ t: ty.t, c: q.c, k: ty.k });
  });
  return { title, items };
}

/* ---------- etapas ---------- */
export const STAGES = [
  { n: 'Por sacar', pl: 'Por sacar', lg: 'por sacar' },
  { n: 'Sacada', pl: 'Sacadas', lg: 'sacadas' },
  { n: 'Limpia', pl: 'Limpias / logo', lg: 'limpias' },
  { n: 'Embalada', pl: 'Listas', lg: 'listas' }
];
export const KINDS = { combo: 'Combo', alf: 'Alfombras', ban: 'Bandeja', pro: 'Protector' };
export const GROUPS = [
  { n: 'Alfombras', ks: ['alf'] },
  { n: 'Combos', ks: ['combo'] },
  { n: 'Bandejas', ks: ['ban'] },
  { n: 'Protectores', ks: ['pro'] }
];

export function firstStage(it) {
  for (let s = 0; s < 4; s++) if (it.n[s] > 0) return s;
  return 3;
}
export function stName(k, s) { return (k === 'ban' && s === 2) ? 'Con logo' : STAGES[s].n; }
export function lgName(k, s) { return (k === 'ban' && s === 2) ? 'con logo' : STAGES[s].lg; }

function entero(v) { return Math.max(0, parseInt(v, 10) || 0); }

// Deja un producto con números coherentes (nunca negativos, bolsa + caja = listas, etc.)
export function limpiarItem(x) {
  const k = KINDS[x.k] ? x.k : 'alf';
  let c = Math.min(999, Math.max(1, parseInt(x.c, 10) || 1));
  let n = Array.isArray(x.n) && x.n.length === 4 ? x.n.map(entero) : null;
  if (!n || n[0] + n[1] + n[2] + n[3] === 0) n = [c, 0, 0, 0];
  else c = n[0] + n[1] + n[2] + n[3];
  const pa = Math.min(n[0], entero(x.pa));
  const pb = Math.min(n[0], entero(x.pb));
  let bb = 0, bc = 0;
  if (k !== 'pro') {
    bb = entero(x.bb); bc = entero(x.bc);
    while (bb + bc > n[3]) { if (bb > 0) bb--; else bc--; }
    if (bb + bc < n[3]) bc += n[3] - bb - bc;
  }
  return { t: String(x.t || ''), c, k, n, pa, pb, bb, bc };
}

// Productos guardados por la versión anterior (solo en el celular), incluido el formato más viejo con "e".
export function itemViejo(x) {
  x = x || {};
  if (Array.isArray(x.n) && x.n.length === 4 && x.n.some((v) => entero(v) > 0)) return limpiarItem(x);
  const k = KINDS[x.k] ? x.k : 'alf';
  const c = Math.max(1, parseInt(x.c, 10) || 1);
  let e = Math.min(3, entero(x.e));
  if (k === 'pro' && e > 0) e = 3;
  const n = [0, 0, 0, 0]; n[e] = c;
  const r = { t: x.t, c, k, n, pa: 0, pb: 0, bb: 0, bc: 0 };
  if (e === 0) { r.pa = x.pa ? c : 0; r.pb = x.pb ? c : 0; }
  if (e === 3 && k !== 'pro') { if (x.b === 'bolsa') r.bb = c; else r.bc = c; }
  return limpiarItem(r);
}

export function nuevoItem(l) {
  return limpiarItem({ t: l.t, c: l.c, k: l.k, n: [l.c, 0, 0, 0] });
}

// Pasa q unidades de una etapa a la siguiente (dir 'f') o a la anterior (dir 'b').
export function mover(it, s, dir, q, b) {
  const n = it.n.slice();
  let bb = it.bb, bc = it.bc;
  if (dir === 'f') {
    q = Math.min(q, n[s]);
    if (q < 1) return null;
    if (s === 0 && it.k === 'pro') { n[0] -= q; n[3] += q; }
    else if (s === 2) { n[2] -= q; n[3] += q; if (b === 'bolsa') bb += q; else bc += q; }
    else if (s < 3) { n[s] -= q; n[s + 1] += q; }
    else return null;
  } else if (s === 3 && it.k !== 'pro') {
    const have = b === 'bolsa' ? bb : bc;
    q = Math.min(q, have);
    if (q < 1) return null;
    n[3] -= q; n[2] += q;
    if (b === 'bolsa') bb -= q; else bc -= q;
  } else {
    q = Math.min(q, n[s]);
    if (q < 1) return null;
    n[s] -= q;
    n[s === 3 ? 0 : s - 1] += q;
  }
  return { n, pa: Math.min(it.pa, n[0]), pb: Math.min(it.pb, n[0]), bb, bc };
}

// Combos: marca alfombras (pa) o bandeja (pb) sacadas. Cuando están las dos partes, la unidad pasa a "sacada".
export function marcarParte(it, part, q) {
  const rem = it.n[0] - it[part];
  const np = { pa: it.pa, pb: it.pb };
  const n = it.n.slice();
  if (rem > 0) np[part] += Math.min(q, rem);
  else if (it.c === 1) np[part] = 0;
  else return null;
  const mm = Math.min(np.pa, np.pb);
  if (mm > 0) { n[0] -= mm; n[1] += mm; np.pa -= mm; np.pb -= mm; }
  return { n, pa: np.pa, pb: np.pb, bb: it.bb, bc: it.bc };
}
export function deshacerParte(it, part, q) {
  if (!(it[part] > 0)) return null;
  const pu = { pa: it.pa, pb: it.pb };
  pu[part] = Math.max(0, pu[part] - Math.min(q, pu[part]));
  return { n: it.n.slice(), pa: pu.pa, pb: pu.pb, bb: it.bb, bc: it.bc };
}

// Cambia la cantidad total. Si baja, saca primero de lo que falta empezar.
export function ajustarCantidad(it, nc) {
  const n = it.n.slice();
  let bb = it.bb, bc = it.bc;
  if (nc > it.c) {
    n[0] += nc - it.c;
  } else {
    let r = it.c - nc;
    for (let s = 0; s < 4 && r > 0; s++) {
      const take = Math.min(r, n[s]);
      n[s] -= take; r -= take;
      if (s === 3 && it.k !== 'pro') {
        const tb = Math.min(take, bb);
        bb -= tb; bc -= take - tb;
      }
    }
  }
  return { c: nc, n, pa: Math.min(it.pa, n[0]), pb: Math.min(it.pb, n[0]), bb, bc };
}

export function resumen(items) {
  const cnt = [0, 0, 0, 0];
  let total = 0;
  items.forEach((i) => { for (let s = 0; s < 4; s++) cnt[s] += i.n[s]; total += i.c; });
  return { cnt, total, done: total > 0 && cnt[3] === total };
}

export function pillTxt(it) {
  const e = firstStage(it);
  if (e === 0 && it.k === 'combo') {
    if (it.pa && !it.pb) return 'Falta bandeja';
    if (it.pb && !it.pa) return 'Falta alfombras';
  }
  if (e === 3) {
    if (it.k === 'pro') return 'Sacado';
    return 'Embalada' + (it.bb ? ' · bolsa' : it.bc ? ' · caja' : '');
  }
  return stName(it.k, e);
}

export function piezas(it) {
  if (it.k !== 'combo' && it.k !== 'alf') return '';
  const n = it.c;
  let s = (n > 1 ? n + ' juegos · ' : '') + (3 * n) + ' alfombras';
  if (it.k === 'combo') s += ' + ' + n + (n > 1 ? ' bandejas' : ' bandeja');
  return s;
}

// Texto para mandar por WhatsApp con cómo va el pedido.
export function textoResumen(p) {
  const lineas = ['*' + (p.nombre || 'Pedido sin nombre') + '*', p.cnt[3] + ' de ' + p.total + ' listos', ''];
  GROUPS.forEach((g) => {
    const gi = p.items.filter((i) => g.ks.indexOf(i.k) > -1);
    if (!gi.length) return;
    lineas.push('_' + g.n + '_');
    gi.forEach((i) => {
      const listo = i.n[3] === i.c;
      let estado;
      if (i.c > 1) {
        estado = [0, 1, 2, 3].filter((s) => i.n[s]).map((s) => i.n[s] + ' ' + lgName(i.k, s)).join(', ');
      } else estado = pillTxt(i).toLowerCase();
      lineas.push((listo ? '✅ ' : '⏳ ') + i.t + (i.c > 1 ? ' ×' + i.c : '') + ' — ' + estado);
    });
    lineas.push('');
  });
  return lineas.join('\n').trim();
}

/* ---------- machete de logos ---------- */
export const BRANDS = [['megmart', 'Megmart'], ['ford', 'Ford'], ['chevrolet', 'Chevrolet'], ['fiat', 'Fiat'], ['volkswagen', 'VW'], ['toyota', 'Toyota'], ['jeep', 'Jeep'], ['peugeot', 'Peugeot'], ['renault', 'Renault'], ['citroen', 'Citroën'], ['honda', 'Honda'], ['nissan', 'Nissan']];

export const MACHETE_INICIAL = [["BASALT", "Solo conductor, logo Megmart"], ["S10", "Full logo Chevrolet"], ["BOREAL", "Solo conductor, logo Megmart"], ["CAPTIVA", "Solo conductor, logo Chevrolet +"], ["LOGAN SANDERO STEP", "Solo conductor, logo Megmart"], ["SAVEIRO", "Logo Megmart, solo conductor"], ["SPING", "Full logo Chevrolet"], ["STRADA", "Logo Megmart, conductor"], ["CRONOS ARGO", "Solo conductor, logo Megmart"], ["JOLION 2025", "Solo conductor, logo Megmart"], ["TORO DOBLE CAPA", "Logo Megmart, solo conductor (costado a la derecha)"], ["TRACKER", "Full logo Chevrolet"], ["AMAROK DISEÑO NUEVO", "Solo conductor, logo Megmart"], ["FORD TERRITORY", "Solo conductor, logo Ford (fijarse en WhatsApp)"]];

export function sinAcentos(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
export function claveM(x) { return sinAcentos(x).replace(/\s+/g, ' ').trim(); }

export function macheteInfo(txt) {
  const t = sinAcentos(txt);
  let pos = { c: /conductor/.test(t), a: /acompa/.test(t), t: /trasera|atras/.test(t) };
  if (!pos.c && !pos.a && !pos.t && /\btodas?\b|\btodo\b|\bfull\b/.test(t)) pos = { c: true, a: true, t: true };
  const chips = [], nombres = [];
  if (pos.c) nombres.push('Conductor');
  if (pos.a) nombres.push('Acompañante');
  if (pos.t) nombres.push('Trasera');
  if (nombres.length === 3) chips.push({ t: 'Las 3 alfombras', c: 'pos' });
  else if (nombres.length === 1 && /\bsolo\b/.test(t)) chips.push({ t: 'Solo ' + nombres[0].toLowerCase(), c: 'pos' });
  else if (nombres.length) chips.push({ t: nombres.join(' + '), c: 'pos' });
  if (/chapita larga/.test(t)) chips.push({ t: 'Chapita larga', c: 'note' });
  const logo = /\blogos?\b/.test(t);
  const found = BRANDS.filter((b) => t.indexOf(b[0]) > -1).map((b) => ({ n: b[1], mm: b[0] === 'megmart' }));
  if (/\bvw\b/.test(t) && !found.some((f) => f.n === 'VW')) found.push({ n: 'VW', mm: false });
  found.forEach((f) => { chips.push({ t: (logo ? 'Logo ' : '') + f.n, c: f.mm ? 'mm' : 'brand' }); });
  if (/derech/.test(t)) chips.push({ t: 'Costado derecho', c: 'note' });
  if (/izquierd/.test(t)) chips.push({ t: 'Costado izquierdo', c: 'note' });
  if (/whatsapp/.test(t)) chips.push({ t: 'Ver WhatsApp', c: 'note' });
  return { pos, chips };
}

// Palabras que solas no alcanzan para reconocer un modelo (marcas y descripciones).
const NO_CLAVE = new Set(['doble', 'capa', 'diseno', 'nuevo', 'nueva', 'full', 'logo', 'cubre', 'manija', 'vw'].concat(BRANDS.map((b) => b[0])));
function palabras(s) { return claveM(s).split(/[^a-z0-9-]+/).filter(Boolean); }

// Busca en el machete el modelo que corresponde al nombre de un producto (ej. "Combo Cronos" → CRONOS ARGO).
export function machetePara(texto, mach) {
  const ws = new Set(palabras(texto));
  let best = null, bestScore = 0;
  (mach || []).forEach((m) => {
    const pm = palabras(m.modelo).filter((w) => w.length >= 2 && !/^\d+$/.test(w));
    const claves = pm.filter((w) => w.length >= 3 && !NO_CLAVE.has(w));
    if (!claves.some((w) => ws.has(w))) return;
    const score = pm.filter((w) => ws.has(w)).length;
    if (score > bestScore) { best = m; bestScore = score; }
  });
  return best;
}
