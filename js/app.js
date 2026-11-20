'use strict';
/* =========================================================================
   Assistent – Kunden, Anwendungen, Termine, Zahlungen, Nachfassen
   Alle Daten liegen lokal im Browser (localStorage). Backup via JSON-Export.
   ========================================================================= */

const STORE_KEY = 'assistent-data-v1';

const CUSTOMER_STATUS = {
  interessent:    { label: 'Interessent',    cls: 'st-int' },
  aktiv:          { label: 'Kunde aktiv',    cls: 'st-akt' },
  pausiert:       { label: 'Pausiert',       cls: 'st-pau' },
  abgeschlossen:  { label: 'Abgeschlossen',  cls: 'st-abg' },
  kein_interesse: { label: 'Kein Interesse', cls: 'st-kei' },
};
const APPT_STATUS = {
  geplant:          { label: 'Geplant',          cls: 'info' },
  erledigt:         { label: 'Erledigt',         cls: 'ok' },
  abgesagt:         { label: 'Abgesagt',         cls: '' },
  nicht_erschienen: { label: 'Nicht erschienen', cls: 'danger' },
};
const PAY_METHODS = ['Bar', 'Überweisung', 'Karte / EC', 'PayPal', 'Gutschein', 'Sonstiges'];

function defaultSettings() {
  return {
    businessName: 'Assistent',
    followUpDays: 3,
    categories: [
      { id: 'erst',     name: 'Erstgespräch',          color: '#2b6cb0' },
      { id: 'anw',      name: 'Anwendung',             color: '#2f8f5b' },
      { id: 'nach',     name: 'Nachfassen / Rückruf',  color: '#d97706' },
      { id: 'beratung', name: 'Beratung',              color: '#7c3aed' },
      { id: 'online',   name: 'Online-Termin',         color: '#0e9aa7' },
      { id: 'privat',   name: 'Privat / Intern',       color: '#6b7280' },
    ],
    services: [
      { id: 's1', name: 'Anwendung 60 Min', price: 80, duration: 60 },
      { id: 's2', name: 'Anwendung 30 Min', price: 45, duration: 30 },
      { id: 's3', name: 'Erstberatung',     price: 0,  duration: 30 },
    ],
    lastBackup: null,
  };
}
function emptyData() {
  return { version: 1, customers: [], sessions: [], appointments: [], settings: defaultSettings() };
}

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const parseYmd = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 86400000);
const fmtDate = s => s ? parseYmd(s).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
const fmtDateShort = s => s ? parseYmd(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '–';
const fmtDayLong = s => parseYmd(s).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const money = n => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const initials = c => ((c.firstName || '')[0] || '') + ((c.lastName || '')[0] || '') || '?';

function relDay(s) {
  const d = diffDays(s, today());
  if (d === 0) return 'heute';
  if (d === 1) return 'morgen';
  if (d === -1) return 'gestern';
  if (d > 1 && d < 7) return `in ${d} Tagen`;
  if (d < -1 && d > -60) return `vor ${-d} Tagen`;
  return fmtDateShort(s);
}

/* ---------- Store ---------- */
let db = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyData();
    return normalize(JSON.parse(raw));
  } catch (e) {
    console.error(e);
    return emptyData();
  }
}
function normalize(d) {
  const base = emptyData();
  const out = {
    version: 1,
    customers: Array.isArray(d.customers) ? d.customers : [],
    sessions: Array.isArray(d.sessions) ? d.sessions : [],
    appointments: Array.isArray(d.appointments) ? d.appointments : [],
    settings: Object.assign(base.settings, d.settings || {}),
  };
  out.customers.forEach(c => { c.log = Array.isArray(c.log) ? c.log : []; });
  return out;
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message);
  }
}

/* ---------- Queries ---------- */
const getCustomer = id => db.customers.find(c => c.id === id);
const custName = c => c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Ohne Namen' : '';
const custNameById = id => custName(getCustomer(id));
const category = id => db.settings.categories.find(c => c.id === id) || { id, name: 'Ohne Kategorie', color: '#9ca3af' };
const apptKey = a => `${a.date}T${a.time || '00:00'}`;
const sortedCustomers = () => [...db.customers].sort((a, b) => custName(a).localeCompare(custName(b), 'de'));

