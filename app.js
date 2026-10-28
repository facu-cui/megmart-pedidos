// Megmart Pedidos · versión con base de datos compartida (Supabase).
// Todos los celulares ven los mismos pedidos y se actualizan solos.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import {
  parseMsg, STAGES, KINDS, GROUPS, firstStage, stName, lgName, limpiarItem, itemViejo, nuevoItem,
  mover, marcarParte, deshacerParte, ajustarCantidad, resumen, pillTxt, piezas, textoResumen,
  sinAcentos, claveM, macheteInfo, machetePara
} from './logica.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const STAGE_IC = ['i-espera', 'i-sacar', 'i-limpiar', 'i-check'];
const EJEMPLO = 'CA\n\nX2 Combo Cronos cubre manija Megmart\nX1 Toro doble capa\nX1 Combo Logan\nX1 Taos\n\nBandejas\n\nX1 Taos\nX2 WR-V\n\nProtectores\n\nX1 Citroen';
const K_NOMBRE = 'megmart-nombre';
const K_CACHE = 'megmart-cache-v3';
const K_VIEJO = 'megmart-pedidos-v1';      // pedidos de la versión anterior (solo en el celular)
const K_VIEJO_M = 'megmart-machete-v1';
const K_MIGRADO = 'megmart-migrado';

/* ---------- almacenamiento del celular (solo comodidad) ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  raw(k) { try { return localStorage.getItem(k); } catch { return null; } }
};

/* ---------- estado ---------- */
const S = {
  fase: 'cargando',          // cargando | nombre | app
  pedidos: new Map(),        // id → { id, nombre, creado, por }
  items: new Map(),          // id → producto
  mach: [],
  listo: false,              // ya llegaron los datos (de la base o de la copia del celular)
  online: navigator.onLine,
  yo: LS.get(K_NOMBRE, ''),
  canal: null,
  idx: null,
  verTerminados: false,
  hq: '',
  migrando: false,
  oculto: 0
};
let view = { n: 'home' };
let filtro = -1, confirmDel = null;
let borrador = { nombre: '', texto: '' };
let addD = { texto: '', sec: null };
let qsel = {}, edit = null;
let lastE = {}, lastDone = {};
let mq = '', confirmM = false;
let mform = { id: null, modelo: '', detalle: '' };
let toastT = null;

/* ---------- utilidades ---------- */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function ic(id, cls) {
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + id + '"/></svg>';
}
function fmtFecha(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\./g, '');
  } catch { return ''; }
}
function hace(ts) {
  if (!ts) return '';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return 'hace ' + min + ' min';
  const d = new Date(ts), hoy = new Date();
  const hm = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === hoy.toDateString()) return 'hoy ' + hm;
  return fmtFecha(ts);
}
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { toastEl.hidden = true; }, 5000);
}
function errMsg(e) {
  const m = String((e && (e.message || e.error_description)) || '');
  if (!navigator.onLine || /fetch|network|Load failed/i.test(m)) return 'Sin internet: el cambio no se guardó. Probá de nuevo cuando vuelva la conexión.';
  if (/row-level security|permission|42501|does not exist|42P01/i.test(m) || (e && (e.code === '42501' || e.code === '42P01'))) return 'La base de datos no deja guardar. Revisá que se haya corrido el archivo SQL en Supabase.';
  return 'No se pudo guardar el cambio. Probá de nuevo.';
}

/* ---------- datos ---------- */
function pedDeFila(r) {
  return { id: r.id, nombre: r.nombre || '', creado: Date.parse(r.creado) || 0, por: r.creado_por || '' };
}
function itemDeFila(r) {
  const x = limpiarItem({ t: r.texto, c: r.cant, k: r.tipo, n: r.n, pa: r.pa, pb: r.pb, bb: r.bb, bc: r.bc });
  return { ...x, id: r.id, pid: r.pedido_id, o: r.orden || 0, ag: !!r.agregado, ver: r.ver || 0, upd: Date.parse(r.actualizado) || 0, por: r.actualizado_por || '' };
}
function filaDeItem(x) {
  return { texto: x.t, cant: x.c, tipo: x.k, n: x.n, pa: x.pa, pb: x.pb, bb: x.bb, bc: x.bc };
}

function indice() {
  if (S.idx) return S.idx;
  const m = new Map();
  for (const i of S.items.values()) {
    if (!m.has(i.pid)) m.set(i.pid, []);
    m.get(i.pid).push(i);
  }
  m.forEach((arr) => arr.sort((a, b) => a.o - b.o));
  S.idx = m;
  return m;
}
function getP(id) {
  const p = S.pedidos.get(id);
  if (!p) return null;
  const items = indice().get(id) || [];
  return { ...p, items, ...resumen(items) };
}
function todos() {
  return [...S.pedidos.values()].sort((a, b) => b.creado - a.creado).map((p) => getP(p.id));
}
function findItem(pid, iid) {
  const it = S.items.get(iid);
  return it && it.pid === pid ? it : null;
}

let cacheT = null;
function guardarCache() {
  clearTimeout(cacheT);
  cacheT = setTimeout(() => {
    LS.set(K_CACHE, { pedidos: [...S.pedidos.values()], items: [...S.items.values()], mach: S.mach });
  }, 400);
}
function leerCache() {
  const c = LS.get(K_CACHE, null);
  if (!c) return false;
  S.pedidos = new Map((c.pedidos || []).map((p) => [p.id, p]));
  S.items = new Map((c.items || []).map((i) => [i.id, i]));
  S.mach = c.mach || [];
  S.idx = null;
  return true;
}

async function cargarTodo() {
  const [p, m] = await Promise.all([
    sb.from('megmart_pedidos').select('id,nombre,creado,creado_por,megmart_items(*)').order('creado', { ascending: false }).limit(300),
    sb.from('megmart_machete').select('id,modelo,detalle').order('modelo')
  ]);
  if (p.error) throw p.error;
  if (m.error) throw m.error;
  const ped = new Map(), its = new Map();
  for (const r of p.data) {
    ped.set(r.id, pedDeFila(r));
    for (const i of r.megmart_items || []) its.set(i.id, itemDeFila(i));
  }
  S.pedidos = ped;
  S.items = its;
  S.mach = m.data.map((x) => ({ id: x.id, modelo: x.modelo || '', detalle: x.detalle || '' }));
  S.listo = true;
  cambio();
}
function recargar() {
  if (S.fase !== 'app') return;
  cargarTodo().catch(() => { if (navigator.onLine) toast('No se pudieron traer los pedidos. Recargá la página.'); });
}

