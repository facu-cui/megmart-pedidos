// Megmart Pedidos · versión con base de datos compartida (Supabase).
// Todos los celulares ven los mismos pedidos y se actualizan solos.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import {
  parseMsg, STAGES, KINDS, GROUPS, firstStage, stName, lgName, limpiarItem, itemViejo, nuevoItem,
  mover, marcarParte, deshacerParte, ajustarCantidad, resumen, pillTxt, piezas, textoResumen,
  sinAcentos, claveM, macheteInfo, machetePara
} from './logica.js';

// Si config.js todavía tiene los datos de ejemplo, la app avisa en vez de quedarse cargando.
// La dirección se limpia por si se pegó con "/rest/v1/" o una barra al final (pasa seguido).
const SB_URL = String(SUPABASE_URL || '').trim().replace(/\/(rest|auth|realtime|storage)\/v1.*$/i, '').replace(/\/+$/, '');
const SB_KEY = String(SUPABASE_ANON_KEY || '').trim();
const URL_OK = /^https:\/\/[^/\s]+$/i.test(SB_URL) && !/TU-PROYECTO/i.test(SB_URL);
const KEY_OK = SB_KEY.length > 20 && !/PEGA/i.test(SB_KEY);
let sb = null;
try { if (URL_OK && KEY_OK) sb = createClient(SB_URL, SB_KEY); } catch { sb = null; }

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
  error: '',                 // por qué no se pudieron traer los pedidos (si pasó)
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
... (Quedan 909 líneas)