function sessionsOf(cid) {
  return db.sessions.filter(s => s.customerId === cid).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
function apptsOf(cid) {
  return db.appointments.filter(a => a.customerId === cid).sort((a, b) => apptKey(a).localeCompare(apptKey(b)));
}
function nextAppt(cid) {
  const now = `${today()}T00:00`;
  return apptsOf(cid).find(a => a.status === 'geplant' && apptKey(a) >= now);
}
function custStats(cid) {
  const c = getCustomer(cid);
  const ss = sessionsOf(cid);
  const done = ss.filter(s => s.status === 'erledigt');
  const open = ss.filter(s => s.status === 'offen');
  const total = done.reduce((t, s) => t + num(s.price), 0);
  const paid = done.filter(s => s.paid).reduce((t, s) => t + num(s.price), 0);
  const pkg = Math.max(0, parseInt(c?.packageSessions, 10) || 0);
  return {
    done: done.length, open: open.length, total, paid, unpaid: total - paid,
    pkg, progress: pkg ? Math.min(100, Math.round(done.length / pkg * 100)) : null,
    last: done[0], next: nextAppt(cid),
  };
}
function paymentState(st) {
  if (!st.total) return null;
  if (st.unpaid <= 0) return { label: 'Bezahlt', cls: 'ok' };
  if (st.paid > 0) return { label: 'Teilweise bezahlt', cls: 'warn' };
  return { label: 'Offen', cls: 'danger' };
}

/** Kunden, bei denen nachgefasst werden muss. */
function followUps() {
  const horizon = addDays(today(), 3);
  return db.customers
    .filter(c => !['kein_interesse', 'abgeschlossen'].includes(c.status) || c.followUpDate)
    .filter(c => (c.followUpDate && c.followUpDate <= horizon) || (c.status === 'interessent' && !c.followUpDate))
    .map(c => ({ c, overdue: c.followUpDate ? c.followUpDate < today() : false, due: c.followUpDate || null }))
    .sort((a, b) => (a.due || '0000').localeCompare(b.due || '0000'));
}
/** Aktive Kunden, die noch behandelt / eingeplant werden müssen. */
function todoCustomers() {
  return db.customers.filter(c => c.status === 'aktiv').map(c => {
    const st = custStats(c.id);
    const reasons = [];
    if (st.open) reasons.push(`${st.open} Anwendung${st.open > 1 ? 'en' : ''} offen`);
    if (st.pkg && st.done < st.pkg && !st.next) reasons.push(`noch ${st.pkg - st.done} von ${st.pkg} – kein Termin geplant`);
    if (!st.pkg && !st.next && !st.open) reasons.push('kein Folgetermin geplant');
    return reasons.length ? { c, st, reasons } : null;
  }).filter(Boolean);
}
function unpaidSessions() {
  return db.sessions.filter(s => s.status === 'erledigt' && !s.paid && num(s.price) > 0)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/* ---------- UI primitives ---------- */
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
const statusBadge = s => { const x = CUSTOMER_STATUS[s] || CUSTOMER_STATUS.interessent; return `<span class="badge ${x.cls}">${x.label}</span>`; };
const catBadge = id => { const c = category(id); return `<span class="badge cat-badge" style="background:${esc(c.color)}22;color:${esc(c.color)}"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</span>`; };
const apptStatusBadge = s => { const x = APPT_STATUS[s] || APPT_STATUS.geplant; return `<span class="badge ${x.cls}">${x.label}</span>`; };
const progressBar = (p, lg) => `<div class="progress${lg ? ' lg' : ''}" title="${p}%"><span style="width:${p}%"></span></div>`;
const empty = t => `<div class="empty">${t}</div>`;
const custLink = id => { const c = getCustomer(id); return c ? `<a href="#/kunde/${esc(id)}">${esc(custName(c))}</a>` : ''; };

function opt(value, label, sel) { return `<option value="${esc(value)}"${String(value) === String(sel ?? '') ? ' selected' : ''}>${esc(label)}</option>`; }
function field(label, inner, cls = '') { return `<label class="field ${cls}">${esc(label)}${inner}</label>`; }
function customerOptions(sel, allowNone) {
  return (allowNone ? opt('', '— kein Kunde —', sel) : '') + sortedCustomers().map(c => opt(c.id, custName(c), sel)).join('');
}

/* ---------- Modal ---------- */
let modalState = null;
function openModal({ title, body, submitLabel = 'Speichern', onSubmit, onDelete, onOpen }) {
  modalState = { onSubmit, onDelete };
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  $('#modalSubmit').textContent = submitLabel;
  $('#modalDelete').hidden = !onDelete;
  const dlg = $('#modal');
  if (!dlg.open) dlg.showModal();
  onOpen && onOpen($('#modalForm'));
  const first = $('#modalBody input:not([type=hidden]), #modalBody select, #modalBody textarea');
  if (first && window.matchMedia('(min-width: 760px)').matches) first.focus();
}
function closeModal() { $('#modal').close(); modalState = null; }

$('#modalForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!modalState) return;
  const form = e.target;
  const missing = $$('[required]', form).find(el => !String(el.value).trim());
  if (missing) { missing.focus(); toast('Bitte Pflichtfelder ausfüllen'); return; }
  const data = {};
  new FormData(form).forEach((v, k) => { data[k] = typeof v === 'string' ? v.trim() : v; });
  $$('input[type=checkbox]', form).forEach(cb => { data[cb.name] = cb.checked; });
  const keepOpen = modalState.onSubmit(data, form) === false;
  if (!keepOpen) { closeModal(); render(); }
});
$('#modalDelete').addEventListener('click', async () => {
  const fn = modalState?.onDelete;
  if (fn && (await fn()) !== false) { closeModal(); render(); }
});

/* Eigener Bestätigungsdialog (confirm() ist in eingebetteten Ansichten blockiert). */
function ask(message, okLabel = 'Ja, fortfahren') {
  return new Promise(resolve => {
    const dlg = $('#askDialog');
    $('#askText').textContent = message;
    $('#askOk').textContent = okLabel;
    const done = v => { dlg.close(); resolve(v); };
    $('#askOk').onclick = () => done(true);
    $('#askCancel').onclick = () => done(false);
    dlg.oncancel = e => { e.preventDefault(); done(false); };
    dlg.showModal();
  });
}

/* ---------- Forms ---------- */
function customerForm(c = null, preset = {}) {
  const x = c || Object.assign({ status: 'interessent' }, preset);
  const body = `<div class="form-grid">
    ${field('Vorname *', `<input name="firstName" value="${esc(x.firstName)}" required autocomplete="off">`)}
    ${field('Nachname', `<input name="lastName" value="${esc(x.lastName)}" autocomplete="off">`)}
    ${field('Telefon', `<input name="phone" type="tel" value="${esc(x.phone)}">`)}
    ${field('E-Mail', `<input name="email" type="email" value="${esc(x.email)}">`)}
    ${field('Adresse', `<input name="address" value="${esc(x.address)}">`, 'full')}
    ${field('Geburtstag', `<input name="birthday" type="date" value="${esc(x.birthday)}">`)}
    ${field('Wie gefunden? (Quelle)', `<input name="source" value="${esc(x.source)}" placeholder="z. B. Empfehlung, Instagram">`)}
    <div class="form-section">Status &amp; Paket</div>
    ${field('Status', `<select name="status">${Object.entries(CUSTOMER_STATUS).map(([k, v]) => opt(k, v.label, x.status)).join('')}</select>`)}
    ${field('Anliegen / Ziel', `<input name="goal" value="${esc(x.goal)}" placeholder="z. B. Rückenschmerzen lindern">`)}
    ${field('Paket / Programm', `<input name="packageName" value="${esc(x.packageName)}" placeholder="z. B. 10er-Karte">`)}
    ${field('Geplante Anwendungen (Anzahl)', `<input name="packageSessions" type="number" min="0" step="1" value="${esc(x.packageSessions)}" placeholder="z. B. 10">`)}
    <div class="form-section">Nachfassen / Wiedervorlage</div>
    ${field('Wiedervorlage am', `<input name="followUpDate" type="date" value="${esc(x.followUpDate)}">`)}
    ${field('Was ist zu tun?', `<input name="followUpNote" value="${esc(x.followUpNote)}" placeholder="z. B. Angebot nachfragen">`)}
    ${field('Notizen', `<textarea name="notes">${esc(x.notes)}</textarea>`, 'full')}
  </div>`;
  openModal({
    title: c ? 'Kunde bearbeiten' : 'Neuer Kunde',
    body,
    onSubmit: d => {
      if (d.status === 'interessent' && !d.followUpDate && !c) d.followUpDate = addDays(today(), db.settings.followUpDays || 3);
      if (c) { Object.assign(c, d); toast('Kunde gespeichert'); }
      else {
        const nc = Object.assign({ id: uid(), createdAt: today(), log: [] }, d);
        db.customers.push(nc);
        save();
        toast('Kunde angelegt');
        location.hash = `#/kunde/${nc.id}`;
        return;
      }
      save();
    },
    onDelete: c ? async () => {
      if (!await ask(`„${custName(c)}“ mit allen Anwendungen löschen? Termine bleiben ohne Kundenzuordnung erhalten.`)) return false;
      db.customers = db.customers.filter(x => x.id !== c.id);
      db.sessions = db.sessions.filter(s => s.customerId !== c.id);
      db.appointments.forEach(a => { if (a.customerId === c.id) a.customerId = ''; });
      save();
      toast('Kunde gelöscht');
      location.hash = '#/kunden';
    } : null,
  });
}

function sessionForm(s = null, preset = {}) {
  if (!db.customers.length) { toast('Bitte zuerst einen Kunden anlegen'); return; }
  const x = s || Object.assign({ date: today(), status: 'erledigt', paid: false, progress: '' }, preset);
  const services = db.settings.services;
  const body = `<div class="form-grid">
    ${field('Kunde *', `<select name="customerId" required>${customerOptions(x.customerId)}</select>`, 'full')}
    ${field('Anwendung / Leistung *', `<input name="service" list="serviceList" value="${esc(x.service)}" required placeholder="Leistung wählen oder eintippen">
      <datalist id="serviceList">${services.map(v => `<option value="${esc(v.name)}">`).join('')}</datalist>`)}
    ${field('Datum', `<input name="date" type="date" value="${esc(x.date)}">`)}
    ${field('Status', `<select name="status">${opt('erledigt', 'Erledigt / durchgeführt', x.status)}${opt('offen', 'Offen – muss noch gemacht werden', x.status)}</select>`)}
    ${field('Fortschritt / Befinden (0–10)', `<div style="display:flex;gap:10px;align-items:center"><input name="progress" type="range" min="0" max="10" step="1" value="${esc(x.progress === '' || x.progress == null ? 5 : x.progress)}" oninput="this.nextElementSibling.textContent=this.value"><b>${esc(x.progress === '' || x.progress == null ? 5 : x.progress)}</b></div>`)}
    <div class="form-section">Bezahlung</div>
    ${field('Preis (€)', `<input name="price" inputmode="decimal" value="${esc(x.price)}" placeholder="0,00">`)}
    ${field('Zahlungsart', `<select name="payMethod">${opt('', '—', x.payMethod)}${PAY_METHODS.map(m => opt(m, m, x.payMethod)).join('')}</select>`)}
    <label class="check full"><input type="checkbox" name="paid" ${x.paid ? 'checked' : ''}> Bezahlt</label>
    <div class="form-section">Dokumentation</div>
    ${field('Notizen zur Anwendung / Fortschritt', `<textarea name="notes" placeholder="Was wurde gemacht? Wie geht es dem Kunden? Nächste Schritte?">${esc(x.notes)}</textarea>`, 'full')}
  </div>`;
  openModal({
    title: s ? 'Anwendung bearbeiten' : 'Anwendung dokumentieren',
    body,
    onOpen: form => {
      const inp = form.elements.service;
      inp.addEventListener('change', () => {
        const sv = services.find(v => v.name === inp.value);
        if (sv && !form.elements.price.value) form.elements.price.value = String(sv.price).replace('.', ',');
      });
    },
    onSubmit: d => {
      d.price = num(d.price);
      d.progress = parseInt(d.progress, 10);
      if (d.paid && !(s && s.paid)) d.paidAt = today();
      if (!d.paid) d.paidAt = '';
      if (s) Object.assign(s, d);
      else db.sessions.push(Object.assign({ id: uid(), apptId: preset.apptId || '' }, d));
      save();
      toast('Anwendung gespeichert');
    },
    onDelete: s ? async () => {
      if (!await ask('Diese Anwendung löschen?')) return false;
      db.sessions = db.sessions.filter(v => v.id !== s.id);
      save(); toast('Anwendung gelöscht');
    } : null,
  });
}

function apptForm(a = null, preset = {}) {
  const x = a || Object.assign({ date: today(), time: '', duration: 60, category: 'anw', status: 'geplant' }, preset);
  const body = `<div class="form-grid">
    ${field('Kategorie', `<select name="category">${db.settings.categories.map(c => opt(c.id, c.name, x.category)).join('')}</select>`)}
    ${field('Kunde', `<select name="customerId">${customerOptions(x.customerId, true)}</select>`)}
    ${field('Titel (optional)', `<input name="title" value="${esc(x.title)}" placeholder="z. B. 3. Anwendung">`, 'full')}
    ${field('Datum *', `<input name="date" type="date" value="${esc(x.date)}" required>`)}
    ${field('Uhrzeit', `<input name="time" type="time" value="${esc(x.time)}">`)}
    ${field('Dauer (Min.)', `<input name="duration" type="number" min="0" step="5" value="${esc(x.duration)}">`)}
    ${field('Status', `<select name="status">${Object.entries(APPT_STATUS).map(([k, v]) => opt(k, v.label, x.status)).join('')}</select>`)}
    ${field('Ort', `<input name="location" value="${esc(x.location)}" placeholder="z. B. Praxis, online, Hausbesuch">`, 'full')}
    ${field('Notizen', `<textarea name="notes">${esc(x.notes)}</textarea>`, 'full')}
  </div>`;
  openModal({
    title: a ? 'Termin bearbeiten' : 'Neuer Termin',
    body,
    onSubmit: d => {
      d.duration = parseInt(d.duration, 10) || 0;
      if (a) Object.assign(a, d);
      else db.appointments.push(Object.assign({ id: uid() }, d));
      save();
      toast('Termin gespeichert');
    },
    onDelete: a ? async () => {
      if (!await ask('Diesen Termin löschen?')) return false;
      db.appointments = db.appointments.filter(v => v.id !== a.id);
      save(); toast('Termin gelöscht');
    } : null,
  });
}

function contactForm(c) {
  const days = db.settings.followUpDays || 3;
  const body = `<div class="form-grid">
    ${field('Datum', `<input name="date" type="date" value="${today()}">`)}
    ${field('Art', `<select name="kind">${['Anruf', 'WhatsApp / SMS', 'E-Mail', 'Persönlich', 'Social Media'].map(k => opt(k, k)).join('')}</select>`)}
    ${field('Ergebnis / Notiz *', `<textarea name="text" required placeholder="Was wurde besprochen?"></textarea>`, 'full')}
    ${field('Neuer Status', `<select name="status">${Object.entries(CUSTOMER_STATUS).map(([k, v]) => opt(k, v.label, c.status)).join('')}</select>`)}
    ${field('Nächste Wiedervorlage', `<input name="followUpDate" type="date" value="">`)}
    <div class="full chips">
      ${[[days, `+${days} Tage`], [7, '+1 Woche'], [14, '+2 Wochen'], [30, '+1 Monat']].map(([n, l]) => `<button type="button" class="chip" onclick="this.form.followUpDate.value='${addDays(today(), n)}'">${l}</button>`).join('')}
    </div>
    ${field('Was ist dann zu tun?', `<input name="followUpNote" value="">`, 'full')}
  </div>`;
  openModal({
    title: `Kontakt mit ${custName(c)}`,
    body,
    submitLabel: 'Kontakt speichern',
    onSubmit: d => {
      c.log.unshift({ id: uid(), date: d.date || today(), kind: d.kind, text: d.text });
      c.status = d.status;
      c.followUpDate = d.followUpDate || '';
      c.followUpNote = d.followUpDate ? d.followUpNote : '';
      c.lastContact = d.date || today();
      save();
      toast(d.followUpDate ? `Wiedervorlage am ${fmtDateShort(d.followUpDate)}` : 'Kontakt gespeichert');
    },
  });
}

/* ---------- Views ---------- */
const views = {};

views.dashboard = () => {
  const t = today();
  if (!db.customers.length && !db.appointments.length) {
    return `<div class="card welcome">
      <h1>Willkommen 👋</h1>
      <p>Hier verwaltest du deine Kunden mit Kundenkarte, Anwendungen &amp; Fortschritt, Termine nach Kategorien, Zahlungen und wen du noch nachfassen musst.</p>
      <div class="chips" style="justify-content:center">
        <button class="btn primary" data-action="newCustomer">+ Ersten Kunden anlegen</button>
        <button class="btn" data-action="loadDemo">Beispieldaten ansehen</button>
      </div>
    </div>`;
  }
  const upcoming = db.appointments
    .filter(a => a.date >= t && a.date <= addDays(t, 7) && a.status !== 'abgesagt')
    .sort((a, b) => apptKey(a).localeCompare(apptKey(b)));
  const todayCount = upcoming.filter(a => a.date === t).length;
  const fu = followUps();
  const todo = todoCustomers();
  const unpaid = unpaidSessions();
  const unpaidSum = unpaid.reduce((s, x) => s + num(x.price), 0);
  const active = db.customers.filter(c => c.status === 'aktiv').length;
  const hello = new Date().getHours() < 11 ? 'Guten Morgen' : new Date().getHours() < 18 ? 'Hallo' : 'Guten Abend';

  return `
  <div class="page-head">
    <div><h1>${hello}!</h1><div class="muted">${esc(fmtDayLong(t))}</div></div>
    <div class="actions">
      <button class="btn" data-action="newCustomer">+ Kunde</button>
      <button class="btn" data-action="newSession">+ Anwendung</button>
      <button class="btn primary" data-action="newAppt">+ Termin</button>
    </div>
  </div>
  <div class="grid grid-kpi">
    <a class="card kpi" href="#/termine"><div class="val">${todayCount}</div><div class="lbl">Termine heute</div></a>
    <a class="card kpi ${fu.some(f => f.overdue) ? 'danger' : fu.length ? 'warn' : ''}" href="#/kunden?f=nachfassen"><div class="val">${fu.length}</div><div class="lbl">Nachfassen</div></a>
    <a class="card kpi" href="#/kunden?f=aktiv"><div class="val">${active}</div><div class="lbl">Aktive Kunden</div></a>
    <a class="card kpi ${unpaidSum ? 'danger' : ''}" href="#/zahlungen"><div class="val">${money(unpaidSum)}</div><div class="lbl">Offene Zahlungen</div></a>
  </div>
  <div class="grid grid-2">
    <section class="card">
      <div class="card-head"><h2>📅 Nächste 7 Tage</h2><a class="btn sm ghost" href="#/termine">Kalender</a></div>
      ${upcoming.length ? `<ul class="list">${upcoming.slice(0, 10).map(apptRow).join('')}</ul>` : empty('Keine Termine in den nächsten 7 Tagen.')}
    </section>
    <section class="card">
      <div class="card-head"><h2>📞 Nachfassen</h2><span class="badge ${fu.length ? 'warn' : ''}">${fu.length}</span></div>
      ${fu.length ? `<ul class="list">${fu.slice(0, 10).map(followRow).join('')}</ul>` : empty('Niemand wartet auf eine Rückmeldung. 🎉')}
    </section>
    <section class="card">
      <div class="card-head"><h2>✅ Noch zu machen</h2><span class="badge ${todo.length ? 'info' : ''}">${todo.length}</span></div>
      ${todo.length ? `<ul class="list">${todo.slice(0, 10).map(({ c, st, reasons }) => `
        <li>
          <span class="avatar sm">${esc(initials(c))}</span>
          <div class="main">
            <div class="title">${custLink(c.id)}</div>
            <div class="sub">${reasons.map(esc).join(' · ')}</div>
            ${st.pkg ? `<div style="margin-top:4px">${progressBar(st.progress)}</div>` : ''}
          </div>
          <div class="side"><button class="btn sm" data-action="newAppt" data-customer="${c.id}">Termin</button></div>
        </li>`).join('')}</ul>` : empty('Alle aktiven Kunden sind eingeplant.')}
    </section>
    <section class="card">
      <div class="card-head"><h2>💶 Offene Zahlungen</h2><a class="btn sm ghost" href="#/zahlungen">Alle</a></div>
      ${unpaid.length ? `<ul class="list">${unpaid.slice(0, 8).map(payRow).join('')}</ul>` : empty('Alles bezahlt. 👍')}
    </section>
  </div>`;
};

function apptRow(a) {
  const cat = category(a.category);
  const c = getCustomer(a.customerId);
  const title = a.title || cat.name;
  return `<li>
    <span class="cat-bar" style="background:${esc(cat.color)}"></span>
    <div class="time-box"><b>${a.time ? esc(a.time) : '—'}</b>${esc(relDay(a.date))}</div>
    <div class="main">
      <div class="title"><a href="#" data-action="editAppt" data-id="${a.id}">${esc(title)}</a></div>
      <div class="sub">${c ? custLink(c.id) + ' · ' : ''}${catBadge(a.category)}${a.location ? ' · ' + esc(a.location) : ''}</div>
    </div>
    <div class="side">
      ${a.status === 'geplant' ? `<button class="btn sm" data-action="apptDone" data-id="${a.id}" title="Als erledigt markieren${c ? ' und Anwendung dokumentieren' : ''}">✓ Erledigt</button>` : apptStatusBadge(a.status)}
    </div>
  </li>`;
}
function followRow({ c, overdue, due }) {
  return `<li>
    <span class="avatar sm">${esc(initials(c))}</span>
    <div class="main">
      <div class="title">${custLink(c.id)} ${statusBadge(c.status)}</div>
      <div class="sub">${due ? `<span class="badge ${overdue ? 'danger' : 'warn'}">${overdue ? 'überfällig' : ''} ${esc(relDay(due))}</span> ` : '<span class="badge">ohne Datum</span> '}${esc(c.followUpNote || c.goal || '')}</div>
    </div>
    <div class="side">
      ${c.phone ? `<a class="btn sm" href="tel:${esc(c.phone)}" title="Anrufen">📞</a>` : ''}
      <button class="btn sm" data-action="contact" data-id="${c.id}">Nachgefasst</button>
    </div>
  </li>`;
}
function payRow(s) {
  return `<li>
    <div class="main">
      <div class="title">${custLink(s.customerId)}</div>
      <div class="sub">${esc(s.service)} · ${esc(fmtDateShort(s.date))} <span class="badge ${diffDays(today(), s.date) > 14 ? 'danger' : 'warn'}">seit ${Math.max(0, diffDays(today(), s.date))} Tagen</span></div>
    </div>
    <div class="side"><b class="nowrap">${money(s.price)}</b><button class="btn sm" data-action="markPaid" data-id="${s.id}">✓ Bezahlt</button></div>
  </li>`;
}

/* Kundenliste */
const ui = { search: '', filter: 'alle', calMonth: today().slice(0, 7), calView: 'monat', catFilter: [], selDay: today(), payFilter: 'offen' };

views.kunden = (params) => {
  if (params.get('f')) { ui.filter = params.get('f'); history.replaceState(null, '', '#/kunden'); }
  const fuIds = new Set(followUps().map(f => f.c.id));
  const todoIds = new Set(todoCustomers().map(t => t.c.id));
  const unpaidIds = new Set(unpaidSessions().map(s => s.customerId));
  const filters = [
    ['alle', 'Alle', () => true],
    ['nachfassen', '📞 Nachfassen', c => fuIds.has(c.id)],
    ['todo', '✅ Noch zu machen', c => todoIds.has(c.id)],
    ['unbezahlt', '💶 Offene Zahlung', c => unpaidIds.has(c.id)],
    ...Object.entries(CUSTOMER_STATUS).map(([k, v]) => [k, v.label, c => c.status === k]),
  ];
  const active = filters.find(f => f[0] === ui.filter) || filters[0];
  const q = ui.search.toLowerCase();
  const list = sortedCustomers().filter(active[2]).filter(c =>
    !q || [custName(c), c.phone, c.email, c.goal, c.packageName, c.notes].join(' ').toLowerCase().includes(q));

  return `
  <div class="page-head"><h1>Kunden</h1><div class="actions"><button class="btn primary" data-action="newCustomer">+ Neuer Kunde</button></div></div>
  <div class="toolbar"><input class="search" type="search" id="custSearch" placeholder="🔍 Suchen nach Name, Telefon, E-Mail …" value="${esc(ui.search)}"></div>
  <div class="chips" style="margin-bottom:14px">
    ${filters.map(([k, l, fn]) => `<button class="chip ${k === active[0] ? 'on' : ''}" data-action="custFilter" data-f="${k}">${l} <span class="count">${db.customers.filter(fn).length}</span></button>`).join('')}
  </div>
  <section class="card">
    ${list.length ? `<ul class="list">${list.map(c => {
      const st = custStats(c.id);
      const pay = paymentState(st);
      return `<li>
        <span class="avatar sm">${esc(initials(c))}</span>
        <div class="main">
          <div class="title">${custLink(c.id)}</div>
          <div class="sub">
            ${statusBadge(c.status)}
            ${pay ? `<span class="badge ${pay.cls}">${pay.label}${st.unpaid > 0 ? ' ' + money(st.unpaid) : ''}</span>` : ''}
            ${fuIds.has(c.id) ? `<span class="badge warn">📞 ${c.followUpDate ? esc(relDay(c.followUpDate)) : 'nachfassen'}</span>` : ''}
            ${st.next ? `<span class="badge info">📅 ${esc(relDay(st.next.date))}${st.next.time ? ' ' + esc(st.next.time) : ''}</span>` : ''}
          </div>
        </div>
        <div class="side" style="width:140px;flex-direction:column;align-items:stretch;gap:2px">
          ${st.pkg ? `<div class="small muted" style="text-align:right">${st.done} / ${st.pkg} Anwendungen</div>${progressBar(st.progress)}` : `<div class="small muted" style="text-align:right">${st.done} Anwendung${st.done === 1 ? '' : 'en'}</div>`}
        </div>
      </li>`;
    }).join('')}</ul>` : empty(db.customers.length ? 'Keine Kunden für diesen Filter.' : 'Noch keine Kunden angelegt.')}
  </section>`;
};

/* Kundenkarte */
views.kunde = (params, id) => {
  const c = getCustomer(id);
  if (!c) return `<div class="card">${empty('Kunde nicht gefunden. <a href="#/kunden">Zur Kundenliste</a>')}</div>`;
  const st = custStats(c.id);
  const ss = sessionsOf(c.id);
  const appts = apptsOf(c.id);
  const now = `${today()}T00:00`;
  const futureAppts = appts.filter(a => apptKey(a) >= now && a.status === 'geplant');
  const pastAppts = appts.filter(a => !futureAppts.includes(a)).reverse();
  const pay = paymentState(st);
  const overdue = c.followUpDate && c.followUpDate < today();
  const waNum = (c.phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^0/, '49');
  const scores = ss.filter(s => s.status === 'erledigt' && s.progress !== '' && s.progress != null && !isNaN(s.progress)).slice().reverse();

  return `
  <div class="page-head"><a class="btn ghost sm" href="#/kunden">← Kunden</a></div>
  <section class="card">
    <div class="cust-head">
      <div class="avatar">${esc(initials(c))}</div>
      <div class="info">
        <h1>${esc(custName(c))} ${statusBadge(c.status)} ${pay ? `<span class="badge ${pay.cls}">${pay.label}</span>` : ''}</h1>
        <div class="muted">${c.goal ? esc(c.goal) : ''}${c.goal && c.packageName ? ' · ' : ''}${c.packageName ? esc(c.packageName) : ''}</div>
        <div class="contact-row">
          ${c.phone ? `<a class="btn sm" href="tel:${esc(c.phone)}">📞 Anrufen</a>` : ''}
          ${waNum ? `<a class="btn sm" href="https://wa.me/${esc(waNum)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
          ${c.email ? `<a class="btn sm" href="mailto:${esc(c.email)}">✉️ E-Mail</a>` : ''}
        </div>
      </div>
      <div class="chips">
        <select data-change="setStatus" data-id="${c.id}" aria-label="Status ändern" style="width:auto">${Object.entries(CUSTOMER_STATUS).map(([k, v]) => opt(k, v.label, c.status)).join('')}</select>
        <button class="btn" data-action="editCustomer" data-id="${c.id}">Bearbeiten</button>
      </div>
    </div>
  </section>

  ${c.followUpDate || c.status === 'interessent' ? `
  <div class="followup-box ${overdue ? 'overdue' : ''}" style="margin-top:16px">
    <div class="main">
      <b>📞 ${c.followUpDate ? `Nachfassen ${overdue ? '– überfällig seit' : ''} ${esc(fmtDate(c.followUpDate))}` : 'Nachfassen – noch kein Datum festgelegt'}</b>
      ${c.followUpNote ? `<div>${esc(c.followUpNote)}</div>` : ''}
    </div>
    <button class="btn sm primary" data-action="contact" data-id="${c.id}">Nachgefasst / Kontakt notieren</button>
  </div>` : ''}

  <div class="grid grid-2" style="margin-top:16px">
    <section class="card">
      <div class="card-head"><h2>📈 Fortschritt</h2></div>
      <div class="stat-row">
        <div><b>${st.done}${st.pkg ? ` / ${st.pkg}` : ''}</b><span>Anwendungen erledigt</span></div>
        <div><b>${st.open}</b><span>offen</span></div>
        <div><b>${st.last ? esc(fmtDateShort(st.last.date)) : '–'}</b><span>letzte Anwendung</span></div>
        <div><b>${st.next ? esc(fmtDateShort(st.next.date)) : '–'}</b><span>nächster Termin</span></div>
      </div>
      ${st.pkg ? `${progressBar(st.progress, true)}<div class="small muted" style="margin-top:4px">${st.progress}% vom Paket${st.pkg - st.done > 0 ? ` · noch ${st.pkg - st.done} Anwendungen` : ' · abgeschlossen 🎉'}</div>` : ''}
      ${scores.length >= 2 ? `<h3 style="margin-top:14px">Verlauf Befinden (0–10)</h3>${sparkline(scores)}` : ''}
    </section>
    <section class="card">
      <div class="card-head"><h2>💶 Finanzen</h2></div>
      <div class="stat-row">
        <div><b>${money(st.total)}</b><span>gesamt</span></div>
        <div><b style="color:var(--ok)">${money(st.paid)}</b><span>bezahlt</span></div>
        <div><b style="color:${st.unpaid > 0 ? 'var(--danger)' : 'inherit'}">${money(st.unpaid)}</b><span>offen</span></div>
      </div>
      <dl class="kv">
        ${c.phone ? `<dt>Telefon</dt><dd>${esc(c.phone)}</dd>` : ''}
        ${c.email ? `<dt>E-Mail</dt><dd>${esc(c.email)}</dd>` : ''}
        ${c.address ? `<dt>Adresse</dt><dd>${esc(c.address)}</dd>` : ''}
        ${c.birthday ? `<dt>Geburtstag</dt><dd>${esc(fmtDate(c.birthday))}</dd>` : ''}
        ${c.source ? `<dt>Quelle</dt><dd>${esc(c.source)}</dd>` : ''}
        ${c.createdAt ? `<dt>Kunde seit</dt><dd>${esc(fmtDate(c.createdAt))}</dd>` : ''}
      </dl>
    </section>
  </div>

  <section class="card" style="margin-top:16px">
    <div class="card-head"><h2>💆 Anwendungen</h2><button class="btn sm primary" data-action="newSession" data-customer="${c.id}">+ Anwendung</button></div>
    ${ss.length ? `<ul class="list">${ss.map(s => `
      <li>
        <div class="time-box"><b>${esc(fmtDateShort(s.date).slice(0, 5))}</b>${esc(String(s.date || '').slice(0, 4))}</div>
        <div class="main">
          <div class="title"><a href="#" data-action="editSession" data-id="${s.id}">${esc(s.service)}</a>
            ${s.status === 'offen' ? '<span class="badge info">offen</span>' : ''}
            ${s.status === 'erledigt' && s.progress != null && s.progress !== '' ? `<span class="sess-score small">Befinden ${esc(s.progress)}/10</span>` : ''}
          </div>
          ${s.notes ? `<div class="sub notes">${esc(s.notes)}</div>` : ''}
        </div>
        <div class="side">
          ${num(s.price) > 0 ? `<b class="nowrap">${money(s.price)}</b>` : ''}
          ${num(s.price) > 0 && s.status === 'erledigt' ? (s.paid
            ? `<button class="badge ok" style="border:0;cursor:pointer" data-action="togglePaid" data-id="${s.id}" title="Klicken zum Zurücksetzen">bezahlt${s.payMethod ? ' · ' + esc(s.payMethod) : ''}</button>`
            : `<button class="btn sm" data-action="markPaid" data-id="${s.id}">✓ Bezahlt</button>`) : ''}
          ${s.status === 'offen' ? `<button class="btn sm" data-action="sessionDone" data-id="${s.id}">✓ Erledigt</button>` : ''}
        </div>
      </li>`).join('')}</ul>` : empty('Noch keine Anwendungen dokumentiert.')}
  </section>

  <div class="grid grid-2" style="margin-top:16px">
    <section class="card">
      <div class="card-head"><h2>📅 Termine</h2><button class="btn sm primary" data-action="newAppt" data-customer="${c.id}">+ Termin</button></div>
      ${futureAppts.length ? `<ul class="list">${futureAppts.map(apptRow).join('')}</ul>` : empty('Kein Termin geplant.')}
      ${pastAppts.length ? `<details style="margin-top:12px"><summary class="muted small" style="cursor:pointer">Vergangene Termine (${pastAppts.length})</summary><ul class="list" style="margin-top:10px">${pastAppts.map(apptRow).join('')}</ul></details>` : ''}
    </section>
    <section class="card">
      <div class="card-head"><h2>🗒️ Kontaktverlauf &amp; Notizen</h2><button class="btn sm" data-action="contact" data-id="${c.id}">+ Kontakt</button></div>
      ${c.notes ? `<div class="notes" style="margin-bottom:14px;padding:10px;background:var(--surface-2);border-radius:8px">${esc(c.notes)}</div>` : ''}
      ${c.log.length ? c.log.map(l => `<div class="log-entry"><div class="small muted">${esc(fmtDate(l.date))} · ${esc(l.kind)}</div><div class="notes">${esc(l.text)}</div></div>`).join('') : empty('Noch keine Kontakte notiert.')}
    </section>
  </div>`;
};

function sparkline(sessions) {
  const w = 300, h = 70, p = 6;
  const n = sessions.length;
  const pts = sessions.map((s, i) => [p + (n === 1 ? 0 : i * (w - 2 * p) / (n - 1)), h - p - (Number(s.progress) / 10) * (h - 2 * p)]);
  const line = pts.map(pt => pt.map(v => v.toFixed(1)).join(',')).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Verlauf Befinden">
    <line x1="${p}" x2="${w - p}" y1="${h / 2}" y2="${h / 2}" stroke="var(--border)" stroke-dasharray="3 3"/>
    <polyline points="${line}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    ${pts.map((pt, i) => `<circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="3.5" fill="var(--primary)"><title>${esc(fmtDateShort(sessions[i].date))}: ${esc(sessions[i].progress)}/10</title></circle>`).join('')}
  </svg>`;
}

/* Termine */
views.termine = () => {
  const cats = db.settings.categories;
  const catOk = a => !ui.catFilter.length || ui.catFilter.includes(a.category);
  const appts = db.appointments.filter(catOk);
  const [y, m] = ui.calMonth.split('-').map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  let content;
  if (ui.calView === 'monat') {
    const first = new Date(y, m - 1, 1);
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    const byDay = {};
    appts.forEach(a => { (byDay[a.date] = byDay[a.date] || []).push(a); });
    Object.values(byDay).forEach(l => l.sort((a, b) => apptKey(a).localeCompare(apptKey(b))));
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const ds = ymd(d);
      const evs = byDay[ds] || [];
      cells += `<div class="day ${d.getMonth() !== m - 1 ? 'other' : ''} ${ds === today() ? 'today' : ''} ${ds === ui.selDay ? 'sel' : ''}" data-action="selDay" data-day="${ds}">
        <span class="num">${d.getDate()}</span>
        ${evs.slice(0, 3).map(a => `<div class="ev ${['abgesagt', 'nicht_erschienen'].includes(a.status) ? 'cancel' : ''}" style="background:${esc(category(a.category).color)}" title="${esc((a.time || '') + ' ' + (a.title || category(a.category).name) + (a.customerId ? ' – ' + custNameById(a.customerId) : ''))}">${esc(a.time || '')} ${esc(a.customerId ? custNameById(a.customerId) : (a.title || category(a.category).name))}</div>`).join('')}
        ${evs.length > 3 ? `<div class="more">+${evs.length - 3} weitere</div>` : ''}
      </div>`;
      if (i === 34) { const nx = new Date(d); nx.setDate(nx.getDate() + 1); if (nx.getMonth() !== m - 1) break; }
    }
    const dayAppts = appts.filter(a => a.date === ui.selDay).sort((a, b) => apptKey(a).localeCompare(apptKey(b)));
    content = `
      <div class="cal-head">
        <button class="btn sm" data-action="calMove" data-d="-1" aria-label="Vorheriger Monat">‹</button>
        <h2>${esc(monthLabel)}</h2>
        <button class="btn sm" data-action="calMove" data-d="1" aria-label="Nächster Monat">›</button>
        <button class="btn sm ghost" data-action="calToday">Heute</button>
      </div>
      <div class="cal">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => `<div class="dow">${d}</div>`).join('')}${cells}</div>
      <section class="card" style="margin-top:16px">
        <div class="card-head"><h2>${esc(fmtDayLong(ui.selDay))}</h2><button class="btn sm primary" data-action="newAppt" data-date="${ui.selDay}">+ Termin</button></div>
        ${dayAppts.length ? `<ul class="list">${dayAppts.map(apptRow).join('')}</ul>` : empty('Keine Termine an diesem Tag.')}
      </section>`;
  } else {
    const showPast = ui.listPast;
    const t = today();
    const list = appts.filter(a => showPast ? a.date < t : a.date >= t)
      .sort((a, b) => showPast ? apptKey(b).localeCompare(apptKey(a)) : apptKey(a).localeCompare(apptKey(b)));
    const groups = {};
    list.forEach(a => { (groups[a.date] = groups[a.date] || []).push(a); });
    content = `
      <div class="chips" style="margin-bottom:12px">
        <button class="chip ${!showPast ? 'on' : ''}" data-action="listPast" data-v="0">Kommende</button>
        <button class="chip ${showPast ? 'on' : ''}" data-action="listPast" data-v="1">Vergangene</button>
      </div>
      <section class="card">
        ${list.length ? Object.entries(groups).map(([d, l]) => `<div class="day-group-title">${esc(fmtDayLong(d))} <span class="muted small">${esc(relDay(d))}</span></div><ul class="list">${l.map(apptRow).join('')}</ul>`).join('') : empty('Keine Termine.')}
      </section>`;
  }

  // Kategorie-Statistik für den aktuellen Monat
  const monthAppts = db.appointments.filter(a => a.date.startsWith(ui.calMonth) && a.status !== 'abgesagt');
  return `
  <div class="page-head">
    <h1>Termine</h1>
    <div class="actions">
      <div class="seg"><button class="${ui.calView === 'monat' ? 'on' : ''}" data-action="calView" data-v="monat">Monat</button><button class="${ui.calView === 'liste' ? 'on' : ''}" data-action="calView" data-v="liste">Liste</button></div>
      <button class="btn primary" data-action="newAppt" data-date="${ui.calView === 'monat' ? ui.selDay : ''}">+ Termin</button>
    </div>
  </div>
  <div class="chips" style="margin-bottom:14px">
    <button class="chip ${!ui.catFilter.length ? 'on' : ''}" data-action="catFilter" data-id="">Alle Kategorien</button>
    ${cats.map(c => `<button class="chip ${ui.catFilter.includes(c.id) ? 'on' : ''}" data-action="catFilter" data-id="${esc(c.id)}"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)} <span class="count">${monthAppts.filter(a => a.category === c.id).length}</span></button>`).join('')}
  </div>
  ${content}`;
};