function escuchar() {
  if (S.canal) sb.removeChannel(S.canal);
  let primera = true;
  S.canal = sb.channel('megmart')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'megmart_pedidos' }, (e) => {
      if (e.eventType === 'DELETE') quitarPedidoLocal(e.old.id);
      else S.pedidos.set(e.new.id, pedDeFila(e.new));
      cambio();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'megmart_items' }, (e) => {
      if (e.eventType === 'DELETE') S.items.delete(e.old.id);
      else {
        const loc = S.items.get(e.new.id);
        if (!loc || (e.new.ver || 0) >= (loc.ver || 0)) S.items.set(e.new.id, itemDeFila(e.new));
      }
      cambio();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'megmart_machete' }, (e) => {
      if (e.eventType === 'DELETE') S.mach = S.mach.filter((x) => x.id !== e.old.id);
      else {
        const x = { id: e.new.id, modelo: e.new.modelo || '', detalle: e.new.detalle || '' };
        S.mach = S.mach.filter((y) => y.id !== x.id).concat([x]);
      }
      cambio();
    })
    .subscribe((st) => {
      // Si se cortó y volvió la conexión en vivo, traigo todo de nuevo por si me perdí algo.
      if (st === 'SUBSCRIBED') { if (!primera) recargar(); primera = false; }
    });
}
function quitarPedidoLocal(pid) {
  S.pedidos.delete(pid);
  for (const [id, i] of S.items) if (i.pid === pid) S.items.delete(id);
}

/* ---------- escribir en la base ---------- */
const colas = {};
function enCola(key, fn) {
  const p = (colas[key] || Promise.resolve()).then(fn);
  colas[key] = p.catch(() => {});
  return p;
}

// Cambia un producto. calc recibe el producto como está ahora y devuelve los cambios.
// Si otra persona lo cambió un instante antes, se trae lo último y se vuelve a calcular.
function cambiarItem(id, calc) {
  return enCola(id, async () => {
    for (let intento = 0; intento < 3; intento++) {
      const it = S.items.get(id);
      if (!it) return;
      const patch = calc(it);
      if (!patch) return;
      const lim = limpiarItem({ ...it, ...patch });
      const nuevo = { ...it, ...lim, ver: it.ver + 1, upd: Date.now(), por: S.yo };
      S.items.set(id, nuevo);
      cambio();
      const fila = { ...filaDeItem(lim), ver: it.ver + 1, actualizado: new Date().toISOString(), actualizado_por: S.yo };
      const { data, error } = await sb.from('megmart_items').update(fila).eq('id', id).eq('ver', it.ver).select().maybeSingle();
      if (error) { S.items.set(id, it); cambio(); toast(errMsg(error)); return; }
      if (data) { S.items.set(id, itemDeFila(data)); cambio(); return; }
      const fr = await sb.from('megmart_items').select().eq('id', id).maybeSingle();
      if (fr.error) { S.items.set(id, it); cambio(); toast(errMsg(fr.error)); return; }
      if (!fr.data) { S.items.delete(id); cambio(); toast('Ese producto lo eliminó otra persona.'); return; }
      S.items.set(id, itemDeFila(fr.data));
      cambio();
    }
    toast('Otra persona está cambiando este producto justo ahora. Probá de nuevo.');
  });
}

async function crearPedido(nombre, lines, creado) {
  const items = lines.map((l, i) => ({ ...filaDeItem(l.n ? limpiarItem(l) : nuevoItem(l)), orden: i, agregado: !!l.ag }));
  const { data, error } = await sb.rpc('megmart_crear_pedido', {
    p_nombre: nombre || '', p_por: S.yo, p_items: items, p_creado: new Date(creado || Date.now()).toISOString()
  });
  if (error) throw error;
  const r = await sb.from('megmart_pedidos').select('id,nombre,creado,creado_por,megmart_items(*)').eq('id', data).maybeSingle();
  if (!r.error && r.data) {
    S.pedidos.set(r.data.id, pedDeFila(r.data));
    for (const i of r.data.megmart_items || []) S.items.set(i.id, itemDeFila(i));
    cambio();
  }
  return data;
}

async function agregarItems(pid, lines) {
  const cur = getP(pid);
  let o = 0;
  if (cur) cur.items.forEach((x) => { if (x.o >= o) o = x.o + 1; });
  const filas = lines.map((l, i) => ({
    ...filaDeItem(nuevoItem(l)), pedido_id: pid, orden: o + i, agregado: true, actualizado_por: S.yo
  }));
  const { data, error } = await sb.from('megmart_items').insert(filas).select();
  if (error) throw error;
  data.forEach((r) => S.items.set(r.id, itemDeFila(r)));
  cambio();
}

async function borrarItem(iid) {
  const prev = S.items.get(iid);
  if (!prev) return;
  S.items.delete(iid);
  cambio();
  const { error } = await sb.from('megmart_items').delete().eq('id', iid);
  if (error) { S.items.set(iid, prev); cambio(); toast(errMsg(error)); }
}

async function borrarPedido(pid) {
  const p = S.pedidos.get(pid);
  const its = (indice().get(pid) || []).slice();
  quitarPedidoLocal(pid);
  cambio();
  const { error } = await sb.from('megmart_pedidos').delete().eq('id', pid);
  if (error) {
    if (p) S.pedidos.set(pid, p);
    its.forEach((i) => S.items.set(i.id, i));
    cambio();
    toast(errMsg(error));
  }
}

async function guardarMachete(id, dat) {
  const fila = { modelo: dat.modelo, detalle: dat.detalle, actualizado: new Date().toISOString() };
  const q = id ? sb.from('megmart_machete').update(fila).eq('id', id) : sb.from('megmart_machete').insert(fila);
  const { data, error } = await q.select().maybeSingle();
  if (error) throw error;
  if (data) {
    S.mach = S.mach.filter((m) => m.id !== data.id).concat([{ id: data.id, modelo: data.modelo, detalle: data.detalle }]);
    cambio();
  }
}
async function borrarMachete(id) {
  const { error } = await sb.from('megmart_machete').delete().eq('id', id);
  if (error) throw error;
  S.mach = S.mach.filter((m) => m.id !== id);
  cambio();
}

/* ---------- pasar los pedidos que quedaron guardados solo en este celular ---------- */
function pedidosViejos() {
  if (LS.raw(K_MIGRADO)) return [];
  const r = LS.get(K_VIEJO, []);
  return Array.isArray(r) ? r.filter((p) => p && p.items && Object.keys(p.items).length) : [];
}
async function migrar() {
  const viejos = pedidosViejos();
  S.migrando = true; render();
  let ok = 0;
  try {
    for (const p of viejos) {
      const lines = Object.keys(p.items).map((k) => ({ x: p.items[k] || {}, o: (p.items[k] || {}).o || 0 }))
        .sort((a, b) => a.o - b.o)
        .map(({ x }) => ({ ...itemViejo(x), ag: !!x.ag }));
      await crearPedido(p.nombre || '', lines, p.creado || Date.now());
      ok++;
    }
    // Modelos del machete que se cargaron en este celular y no están en la base
    const mv = LS.get(K_VIEJO_M, []);
    if (Array.isArray(mv)) {
      const hay = new Set(S.mach.map((m) => claveM(m.modelo)));
      const nuevos = mv.filter((m) => m && m.modelo && m.detalle && !hay.has(claveM(m.modelo)))
        .map((m) => ({ modelo: String(m.modelo), detalle: String(m.detalle) }));
      if (nuevos.length) {
        const { error } = await sb.from('megmart_machete').insert(nuevos);
        if (error) throw error;
      }
    }
    LS.set(K_MIGRADO, Date.now());
    toast(ok === 1 ? 'Se subió 1 pedido.' : 'Se subieron ' + ok + ' pedidos.');
    await cargarTodo();
  } catch (e) {
    // Para no duplicar, lo que ya subió se saca de la lista del celular
    if (ok) LS.set(K_VIEJO, LS.get(K_VIEJO, []).filter((p) => !viejos.slice(0, ok).some((v) => v.id === p.id)));
    toast(errMsg(e));
  }
  S.migrando = false;
  render();
}

/* ---------- pantalla ---------- */
let rafPend = false, renderPend = false;
function cambio() {
  S.idx = null;
  if (S.fase === 'app') guardarCache();
  if (rafPend) return;
  rafPend = true;
  setTimeout(() => { rafPend = false; refrescar(); }, 16);
}
// No redibujo mientras alguien está escribiendo, para no sacarle el teclado.
function escribiendo() {
  const a = document.activeElement;
  return a && app.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'button'));
}
function refrescar() {
  if (S.fase !== 'app') return;
  if (escribiendo()) { renderPend = true; return; }
  renderPend = false;
  if (view.n === 'machete') {
    const ml = document.getElementById('mlist');
    if (ml) { ml.innerHTML = macheteListV(); return; }
  }
  if (view.n === 'home' || view.n === 'pedido' || view.n === 'machete') renderKeep();
}
app.addEventListener('focusout', () => { setTimeout(() => { if (renderPend) refrescar(); }, 50); });

function header() {
  return '<header class="top"><svg class="logo" viewBox="0 0 128 20" role="img" aria-label="Megmart"><use href="#logo" width="128" height="20"/></svg><span class="cap">Depósito · Pedidos</span></header>';
}
function bannerV() {
  return S.online ? '' : '<p class="banner">Sin internet. Se ven los últimos datos guardados, pero no se pueden guardar cambios hasta que vuelva la conexión.</p>';
}
function bar(p, big) {
  if (!p.total) return '';
  let h = '<div class="bar' + (big ? ' big' : '') + '" aria-hidden="true">';
  for (let s = 0; s < 4; s++) {
    if (p.cnt[s]) h += '<span class="st' + s + '" style="width:' + (p.cnt[s] * 100 / p.total) + '%"></span>';
  }
  return h + '</div>';
}
function legend(p) {
  let h = '<div class="legend">';
  for (let s = 0; s < 4; s++) h += '<span class="lg st' + s + '"><i class="dot"></i><b>' + p.cnt[s] + '</b> ' + STAGES[s].lg + '</span>';
  return h + '</div>';
}
function card(p) {
  return '<button class="card' + (p.done ? ' fin' : '') + '" data-a="abrir" data-p="' + esc(p.id) + '">' +
    '<span class="card-top"><span class="card-name">' + (p.done ? ic('i-check', 'okic') : '') + esc(p.nombre || 'Pedido sin nombre') + '</span>' +
    '<span class="date">' + esc(fmtFecha(p.creado)) + ' · ' + p.total + (p.total === 1 ? ' producto' : ' productos') + (p.por ? ' · ' + esc(p.por) : '') + '</span></span>' +
    bar(p) + legend(p) + '</button>';
}
function tagsV(k, c, ag) {
  return '<span class="tags"><span class="kind k-' + k + '">' + KINDS[k] + '</span>' +
    (c > 1 ? '<span class="qty">×' + c + '</span>' : '') +
    (ag ? '<span class="kind k-new">Agregado</span>' : '') + '</span>';
}

/* ----- quién usa este celular ----- */
function nombreV() {
  return header() +
    '<form class="login" id="fnombre"><h1>¿Quién sos?</h1>' +
    '<p class="note">Tu nombre queda en cada cosa que marques, así se sabe quién la hizo. Se guarda en este celular.</p>' +
    '<div class="field"><label for="yn">Tu nombre</label><input id="yn" type="text" autocomplete="given-name" maxlength="30" value="' + esc(S.yo) + '"></div>' +
    '<button class="btn btn-primary btn-block" type="submit">Listo</button></form>';
}