/* Zahlungen */
views.zahlungen = () => {
  const all = db.sessions.filter(s => s.status === 'erledigt' && num(s.price) > 0);
  const unpaid = all.filter(s => !s.paid);
  const m = today().slice(0, 7);
  const paidMonth = all.filter(s => s.paid && (s.paidAt || s.date || '').startsWith(m)).reduce((t, s) => t + num(s.price), 0);
  const paidYear = all.filter(s => s.paid && (s.paidAt || s.date || '').startsWith(m.slice(0, 4))).reduce((t, s) => t + num(s.price), 0);
  const list = (ui.payFilter === 'offen' ? unpaid : all.filter(s => s.paid))
    .sort((a, b) => ui.payFilter === 'offen' ? (a.date || '').localeCompare(b.date || '') : (b.paidAt || b.date || '').localeCompare(a.paidAt || a.date || ''));
  const byCust = {};
  unpaid.forEach(s => { byCust[s.customerId] = (byCust[s.customerId] || 0) + num(s.price); });

  return `
  <div class="page-head"><h1>Zahlungen</h1><div class="actions"><button class="btn primary" data-action="newSession">+ Anwendung</button></div></div>
  <div class="grid grid-kpi">
    <div class="card kpi ${unpaid.length ? 'danger' : ''}"><div class="val">${money(unpaid.reduce((t, s) => t + num(s.price), 0))}</div><div class="lbl">offen (${unpaid.length})</div></div>
    <div class="card kpi"><div class="val">${Object.keys(byCust).length}</div><div class="lbl">Kunden mit offenem Betrag</div></div>
    <div class="card kpi"><div class="val">${money(paidMonth)}</div><div class="lbl">eingenommen diesen Monat</div></div>
    <div class="card kpi"><div class="val">${money(paidYear)}</div><div class="lbl">eingenommen dieses Jahr</div></div>
  </div>
  <div class="chips" style="margin-bottom:14px">
    <button class="chip ${ui.payFilter === 'offen' ? 'on' : ''}" data-action="payFilter" data-v="offen">Offen</button>
    <button class="chip ${ui.payFilter === 'bezahlt' ? 'on' : ''}" data-action="payFilter" data-v="bezahlt">Bezahlt</button>
  </div>
  <section class="card">
    ${list.length ? `<ul class="list">${list.map(s => ui.payFilter === 'offen' ? payRow(s) : `<li>
      <div class="main"><div class="title">${custLink(s.customerId)}</div><div class="sub">${esc(s.service)} · ${esc(fmtDateShort(s.date))}${s.payMethod ? ' · ' + esc(s.payMethod) : ''}${s.paidAt ? ' · bezahlt am ' + esc(fmtDateShort(s.paidAt)) : ''}</div></div>
      <div class="side"><b class="nowrap">${money(s.price)}</b><button class="btn sm ghost" data-action="togglePaid" data-id="${s.id}" title="Als unbezahlt markieren">↺</button></div>
    </li>`).join('')}</ul>` : empty(ui.payFilter === 'offen' ? 'Keine offenen Zahlungen. 👍' : 'Noch keine Zahlungen erfasst.')}
  </section>`;
};

/* Einstellungen */
views.einstellungen = () => {
  const s = db.settings;
  return `
  <div class="page-head"><h1>Einstellungen</h1></div>
  <div class="grid grid-2">
    <section class="card">
      <div class="card-head"><h2>Allgemein</h2></div>
      <div class="form-grid">
        ${field('Name der App / deines Business', `<input data-setting="businessName" value="${esc(s.businessName)}">`, 'full')}
        ${field('Standard-Wiedervorlage für Interessenten (Tage)', `<input data-setting="followUpDays" type="number" min="1" value="${esc(s.followUpDays)}">`, 'full')}
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Datensicherung</h2></div>
      <p class="small muted" style="margin-top:0">Deine Daten liegen nur auf diesem Gerät im Browser. Erstelle regelmäßig ein Backup, besonders bevor du Browserdaten löschst oder das Gerät wechselst.
      ${s.lastBackup ? `<br>Letztes Backup: <b>${esc(fmtDate(s.lastBackup))}</b>` : '<br><b style="color:var(--warn)">Noch kein Backup erstellt.</b>'}</p>
      <div class="chips">
        <button class="btn primary" data-action="exportData">⬇️ Backup herunterladen</button>
        <button class="btn" data-action="importData">⬆️ Backup einspielen</button>
        <button class="btn" data-action="exportCsv">Kundenliste als CSV</button>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Termin-Kategorien</h2><button class="btn sm" data-action="addCategory">+ Kategorie</button></div>
      ${s.categories.map(c => `<div class="set-row">
        <input type="color" value="${esc(c.color)}" data-cat="${esc(c.id)}" data-key="color" aria-label="Farbe">
        <input type="text" value="${esc(c.name)}" data-cat="${esc(c.id)}" data-key="name" aria-label="Name">
        <button class="icon-btn" data-action="delCategory" data-id="${esc(c.id)}" title="Löschen">🗑️</button>
      </div>`).join('')}
    </section>
    <section class="card">
      <div class="card-head"><h2>Leistungen / Anwendungsarten</h2><button class="btn sm" data-action="addService">+ Leistung</button></div>
      <div class="small muted" style="margin-bottom:8px">Name · Preis (€) – wird beim Dokumentieren vorgeschlagen.</div>
      ${s.services.map(v => `<div class="set-row">
        <input type="text" value="${esc(v.name)}" data-svc="${esc(v.id)}" data-key="name" aria-label="Name">
        <input type="number" min="0" step="0.5" value="${esc(v.price)}" data-svc="${esc(v.id)}" data-key="price" aria-label="Preis">
        <button class="icon-btn" data-action="delService" data-id="${esc(v.id)}" title="Löschen">🗑️</button>
      </div>`).join('')}
    </section>
    <section class="card">
      <div class="card-head"><h2>Daten</h2></div>
      <p class="small muted" style="margin-top:0">${db.customers.length} Kunden · ${db.sessions.length} Anwendungen · ${db.appointments.length} Termine</p>
      <div class="chips">
        <button class="btn" data-action="loadDemo">Beispieldaten laden</button>
        <button class="btn danger" data-action="wipe">Alle Daten löschen</button>
      </div>
    </section>
  </div>`;
};