/* ----- inicio ----- */
function resumenV(act) {
  const t = [0, 0, 0];
  act.forEach((p) => { t[0] += p.cnt[0]; t[1] += p.cnt[1]; t[2] += p.cnt[2]; });
  const L = [['Por sacar', 'i-sacar'], ['Limpiar / logo', 'i-limpiar'], ['Por embalar', 'i-caja']];
  let h = '<section class="sec"><h2>Falta hacer</h2><div class="tiles">';
  for (let s = 0; s < 3; s++) {
    h += '<div class="tile st' + s + (t[s] ? '' : ' zero') + '">' + ic(L[s][1]) + '<b>' + t[s] + '</b><span>' + L[s][0] + '</span></div>';
  }
  return h + '</div><p class="note">Unidades de todos los pedidos en curso.</p></section>';
}
function listaHomeV(ps) {
  const q = sinAcentos(S.hq).trim();
  if (q) {
    ps = ps.filter((p) => sinAcentos(p.nombre + ' ' + p.items.map((i) => i.t).join(' ')).indexOf(q) > -1);
    if (!ps.length) return '<p class="note">No hay pedidos que coincidan con la búsqueda.</p>';
  }
  const act = ps.filter((p) => !p.done), fin = ps.filter((p) => p.done);
  let h = '';
  if (act.length) h += '<section class="sec"><h2>En curso <span class="gcount">' + act.length + '</span></h2>' + act.map(card).join('') + '</section>';
  if (fin.length) {
    const ver = S.verTerminados || q ? fin : fin.slice(0, 5);
    h += '<section class="sec"><h2>Terminados <span class="gcount">' + fin.length + '</span></h2>' + ver.map(card).join('') +
      (ver.length < fin.length ? '<button class="btn more" data-a="verfin">Ver los ' + fin.length + ' terminados</button>' : '') + '</section>';
  }
  return h;
}
function migrarV() {
  const v = pedidosViejos();
  if (!v.length) return '';
  return '<section class="box"><h2>Pedidos guardados en este celular</h2>' +
    '<p>Hay ' + v.length + (v.length === 1 ? ' pedido' : ' pedidos') + ' de la versión anterior que están solo en este celular. Subilos para que los vea todo el equipo.</p>' +
    '<div class="row2"><button class="btn btn-primary" data-a="migrar"' + (S.migrando ? ' disabled' : '') + '>' + (S.migrando ? 'Subiendo…' : 'Subirlos') + '</button>' +
    '<button class="btn" data-a="nomigrar"' + (S.migrando ? ' disabled' : '') + '>No, descartar aviso</button></div></section>';
}
function homeV() {
  let h = header() + bannerV();
  if (!S.listo) return h + '<p class="note">Cargando pedidos…</p>';
  const ps = todos();
  const act = ps.filter((p) => !p.done);
  h += migrarV();
  h += '<button class="btn btn-primary btn-block" data-a="nuevo">' + ic('i-plus') + 'Nuevo pedido</button>';
  h += '<button class="btn btn-machete" data-a="machete"><span>Machete de logos</span><span class="mc">' +
    (S.mach.length ? S.mach.length + (S.mach.length === 1 ? ' modelo' : ' modelos') : '') + '</span></button>';
  if (!ps.length) {
    h += '<section class="empty"><h2>Todavía no hay pedidos</h2>' +
      '<p>Copiá el mensaje del pedido en WhatsApp y pegalo en Nuevo pedido. La app separa combos, alfombras, bandejas y protectores, y cada producto se marca cuando se saca, se limpia y se embala. Lo ve todo el equipo al instante.</p></section>';
  }
  if (act.length) h += resumenV(act);
  if (ps.length > 4) {
    h += '<div class="field"><label for="hq">Buscar pedido</label><input id="hq" type="search" autocomplete="off" value="' + esc(S.hq) + '" placeholder="Nombre o producto, ej: Cronos"></div>';
  }
  h += '<div id="hlist">' + listaHomeV(ps) + '</div>';
  h += '<p class="user">Usando como <b>' + esc(S.yo) + '</b>' +
    '<button class="btn-text" data-a="nombre">Cambiar nombre</button></p>';
  return h;
}

/* ----- nuevo pedido ----- */
function nuevoV() {
  return header() + bannerV() +
    '<div><button class="btn-text" data-a="home">← Volver</button></div>' +
    '<h1>Nuevo pedido</h1>' +
    '<div class="field"><label for="nm">Nombre del pedido (opcional)</label>' +
    '<input id="nm" type="text" autocomplete="off" value="' + esc(borrador.nombre) + '" placeholder="Si lo dejás vacío se usa la primera línea"></div>' +
    '<div class="field"><label for="ta">Mensaje de WhatsApp</label>' +
    '<textarea id="ta" placeholder="Pegá acá el pedido tal como te llega.">' + esc(borrador.texto) + '</textarea></div>' +
    '<div id="prev">' + previewHtml(parseMsg(borrador.texto)) + '</div>' +
    '<button class="btn btn-primary btn-block" id="crear" data-a="crear"' + (parseMsg(borrador.texto).items.length ? '' : ' disabled') + '>Crear pedido</button>' +
    '<button class="btn-text" data-a="ejemplo">Cargar un pedido de ejemplo</button>';
}
function previewHtml(r) {
  if (!r.items.length) return '<p class="note">Cuando pegues el mensaje, acá vas a ver cómo queda separado.</p>';
  let h = '<p class="count">' + r.items.length + (r.items.length === 1 ? ' línea detectada' : ' líneas detectadas') +
    (r.title ? ' · Referencia: ' + esc(r.title) : '') + '</p>';
  GROUPS.forEach((g) => {
    const gi = r.items.filter((l) => g.ks.indexOf(l.k) > -1);
    if (!gi.length) return;
    h += '<h2 class="ph">' + g.n + ' <span class="gcount">' + gi.length + '</span></h2><ul class="prev">' +
      gi.map((l) => '<li><span>' + esc(l.t) + '</span>' + tagsV(l.k, l.c) + '</li>').join('') + '</ul>';
  });
  return h;
}

/* ----- pedido ----- */
function getQ(key, max, def) {
  const q = qsel[key] === undefined ? def : qsel[key];
  return Math.max(1, Math.min(max, q));
}
function qFor(pid, it, s) { return getQ(pid + '/' + it.id + '/' + s, it.n[s], s === 3 ? 1 : it.n[s]); }
function resetQ(pid, iid) {
  Object.keys(qsel).forEach((k) => { if (k.indexOf(pid + '/' + iid + '/') === 0) delete qsel[k]; });
}
function stepV(key, q, max) {
  return '<span class="stp" role="group" aria-label="Cantidad">' +
    '<button type="button" data-a="q" data-d="-1" data-k="' + key + '" data-m="' + max + '" aria-label="Menos"' + (q <= 1 ? ' disabled' : '') + '>−</button>' +
    '<output>' + q + '</output>' +
    '<button type="button" data-a="q" data-d="1" data-k="' + key + '" data-m="' + max + '" aria-label="Más"' + (q >= max ? ' disabled' : '') + '>+</button></span>';
}
function stIc(it) {
  const e = firstStage(it);
  if (e === 3) return it.k === 'pro' ? 'i-check' : (it.bb ? 'i-bolsa' : 'i-caja');
  if (e === 2 && it.k === 'ban') return 'i-logo';
  return STAGE_IC[e];
}
function legendNZ(it) {
  let h = '<div class="legend">';
  for (let s = 0; s < 4; s++) {
    if (it.n[s]) h += '<span class="lg st' + s + '"><i class="dot"></i><b>' + it.n[s] + '</b> ' + lgName(it.k, s) + '</span>';
  }
  return h + '</div>';
}