/* ---------- Router ---------- */
function render() {
  const hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [pathPart, query = ''] = hash.split('?');
  const [name, id] = pathPart.split('/');
  const view = views[name] || views.dashboard;
  const params = new URLSearchParams(query);
  const scrollY = render._last === hash.split('?')[0] ? window.scrollY : 0;
  const activeEl = document.activeElement;
  const keepSearchFocus = activeEl && activeEl.id === 'custSearch';
  const caret = keepSearchFocus ? activeEl.selectionStart : 0;

  $('#view').innerHTML = view(params, id);
  $$('.sidebar a').forEach(a => a.classList.toggle('active', a.dataset.nav === (name === 'kunde' ? 'kunden' : (views[name] ? name : 'dashboard'))));
  $('#brandName').textContent = db.settings.businessName || 'Assistent';
  document.title = `${db.settings.businessName || 'Assistent'} – Kunden & Termine`;

  if (keepSearchFocus) { const s = $('#custSearch'); s.focus(); s.setSelectionRange(caret, caret); }
  window.scrollTo(0, scrollY);
  render._last = pathPart;
}
window.addEventListener('hashchange', render);

/* ---------- Actions ---------- */
const actions = {
  closeModal,
  newCustomer: () => customerForm(),
  editCustomer: d => customerForm(getCustomer(d.id)),
  newSession: d => sessionForm(null, d.customer ? { customerId: d.customer } : {}),
  editSession: d => sessionForm(db.sessions.find(s => s.id === d.id)),
  newAppt: d => apptForm(null, Object.assign({}, d.customer ? { customerId: d.customer } : {}, d.date ? { date: d.date } : {})),
  editAppt: d => apptForm(db.appointments.find(a => a.id === d.id)),
  contact: d => contactForm(getCustomer(d.id)),
  apptDone: d => {
    const a = db.appointments.find(x => x.id === d.id);
    if (!a) return;
    a.status = 'erledigt';
    save();
    const cat = category(a.category);
    const isTreatment = /anwend|behandl|sitzung|massage|therap|coaching/i.test(cat.name) || a.category === 'anw';
    if (a.customerId && isTreatment && !db.sessions.some(s => s.apptId === a.id)) {
      render();
      const svc = db.settings.services.find(v => v.duration === a.duration) || db.settings.services[0];
      sessionForm(null, { customerId: a.customerId, date: a.date, apptId: a.id, service: svc ? svc.name : (a.title || cat.name), price: svc ? svc.price : '' });
      toast('Termin erledigt – jetzt Anwendung dokumentieren');
    } else {
      toast('Termin erledigt');
      render();
    }
  },
  markPaid: d => {
    const s = db.sessions.find(x => x.id === d.id);
    if (!s) return;
    s.paid = true; s.paidAt = today();
    save(); toast(`${money(s.price)} als bezahlt markiert`); render();
  },
  togglePaid: async d => {
    const s = db.sessions.find(x => x.id === d.id);
    if (!s) return;
    if (s.paid && !await ask('Zahlung zurücksetzen (wieder offen)?')) return;
    s.paid = !s.paid; s.paidAt = s.paid ? today() : '';
    save(); render();
  },
  sessionDone: d => {
    const s = db.sessions.find(x => x.id === d.id);
    if (s) sessionForm(s);
    setTimeout(() => { const f = $('#modalForm'); if (f && f.elements.status) { f.elements.status.value = 'erledigt'; f.elements.date.value = today(); } }, 0);
  },
  custFilter: d => { ui.filter = d.f; render(); },
  selDay: d => { ui.selDay = d.day; if (!d.day.startsWith(ui.calMonth)) ui.calMonth = d.day.slice(0, 7); render(); },
  calMove: d => {
    const [y, m] = ui.calMonth.split('-').map(Number);
    const nd = new Date(y, m - 1 + Number(d.d), 1);
    ui.calMonth = ymd(nd).slice(0, 7);
    render();
  },
  calToday: () => { ui.calMonth = today().slice(0, 7); ui.selDay = today(); render(); },
  calView: d => { ui.calView = d.v; render(); },
  listPast: d => { ui.listPast = d.v === '1'; render(); },
  catFilter: d => {
    if (!d.id) ui.catFilter = [];
    else ui.catFilter = ui.catFilter.includes(d.id) ? ui.catFilter.filter(x => x !== d.id) : [...ui.catFilter, d.id];
    render();
  },
  payFilter: d => { ui.payFilter = d.v; render(); },
  addCategory: () => {
    const colors = ['#e11d48', '#0891b2', '#65a30d', '#c026d3', '#ea580c', '#4f46e5'];
    db.settings.categories.push({ id: uid(), name: 'Neue Kategorie', color: colors[db.settings.categories.length % colors.length] });
    save(); render();
  },
  delCategory: async d => {
    const used = db.appointments.filter(a => a.category === d.id).length;
    if (db.settings.categories.length <= 1) { toast('Mindestens eine Kategorie wird benötigt'); return; }
    if (!await ask(used ? `Diese Kategorie wird von ${used} Termin(en) verwendet. Trotzdem löschen?` : 'Kategorie löschen?')) return;
    db.settings.categories = db.settings.categories.filter(c => c.id !== d.id);
    save(); render();
  },
  addService: () => { db.settings.services.push({ id: uid(), name: 'Neue Leistung', price: 0, duration: 60 }); save(); render(); },
  delService: async d => { if (!await ask('Leistung löschen?')) return; db.settings.services = db.settings.services.filter(v => v.id !== d.id); save(); render(); },
  exportData: () => {
    db.settings.lastBackup = today();
    save();
    download(`assistent-backup-${today()}.json`, JSON.stringify(db, null, 2), 'application/json');
    render();
  },
  exportCsv: () => {
    const cols = ['Vorname', 'Nachname', 'Status', 'Telefon', 'E-Mail', 'Adresse', 'Anliegen', 'Paket', 'Anwendungen erledigt', 'Anwendungen geplant', 'Umsatz', 'Offen', 'Wiedervorlage'];
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = sortedCustomers().map(c => {
      const st = custStats(c.id);
      return [c.firstName, c.lastName, CUSTOMER_STATUS[c.status]?.label, c.phone, c.email, c.address, c.goal, c.packageName, st.done, st.pkg || '', st.total.toFixed(2).replace('.', ','), st.unpaid.toFixed(2).replace('.', ','), c.followUpDate].map(q).join(';');
    });
    download(`kunden-${today()}.csv`, '﻿' + [cols.map(q).join(';'), ...rows].join('\r\n'), 'text/csv');
  },
  importData: () => openModal({
    title: 'Backup einspielen',
    body: `<p class="small muted" style="margin-top:0">Backup-Datei auswählen oder den kopierten Backup-Text einfügen.</p>
      <p><button type="button" class="btn" onclick="document.getElementById('importFile').click()">Datei auswählen …</button></p>
      <textarea id="importText" name="importText" placeholder='{"version":1,"customers":[…]}' style="min-height:160px;font-family:ui-monospace,monospace;font-size:.8rem"></textarea>`,
    submitLabel: 'Einspielen',
    onSubmit: d => {
      if (!d.importText) { toast('Bitte Backup-Text einfügen oder Datei wählen'); return false; }
      closeModal();
      importFromText(d.importText);
      return false;
    },
  }),
  wipe: async () => {
    if (!await ask('Wirklich ALLE Kunden, Anwendungen und Termine löschen? Das kann nicht rückgängig gemacht werden.')) return;
    if (!await ask('Letzte Sicherheitsabfrage: Hast du ein Backup? Jetzt endgültig löschen?')) return;
    const settings = db.settings;
    db = emptyData(); db.settings = settings;
    save(); toast('Alle Daten gelöscht'); location.hash = '#/dashboard'; render();
  },
  loadDemo: async () => {
    if (db.customers.length && !await ask('Beispieldaten zu deinen vorhandenen Daten hinzufügen?')) return;
    addDemoData(); save(); toast('Beispieldaten geladen'); render();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn(el.dataset, el, e);
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'custSearch') { ui.search = t.value; render(); return; }
  if (t.dataset.setting) {
    db.settings[t.dataset.setting] = t.type === 'number' ? (parseInt(t.value, 10) || 1) : t.value;
    save();
    $('#brandName').textContent = db.settings.businessName || 'Assistent';
  }
  if (t.dataset.cat) {
    const c = db.settings.categories.find(x => x.id === t.dataset.cat);
    if (c) { c[t.dataset.key] = t.value; save(); }
  }
  if (t.dataset.svc) {
    const v = db.settings.services.find(x => x.id === t.dataset.svc);
    if (v) { v[t.dataset.key] = t.dataset.key === 'price' ? num(t.value) : t.value; save(); }
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.change === 'setStatus') {
    const c = getCustomer(t.dataset.id);
    if (!c) return;
    c.status = t.value;
    if (c.status === 'interessent' && !c.followUpDate) c.followUpDate = addDays(today(), db.settings.followUpDays || 3);
    save(); toast(`Status: ${CUSTOMER_STATUS[c.status].label}`); render();
  }
});