function rowV(pid, it, s) {
  const cnt = it.n[s];
  if (!cnt) return '';
  const many = it.c > 1;
  const q = qFor(pid, it, s);
  const key = pid + '/' + it.id + '/' + s;
  const base = ' data-p="' + esc(pid) + '" data-i="' + esc(it.id) + '"';
  const suf = cnt > 1 ? ' ×' + q : '';
  const pl = q > 1;
  let h = '<div class="srow">';
  if (many) {
    let det = '';
    if (s === 3 && it.k !== 'pro') det = [it.bb ? it.bb + ' en bolsa' : '', it.bc ? it.bc + ' en caja' : ''].filter(Boolean).join(' · ');
    h += '<div class="srow-h"><span><b>' + cnt + '</b> ' + lgName(it.k, s) + (det ? ' <small>(' + det + ')</small>' : '') + '</span>' +
      (cnt > 1 ? '<span class="stpw"><span class="stp-l">Cantidad</span>' + stepV(key, q, cnt) + '</span>' : '') + '</div>';
  }
  let acts = '', extra = '';
  if (s === 0 && it.k === 'combo') {
    const out = it.c - it.n[0];
    const tA = it.pa + out, tB = it.pb + out;
    const onA = it.pa === cnt, onB = it.pb === cnt;
    acts += '<button class="pz pz-alf st1' + (onA ? ' on' : '') + '" data-a="parte" data-part="pa" aria-pressed="' + onA + '"' + base + '>' +
      '<span class="pz-row"><span class="pz-it">' + ic('i-alf') + 'Cond.</span><span class="pz-it">' + ic('i-alf') + 'Acomp.</span><span class="pz-it">' + ic('i-alf') + 'Atrás</span></span>' +
      '<span class="pz-cap">' + (onA ? ic('i-check', 'sm') : '') + 'Alfombras sacadas' + (many ? ' ' + tA + '/' + it.c : '') + '</span></button>' +
      '<button class="pz pz-ban st1' + (onB ? ' on' : '') + '" data-a="parte" data-part="pb" aria-pressed="' + onB + '"' + base + '>' +
      '<span class="pz-row"><span class="pz-it">' + ic('i-bandeja') + 'Bandeja</span></span>' +
      '<span class="pz-cap">' + (onB ? ic('i-check', 'sm') : '') + 'Bandeja sacada' + (many ? ' ' + tB + '/' + it.c : '') + '</span></button>';
    if (many && (it.pa > 0 || it.pb > 0)) {
      extra = '<div class="acts">' +
        (it.pa > 0 ? '<button class="undo" data-a="parteundo" data-part="pa"' + base + '>Deshacer alfombras ×' + Math.min(q, it.pa) + '</button>' : '') +
        (it.pb > 0 ? '<button class="undo" data-a="parteundo" data-part="pb"' + base + '>Deshacer bandeja ×' + Math.min(q, it.pb) + '</button>' : '') +
        '</div>';
    }
  } else if (s === 0) {
    const lab0 = it.k === 'pro' ? (pl ? 'Marcar sacados' : 'Marcar sacado') : (pl ? 'Marcar sacadas' : 'Marcar sacada');
    acts += '<button class="act st' + (it.k === 'pro' ? 3 : 1) + '" data-a="mov" data-s="0" data-d="f"' + base + '>' + ic('i-sacar') + lab0 + suf + '</button>';
  } else if (s === 1) {
    const ban = it.k === 'ban';
    acts += '<button class="act st2" data-a="mov" data-s="1" data-d="f"' + base + '>' + ic(ban ? 'i-logo' : 'i-limpiar') +
      (ban ? 'Logo puesto' : (pl ? 'Marcar limpias' : 'Marcar limpia')) + suf + '</button>' +
      '<button class="undo" data-a="mov" data-s="1" data-d="b"' + base + '>Deshacer' + suf + '</button>';
  } else if (s === 2) {
    acts += '<button class="act st3" data-a="mov" data-s="2" data-d="f" data-b="bolsa"' + base + '>' + ic('i-bolsa') + 'En bolsa' + suf + '</button>' +
      '<button class="act st3" data-a="mov" data-s="2" data-d="f" data-b="caja"' + base + '>' + ic('i-caja') + 'En caja' + suf + '</button>' +
      '<button class="undo" data-a="mov" data-s="2" data-d="b"' + base + '>Deshacer' + suf + '</button>';
  } else if (it.k === 'pro') {
    acts += '<button class="undo" data-a="mov" data-s="3" data-d="b"' + base + '>Deshacer' + suf + '</button>';
  } else {
    const both = it.bb > 0 && it.bc > 0;
    if (it.bb > 0) acts += '<button class="undo" data-a="mov" data-s="3" data-d="b" data-b="bolsa"' + base + '>Deshacer' + (both ? ' bolsa' : '') + (it.bb > 1 ? ' ×' + Math.min(q, it.bb) : '') + '</button>';
    if (it.bc > 0) acts += '<button class="undo" data-a="mov" data-s="3" data-d="b" data-b="caja"' + base + '>Deshacer' + (both ? ' caja' : '') + (it.bc > 1 ? ' ×' + Math.min(q, it.bc) : '') + '</button>';
  }
  return h + '<div class="acts">' + acts + '</div>' + extra + '</div>';
}

function warnTxt(it) {
  const nc = parseInt(edit.c, 10);
  if (!nc || nc >= it.c) return '';
  const r = it.c - nc - it.n[0];
  if (r <= 0) return '';
  return 'Ojo: vas a quitar ' + r + (r === 1 ? ' unidad que ya se trabajó.' : ' unidades que ya se trabajaron.');
}
function editV(pid, it) {
  const w = warnTxt(it);
  let h = '<li class="item editing">' + tagsV(it.k, it.c, it.ag) +
    '<div class="field"><label for="en">Nombre</label><input id="en" type="text" autocomplete="off" value="' + esc(edit.t) + '"></div>' +
    '<div class="field"><label for="ec">Cantidad</label><input id="ec" type="number" inputmode="numeric" min="1" max="999" value="' + esc(edit.c) + '"></div>' +
    '<p class="note" id="ewarn"' + (w ? '' : ' hidden') + '>' + esc(w) + '</p>';
  if (edit.conf) {
    h += '<div class="confirm"><p>¿Eliminar este producto del pedido?</p>' +
      '<button class="btn btn-danger" data-a="eliminar-si">Sí, eliminar</button>' +
      '<button class="btn" data-a="eliminar-no">Cancelar</button></div>';
  } else {
    h += '<div class="acts"><button class="btn btn-primary" style="flex:1" data-a="editar-ok">Guardar</button>' +
      '<button class="btn" data-a="editar-no">Cancelar</button></div>' +
      '<button class="btn-text danger" data-a="eliminar">Eliminar producto</button>';
  }
  return h + '</li>';
}

// Debajo de cada alfombra, combo o bandeja: qué logo lleva, según el machete.
function machHintV(it) {
  if (it.k === 'pro') return '';
  const m = machetePara(it.t, S.mach);
  if (!m) return '';
  const inf = macheteInfo(m.detalle);
  const chips = inf.chips.length ? inf.chips.map((c) => '<span class="chip ' + c.c + '">' + esc(c.t) + '</span>').join('') : '<span class="chip note">' + esc(m.detalle) + '</span>';
  return '<div class="mhint" title="' + esc(m.modelo + ': ' + m.detalle) + '"><span class="mhint-t">Machete</span>' + chips + '</div>';
}

function itemV(pid, it) {
  if (edit && edit.p === pid && edit.i === it.id) return editV(pid, it);
  const fs = firstStage(it);
  const many = it.c > 1;
  const pz = piezas(it);
  const sk = pid + '/' + it.id;
  const sv = it.n.join('-') + '|' + it.pa + '|' + it.pb;
  const flash = lastE[sk] !== undefined && lastE[sk] !== sv;
  lastE[sk] = sv;
  let h = '<li class="item st' + fs + (it.n[0] === 0 ? ' tachada' : '') + (flash ? ' flash' : '') + '"><div class="item-top"><div class="body">' +
    tagsV(it.k, it.c, it.ag) +
    '<div class="txt"><span class="t">' + esc(it.t) + '</span></div>' +
    (pz ? '<div class="piezas">' + pz + '</div>' : '') +
    '</div>' + (many ? '' : '<span class="pill">' + ic(stIc(it)) + esc(pillTxt(it)) + '</span>') +
    '<button class="mini" data-a="editar" data-p="' + esc(pid) + '" data-i="' + esc(it.id) + '" aria-label="Editar producto">' + ic('i-edit') + '</button></div>';
  if (fs < 3) h += machHintV(it);
  if (many) h += bar({ cnt: it.n, total: it.c }) + legendNZ(it);
  for (let s = 0; s < 4; s++) if (filtro === -1 || filtro === s) h += rowV(pid, it, s);
  if (it.por) h += '<div class="quien">Último cambio: ' + esc(it.por) + ' · ' + esc(hace(it.upd)) + '</div>';
  return h + '</li>';
}

function pedidoV() {
  const p = getP(view.id);
  if (!p) { view = { n: 'home' }; return homeV(); }
  let h = header() + bannerV() + '<div><button class="btn-text" data-a="home">← Pedidos</button></div>' +
    '<div class="head"><span class="date">' + esc(fmtFecha(p.creado)) + (p.por ? ' · cargó ' + esc(p.por) : '') + '</span><h1>' + esc(p.nombre || 'Pedido sin nombre') + '</h1></div>' +
    '<div class="sum">' + bar(p, true) + legend(p) + '</div>';
  if (p.done) {
    const cel = lastDone[p.id] === false;
    h += '<p class="ok' + (cel ? ' celebra' : '') + '"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path class="ck" pathLength="1" d="M7 12.5l3.5 3.5L17 9"/></svg><span>Pedido completo. Todo está listo.</span></p>';
  }
  lastDone[p.id] = p.done;
  h += '<div class="row2"><button class="btn" data-a="agregar">' + ic('i-plus') + 'Agregar productos</button>' +
    '<button class="btn" data-a="compartir">Mandar estado</button></div>';
  let tabs = '<div class="filters"><div class="tabs" role="tablist">' +
    '<button class="tab" role="tab" data-a="filtro" data-f="-1" aria-selected="' + (filtro === -1) + '">Todo <i>' + p.total + '</i></button>';
  for (let s = 0; s < 4; s++) {
    tabs += '<button class="tab" role="tab" data-a="filtro" data-f="' + s + '" aria-selected="' + (filtro === s) + '">' + ic(STAGE_IC[s]) + STAGES[s].pl + ' <i>' + p.cnt[s] + '</i></button>';
  }
  h += tabs + '</div></div>';
  const list = p.items.filter((i) => filtro === -1 || i.n[filtro] > 0);
  if (!list.length) h += '<p class="note">No hay productos en esta etapa.</p>';
  else {
    GROUPS.forEach((g) => {
      const gi = list.filter((i) => g.ks.indexOf(i.k) > -1);
      if (!gi.length) return;
      h += '<section class="sec"><h2>' + g.n + ' <span class="gcount">' + gi.length + '</span></h2><ul class="items">' +
        gi.map((i) => itemV(p.id, i)).join('') + '</ul></section>';
    });
  }
  h += '<div class="foot">';
  if (confirmDel === p.id) {
    h += '<div class="confirm"><p>¿Eliminar este pedido para todo el equipo? No se puede deshacer.</p>' +
      '<button class="btn btn-danger" data-a="borrar-si" data-p="' + esc(p.id) + '">Sí, eliminar</button>' +
      '<button class="btn" data-a="borrar-no">Cancelar</button></div>';
  } else {
    h += '<button class="btn-text" data-a="borrar" data-p="' + esc(p.id) + '">Eliminar pedido</button>';
  }
  return h + '</div>';
}