$('#importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { if ($('#modal').open) closeModal(); importFromText(reader.result); };
  reader.readAsText(file);
});

$('#modal').addEventListener('close', () => { modalState = null; });

const embedded = (() => { try { return window.top !== window.self; } catch { return true; } })();
function download(name, content, type) {
  if (embedded) { showExport(name, content); return; }
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function showExport(name, content) {
  openModal({
    title: name.endsWith('.csv') ? 'Kundenliste (CSV)' : 'Backup',
    body: `<p class="small muted" style="margin-top:0">Downloads sind in dieser Ansicht nicht möglich. Kopiere den Text und speichere ihn z. B. in einer Notiz oder Datei <b>${esc(name)}</b>. Zum Wiederherstellen: Einstellungen → „Backup einspielen“ → Text einfügen.</p>
      <textarea id="exportText" readonly style="min-height:220px;font-family:ui-monospace,monospace;font-size:.8rem">${esc(content.replace(/^\ufeff/, ''))}</textarea>`,
    submitLabel: 'Kopieren',
    onSubmit: () => {
      const ta = $('#exportText');
      navigator.clipboard?.writeText(ta.value).then(() => toast('In die Zwischenablage kopiert'))
        .catch(() => { ta.focus(); ta.select(); toast('Text markiert – jetzt kopieren'); });
      if (!navigator.clipboard) { ta.focus(); ta.select(); toast('Text markiert – jetzt kopieren'); }
      return false;
    },
  });
}

function importFromText(text) {
  return (async () => {
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data.customers)) throw new Error('Keine gültige Backup-Datei');
      if (!await ask(`Backup mit ${data.customers.length} Kunden einspielen? Die aktuellen Daten auf diesem Gerät werden ersetzt.`, 'Einspielen')) return false;
      db = normalize(data);
      save(); toast('Backup eingespielt'); render();
      return true;
    } catch (err) {
      toast('Import fehlgeschlagen: ' + err.message);
      return false;
    }
  })();
}