function agregarV() {
  const p = getP(view.id);
  if (!p) { view = { n: 'home' }; return homeV(); }
  const secs = [['', 'Según el texto'], ['alf', 'Alfombras'], ['combo', 'Combos'], ['ban', 'Bandejas'], ['pro', 'Protectores']];
  const r = parseMsg(addD.texto, addD.sec, true);
  const tabs = '<div class="tabs" role="tablist">' + secs.map((x) =>
    '<button class="tab" role="tab" data-a="asec" data-v="' + x[0] + '" aria-selected="' + ((addD.sec || '') === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
  return header() + bannerV() +
    '<div><button class="btn-text" data-a="abrir" data-p="' + esc(p.id) + '">← Pedido</button></div>' +
    '<div class="head"><span class="date">Se suma a este pedido</span><h1>' + esc(p.nombre || 'Pedido sin nombre') + '</h1></div>' +
    '<div class="field"><label>Las líneas que no dicen qué son, entran como</label>' + tabs + '</div>' +
    '<div class="field"><label for="at">Pegá o escribí lo que hay que agregar</label>' +
    '<textarea id="at" placeholder="Ej: X2 Combo Cronos">' + esc(addD.texto) + '</textarea></div>' +
    '<div id="aprev">' + previewHtml(r) + '</div>' +
    '<button class="btn btn-primary btn-block" id="aok" data-a="agregar-ok"' + (r.items.length ? '' : ' disabled') + '>Agregar al pedido</button>';
}

/* ----- machete ----- */
function carV(pos) {
  if (!pos.c && !pos.a && !pos.t) return '';
  const z = (on, x, y, w, h) => '<rect class="z' + (on ? ' on' : '') + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3"/>';
  const que = [];
  if (pos.c) que.push('conductor');
  if (pos.a) que.push('acompañante');
  if (pos.t) que.push('trasera');
  return '<svg class="car" viewBox="0 0 48 88" role="img" aria-label="Alfombras indicadas: ' + que.join(', ') + '">' +
    '<rect class="cb" x="5" y="3" width="38" height="82" rx="15"/>' +
    '<rect class="cl" x="11" y="7" width="8" height="3" rx="1.5"/><rect class="cl" x="29" y="7" width="8" height="3" rx="1.5"/>' +
    z(pos.c, 10, 20, 13, 22) + z(pos.a, 25, 20, 13, 22) + z(pos.t, 10, 50, 28, 24) + '</svg>';
}
function mcardV(m) {
  const inf = macheteInfo(m.detalle);
  const chips = inf.chips.length ? '<div class="chips">' + inf.chips.map((c) => '<span class="chip ' + c.c + '">' + esc(c.t) + '</span>').join('') + '</div>' : '';
  return '<li class="mcard"><div class="mhead"><h2>' + esc(m.modelo) + '</h2>' +
    '<button class="btn-text" data-a="meditar" data-m="' + esc(m.id) + '">Editar</button>' +
    '</div><div class="mrow">' + carV(inf.pos) + '<div class="mcol">' + chips + '<p class="mdet">' + esc(m.detalle) + '</p></div></div></li>';
}
function macheteListV() {
  if (!S.mach.length) return '<section class="empty"><h2>Todavía no hay modelos</h2><p>Tocá Agregar modelo para cargar el primero.</p></section>';
  const q = sinAcentos(mq).trim();
  const list = S.mach.slice().sort((a, b) => a.modelo.localeCompare(b.modelo, 'es'))
    .filter((m) => !q || sinAcentos(m.modelo + ' ' + m.detalle).indexOf(q) > -1);
  if (!list.length) return '<p class="note">No hay modelos que coincidan con la búsqueda.</p>';
  return '<ul class="mlist">' + list.map(mcardV).join('') + '</ul>';
}
function macheteV() {
  return header() + bannerV() +
    '<div><button class="btn-text" data-a="home">← Pedidos</button></div>' +
    '<div class="head"><span class="date">Qué logo va en cada alfombra</span><h1>Machete de logos</h1></div>' +
    '<div class="field"><label for="mq">Buscar modelo</label>' +
    '<input id="mq" type="search" autocomplete="off" value="' + esc(mq) + '" placeholder="Ej: Toro, Territory, S10"></div>' +
    '<button class="btn btn-block" data-a="mnuevo">Agregar modelo</button>' +
    '<div id="mlist">' + macheteListV() + '</div>';
}
function mformV() {
  const ok = mform.modelo.trim() && mform.detalle.trim();
  return header() + bannerV() +
    '<div><button class="btn-text" data-a="machete">← Machete</button></div>' +
    '<h1>' + (mform.id ? 'Editar modelo' : 'Nuevo modelo') + '</h1>' +
    '<div class="field"><label for="mm">Modelo</label>' +
    '<input id="mm" type="text" autocomplete="off" value="' + esc(mform.modelo) + '" placeholder="Ej: TORO DOBLE CAPA"></div>' +
    '<div class="field"><label for="md">Dónde va cada logo</label>' +
    '<textarea id="md" placeholder="Ej: Solo conductor, logo Megmart">' + esc(mform.detalle) + '</textarea></div>' +
    '<button class="btn btn-primary btn-block" id="mguardar" data-a="mguardar"' + (ok ? '' : ' disabled') + '>Guardar</button>' +
    (mform.id ? (confirmM
      ? '<div class="confirm"><p>¿Eliminar este modelo?</p><button class="btn btn-danger" data-a="mborrar-si">Sí, eliminar</button><button class="btn" data-a="mborrar-no">Cancelar</button></div>'
      : '<button class="btn-text" data-a="mborrar">Eliminar modelo</button>') : '');
}

function render() {
  const tabs = app.querySelector('.tabs');
  const sl = tabs ? tabs.scrollLeft : 0;
  let h;
  if (S.fase === 'cargando') h = header() + '<p class="note">Cargando…</p>';
  else if (S.fase === 'nombre') h = nombreV();
  else {
    h = view.n === 'nuevo' ? nuevoV() : view.n === 'pedido' ? pedidoV() :
      view.n === 'machete' ? macheteV() : view.n === 'mform' ? mformV() : view.n === 'agregar' ? agregarV() : homeV();
  }
  app.innerHTML = h;
  const t2 = app.querySelector('.tabs');
  if (t2 && sl) t2.scrollLeft = sl;
}
function renderKeep() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}
function ir(v) { view = v; render(); window.scrollTo(0, 0); }

/* ---------- eventos ---------- */
app.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'nm') borrador.nombre = t.value;
  if (t.id === 'ta') {
    borrador.texto = t.value;
    const r = parseMsg(borrador.texto);
    document.getElementById('prev').innerHTML = previewHtml(r);
    document.getElementById('crear').disabled = !r.items.length;
  }
  if (t.id === 'at') {
    addD.texto = t.value;
    const r = parseMsg(addD.texto, addD.sec, true);
    document.getElementById('aprev').innerHTML = previewHtml(r);
    document.getElementById('aok').disabled = !r.items.length;
  }
  if (t.id === 'en' && edit) edit.t = t.value;
  if (t.id === 'ec' && edit) {
    edit.c = t.value;
    const it = findItem(edit.p, edit.i), w = it ? warnTxt(it) : '', ew = document.getElementById('ewarn');
    if (ew) { ew.textContent = w; ew.hidden = !w; }
  }
  if (t.id === 'hq') { S.hq = t.value; document.getElementById('hlist').innerHTML = listaHomeV(todos()); }
  if (t.id === 'mq') { mq = t.value; document.getElementById('mlist').innerHTML = macheteListV(); }
  if (t.id === 'mm' || t.id === 'md') {
    if (t.id === 'mm') mform.modelo = t.value; else mform.detalle = t.value;
    document.getElementById('mguardar').disabled = !(mform.modelo.trim() && mform.detalle.trim());
  }
});

app.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (ev.target.id === 'fnombre') {
    const v = document.getElementById('yn').value.trim().slice(0, 30);
    if (!v) { toast('Escribí tu nombre.'); return; }
    S.yo = v;
    LS.set(K_NOMBRE, v);
    document.activeElement && document.activeElement.blur();
    entrarApp();
  }
});