/* ---------- Demo data ---------- */
function addDemoData() {
  const t = today();
  const C = (firstName, lastName, extra) => { const c = Object.assign({ id: uid(), firstName, lastName, createdAt: addDays(t, -60), log: [] }, extra); db.customers.push(c); return c; };
  const S = (c, daysAgo, extra) => db.sessions.push(Object.assign({ id: uid(), customerId: c.id, date: addDays(t, -daysAgo), service: 'Anwendung 60 Min', price: 80, status: 'erledigt', paid: true, paidAt: addDays(t, -daysAgo), payMethod: 'Bar', notes: '' }, extra));
  const A = (c, inDays, time, category, extra) => db.appointments.push(Object.assign({ id: uid(), customerId: c ? c.id : '', date: addDays(t, inDays), time, duration: 60, category, status: inDays < 0 ? 'erledigt' : 'geplant', title: '', location: 'Praxis', notes: '' }, extra));

  const anna = C('Anna', 'Becker', { status: 'aktiv', phone: '0171 2345678', email: 'anna@example.com', goal: 'Verspannungen Nacken/Schulter', packageName: '10er-Karte', packageSessions: 10, source: 'Empfehlung' });
  [42, 35, 28, 21, 14, 7].forEach((d, i) => S(anna, d, { progress: [3, 4, 4, 6, 7, 8][i], notes: i === 5 ? 'Deutlich lockerer, Schlaf besser. Weiter so.' : '' }));
  A(anna, 0, '10:00', 'anw', { title: '7. Anwendung' });

  const tom = C('Tom', 'Schulz', { status: 'aktiv', phone: '0160 9876543', goal: 'Rückenschmerzen LWS', packageName: '5er-Paket', packageSessions: 5 });
  S(tom, 20, { progress: 4 });
  S(tom, 10, { progress: 5, paid: false, paidAt: '', payMethod: '' });
  S(tom, 3, { progress: 6, paid: false, paidAt: '', payMethod: '', notes: 'Bewegungsübungen für zuhause mitgegeben.' });

  const lisa = C('Lisa', 'Wagner', { status: 'interessent', phone: '0152 1112223', email: 'lisa.w@example.com', goal: 'Interesse an Stressmanagement-Paket', source: 'Instagram', followUpDate: addDays(t, -2), followUpNote: 'Angebot geschickt – nachfragen ob Fragen offen sind' });
  lisa.log.push({ id: uid(), date: addDays(t, -6), kind: 'Anruf', text: 'Erstes Telefonat, Preise besprochen. Angebot per Mail geschickt.' });
  A(lisa, -6, '16:00', 'erst', { title: 'Erstgespräch', status: 'erledigt', duration: 30 });

  const markus = C('Markus', 'Hoffmann', { status: 'interessent', phone: '0176 5554443', goal: 'Gutschein von Partnerin bekommen', followUpDate: addDays(t, 1), followUpNote: 'Rückruf vereinbart' });
  A(markus, 1, '17:30', 'nach', { title: 'Rückruf', duration: 15, location: 'Telefon' });

  const sabine = C('Sabine', 'Krüger', { status: 'aktiv', phone: '0151 3334445', goal: 'Nachsorge nach Knie-OP', packageName: 'Reha-Begleitung', packageSessions: 8 });
  S(sabine, 30, { progress: 2, price: 70, payMethod: 'Überweisung' });
  S(sabine, 16, { progress: 4, price: 70, payMethod: 'Überweisung' });
  S(sabine, 0, { status: 'offen', progress: '', paid: false, paidAt: '', payMethod: '', price: 70, date: addDays(t, 0) });

  const julia = C('Julia', 'Neumann', { status: 'abgeschlossen', email: 'julia@example.com', goal: 'Migräne', packageName: '6er-Paket', packageSessions: 6, followUpDate: addDays(t, 2), followUpNote: 'Nach 4 Wochen nachfragen wie es geht – Auffrischung anbieten?' });
  [80, 70, 60, 50, 40, 30].forEach((d, i) => S(julia, d, { progress: [3, 4, 5, 6, 8, 9][i], payMethod: 'Karte / EC' }));

  A(null, 2, '09:00', 'privat', { title: 'Buchhaltung', location: 'Büro' });
  A(anna, 7, '10:00', 'anw', { title: '8. Anwendung' });
  A(tom, 4, '18:00', 'anw', {});
  A(null, 3, '19:00', 'online', { title: 'Webinar Vorbereitung', location: 'Zoom' });
  A(julia, 9, '11:00', 'beratung', { title: 'Auffrischungsgespräch', duration: 30 });
}

/* ---------- Start ---------- */
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