app.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-a]');
  if (!b) return;
  const a = b.getAttribute('data-a');
  const d = b.dataset;
  if (a === 'nuevo') ir({ n: 'nuevo' });
  else if (a === 'home') { confirmDel = null; edit = null; ir({ n: 'home' }); }
  else if (a === 'abrir') { filtro = -1; confirmDel = null; lastE = {}; lastDone = {}; edit = null; ir({ n: 'pedido', id: d.p }); }
  else if (a === 'filtro') { filtro = parseInt(d.f, 10); renderKeep(); }
  else if (a === 'verfin') { S.verTerminados = true; renderKeep(); }
  else if (a === 'mov') {
    const it = findItem(d.p, d.i);
    if (!it) return;
    const s = parseInt(d.s, 10), q = qFor(d.p, it, s);
    resetQ(d.p, d.i);
    cambiarItem(d.i, (cur) => mover(cur, s, d.d, q, d.b));
  }
  else if (a === 'parte') {
    const it = findItem(d.p, d.i);
    if (!it) return;
    const q = qFor(d.p, it, 0);
    resetQ(d.p, d.i);
    cambiarItem(d.i, (cur) => marcarParte(cur, d.part, q));
  }
  else if (a === 'parteundo') {
    const it = findItem(d.p, d.i);
    if (!it) return;
    const q = qFor(d.p, it, 0);
    resetQ(d.p, d.i);
    cambiarItem(d.i, (cur) => deshacerParte(cur, d.part, q));
  }
  else if (a === 'q') {
    const mx = parseInt(d.m, 10), ss = d.k.split('/').pop();
    qsel[d.k] = Math.max(1, Math.min(mx, getQ(d.k, mx, ss === '3' ? 1 : mx) + parseInt(d.d, 10)));
    renderKeep();
  }
  else if (a === 'editar') {
    const it = findItem(d.p, d.i);
    if (!it) return;
    edit = { p: d.p, i: d.i, t: it.t, c: String(it.c), conf: false };
    renderKeep();
  }
  else if (a === 'editar-no') { edit = null; renderKeep(); }
  else if (a === 'editar-ok') {
    if (!edit) return;
    const nm = (edit.t || '').trim(), nc = parseInt(edit.c, 10);
    if (!findItem(edit.p, edit.i)) { edit = null; renderKeep(); return; }
    if (!nm) { toast('El nombre no puede quedar vacío.'); return; }
    if (!nc || nc < 1 || nc > 999) { toast('La cantidad tiene que estar entre 1 y 999.'); return; }
    const pe = edit.p, ie = edit.i;
    edit = null; resetQ(pe, ie);
    cambiarItem(ie, (cur) => ({ ...ajustarCantidad(cur, nc), t: nm }));
    renderKeep();
  }
  else if (a === 'eliminar') { if (edit) { edit.conf = true; renderKeep(); } }
  else if (a === 'eliminar-no') { if (edit) { edit.conf = false; renderKeep(); } }
  else if (a === 'eliminar-si') {
    if (!edit) return;
    const pd = edit.p, id2 = edit.i;
    edit = null; resetQ(pd, id2);
    borrarItem(id2);
  }
  else if (a === 'agregar') { addD = { texto: '', sec: null }; ir({ n: 'agregar', id: view.id }); }
  else if (a === 'asec') { addD.sec = d.v || null; render(); }
  else if (a === 'agregar-ok') {
    const r = parseMsg(addD.texto, addD.sec, true);
    if (!r.items.length) return;
    b.disabled = true;
    const pid = view.id;
    agregarItems(pid, r.items).then(() => {
      toast('Se agregaron ' + r.items.length + (r.items.length === 1 ? ' línea' : ' líneas') + ' al pedido.');
      addD = { texto: '', sec: null };
      ir({ n: 'pedido', id: pid });
    }).catch((e) => { b.disabled = false; toast(errMsg(e)); });
  }
  else if (a === 'compartir') {
    const p = getP(view.id);
    if (p) compartir(textoResumen(p));
  }
  else if (a === 'machete') { confirmM = false; ir({ n: 'machete' }); }
  else if (a === 'mnuevo') { mform = { id: null, modelo: '', detalle: '' }; confirmM = false; ir({ n: 'mform' }); }
  else if (a === 'meditar') {
    const mf = S.mach.find((m) => m.id === d.m);
    if (!mf) return;
    mform = { id: mf.id, modelo: mf.modelo, detalle: mf.detalle };
    confirmM = false; ir({ n: 'mform' });
  }
  else if (a === 'mguardar') {
    const dat = { modelo: mform.modelo.trim(), detalle: mform.detalle.trim() };
    if (!dat.modelo || !dat.detalle) return;
    b.disabled = true;
    guardarMachete(mform.id, dat).then(() => ir({ n: 'machete' }))
      .catch((e) => { b.disabled = false; toast(errMsg(e)); });
  }
  else if (a === 'mborrar') { confirmM = true; render(); }
  else if (a === 'mborrar-no') { confirmM = false; render(); }
  else if (a === 'mborrar-si') {
    b.disabled = true;
    borrarMachete(mform.id).then(() => { confirmM = false; ir({ n: 'machete' }); })
      .catch((e) => { b.disabled = false; toast(errMsg(e)); });
  }
  else if (a === 'ejemplo') { borrador.texto = EJEMPLO; if (!borrador.nombre) borrador.nombre = 'Pedido de ejemplo'; render(); }
  else if (a === 'crear') {
    const r = parseMsg(borrador.texto);
    if (!r.items.length) return;
    b.disabled = true; b.textContent = 'Creando…';
    crearPedido(borrador.nombre.trim() || r.title, r.items).then((id) => {
      borrador = { nombre: '', texto: '' };
      filtro = -1;
      ir({ n: 'pedido', id });
    }).catch((e) => { b.disabled = false; b.textContent = 'Crear pedido'; toast(errMsg(e)); });
  }
  else if (a === 'borrar') { confirmDel = d.p; renderKeep(); }
  else if (a === 'borrar-no') { confirmDel = null; renderKeep(); }
  else if (a === 'borrar-si') {
    confirmDel = null;
    ir({ n: 'home' });
    borrarPedido(d.p);
  }
  else if (a === 'migrar') { if (!S.migrando) migrar(); }
  else if (a === 'nomigrar') { LS.set(K_MIGRADO, 'descartado'); render(); }
  else if (a === 'nombre') { S.fase = 'nombre'; render(); }
});

async function compartir(txt) {
  if (navigator.share) {
    try { await navigator.share({ text: txt }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(txt);
    toast('Estado copiado. Pegalo en WhatsApp.');
  } catch {
    toast('No se pudo copiar en este navegador.');
  }
}

/* ---------- arranque (sin usuario ni contraseña) ---------- */
function entrarApp() {
  const yaEstaba = S.fase === 'app';
  S.fase = 'app';
  if (yaEstaba) { render(); return; }
  if (leerCache()) S.listo = true;
  render();
  recargar();
  escuchar();
}

window.addEventListener('online', () => { S.online = true; render(); recargar(); });
window.addEventListener('offline', () => { S.online = false; refrescar(); });
// Al volver a la app después de un rato (el celular se bloqueó), traer lo último.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { S.oculto = Date.now(); return; }
  if (S.oculto && Date.now() - S.oculto > 20000) recargar();
});
// Para que "Último cambio: hace X min" no quede viejo
setInterval(() => { if (S.fase === 'app' && (view.n === 'pedido')) refrescar(); }, 60000);

if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
// La primera vez pide el nombre (para saber quién marcó cada cosa); después entra directo.
if (S.yo) entrarApp();
else { S.fase = 'nombre'; render(); }
