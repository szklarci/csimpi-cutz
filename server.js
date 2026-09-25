require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const SCHEDULE_FILE = path.join(ROOT, 'schedule.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BOOKINGS_FILE)) fs.writeFileSync(BOOKINGS_FILE, '[]', 'utf8');
if (!fs.existsSync(SCHEDULE_FILE)) fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(defaultSchedule(), null, 2), 'utf8');

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(ROOT, 'public')));

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const EMAIL_TO = process.env.EMAIL_TO || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'CSIMPI CUTZ <onboarding@resend.dev>';
const adminTokens = new Set();

const services = {
  classic: { name: 'Classic Cut', price: 5000, minutes: 30 },
  fade: { name: 'Skin Fade', price: 6000, minutes: 30 },
  beard: { name: 'Hair + Beard', price: 8000, minutes: 60 },
  premium: { name: 'Premium Cut', price: 10000, minutes: 60 }
};

function defaultSchedule() {
  return {
    monday: { enabled: true, start: '09:00', end: '19:00' },
    tuesday: { enabled: true, start: '09:00', end: '19:00' },
    wednesday: { enabled: true, start: '09:00', end: '19:00' },
    thursday: { enabled: true, start: '09:00', end: '19:00' },
    friday: { enabled: true, start: '09:00', end: '19:00' }
  };
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}
function readBookings() { return readJson(BOOKINGS_FILE, []); }
function readSchedule() { return readJson(SCHEDULE_FILE, defaultSchedule()); }
function weekdayKey(dateKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey || '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d.getDay()];
}
function mins(t) { const [h,m] = t.split(':').map(Number); return h * 60 + m; }
function todayKey() {
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function slotsFor(dateKey, service) {
  const day = weekdayKey(dateKey);
  if (!day || !readSchedule()[day]?.enabled || !service) return [];
  const cfg = readSchedule()[day];
  const start = mins(cfg.start), end = mins(cfg.end), duration = service.minutes;
  const booked = readBookings().filter(b => b.date === dateKey).map(b => ({ start: mins(b.time), end: mins(b.time) + (services[b.service]?.minutes || 30) }));
  const result = [];
  for (let t = start; t + duration <= end; t += 30) {
    const clash = booked.some(b => t < b.end && t + duration > b.start);
    if (!clash) result.push(`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`);
  }
  return result;
}
function escapeHtml(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function requireAdmin(req, res, next) {
  const token = req.get('X-Admin-Token');
  if (!token || !adminTokens.has(token)) return res.status(401).json({ error: 'Nincs jogosultságod.' });
  next();
}
async function sendEmail({ to, subject, html, replyTo }) {
  if (!resend || !to) throw new Error('A Resend vagy a címzett nincs beállítva.');
  const result = await resend.emails.send({ from: EMAIL_FROM, to, subject, html, ...(replyTo ? { replyTo } : {}) });
  if (result.error) throw new Error(result.error.message || 'Resend hiba');
  return result.data;
}
function logMailError(label, err) { console.error(`${label}:`, err?.message || err); }

app.get('/health', (req,res) => res.json({ ok:true, app:'CSIMPI CUTZ' }));
app.get('/api/schedule', (req,res) => res.json(readSchedule()));
app.get('/api/services', (req,res) => res.json(services));
app.get('/api/available', (req,res) => {
  const { date, service } = req.query;
  if (!services[service]) return res.status(400).json({ error:'Érvénytelen szolgáltatás.' });
  const day = weekdayKey(date);
  if (!day) return res.status(400).json({ error:'Érvénytelen dátum.' });
  const schedule = readSchedule()[day];
  if (!schedule?.enabled) return res.json({ date, day, open:false, slots:[] });
  return res.json({ date, day, open:true, slots:slotsFor(date, services[service]) });
});

app.post('/api/book', async (req,res) => {
  try {
    const { name, phone, email, service, date, time, note='' } = req.body || {};
    if (!name || !phone || !email || !service || !date || !time) return res.status(400).json({ error:'Minden kötelező mezőt tölts ki.' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error:'Hibás e-mail cím.' });
    if (!services[service]) return res.status(400).json({ error:'Érvénytelen szolgáltatás.' });
    if (date < todayKey()) return res.status(400).json({ error:'Múltbeli időpontra nem lehet foglalni.' });
    const available = slotsFor(date, services[service]);
    if (!available.includes(time)) return res.status(409).json({ error:'Ez az időpont már nem elérhető. Válassz másikat.' });

    const booking = {
      id: crypto.randomUUID(), name: String(name).trim().slice(0,100), phone: String(phone).trim().slice(0,40),
      email: String(email).trim().slice(0,160), service, serviceName: services[service].name,
      price: services[service].price, minutes: services[service].minutes, date, time,
      note: String(note || '').trim().slice(0,500), createdAt: new Date().toISOString()
    };
    const bookings = readBookings();
    bookings.push(booking);
    writeJson(BOOKINGS_FILE, bookings);

    const customerHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h1 style="letter-spacing:3px">CSIMPI CUTZ</h1><h2>Foglalásod rögzítve ✅</h2><p>Szia ${escapeHtml(booking.name)}!</p><p>Az időpontfoglalásod sikeresen bekerült a rendszerbe.</p><p><b>Szolgáltatás:</b> ${escapeHtml(booking.serviceName)}<br><b>Dátum:</b> ${escapeHtml(booking.date)}<br><b>Időpont:</b> ${escapeHtml(booking.time)}<br><b>Ár:</b> ${booking.price.toLocaleString('hu-HU')} Ft</p><p>Ha változtatni szeretnél, keresd Csimpikét.</p></div>`;
    const barberHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h1>CSIMPI CUTZ – ÚJ FOGLALÁS</h1><p><b>Név:</b> ${escapeHtml(booking.name)}<br><b>Telefon:</b> ${escapeHtml(booking.phone)}<br><b>E-mail:</b> ${escapeHtml(booking.email)}<br><b>Szolgáltatás:</b> ${escapeHtml(booking.serviceName)}<br><b>Dátum:</b> ${escapeHtml(booking.date)}<br><b>Időpont:</b> ${escapeHtml(booking.time)}<br><b>Megjegyzés:</b> ${escapeHtml(booking.note || '-')}</p></div>`;

    sendEmail({to: EMAIL_TO, subject:`Új foglalás – ${booking.date} ${booking.time}`, html:barberHtml, replyTo:booking.email}).catch(e=>logMailError('BARBER EMAIL HIBA',e));
    sendEmail({to: booking.email, subject:'CSIMPI CUTZ – Foglalás visszaigazolás', html:customerHtml}).catch(e=>logMailError('CUSTOMER EMAIL HIBA',e));

    res.json({ success:true, booking:{ id:booking.id, date:booking.date, time:booking.time, service:booking.serviceName } });
  } catch (e) { console.error(e); res.status(500).json({ error:'Szerverhiba. A foglalás nem sikerült.' }); }
});

app.post('/api/admin/login', (req,res) => {
  if (!ADMIN_PASSWORD || req.body?.password !== ADMIN_PASSWORD) return res.status(401).json({ error:'Hibás jelszó.' });
  const token = crypto.randomBytes(32).toString('hex'); adminTokens.add(token);
  res.json({ success:true, token });
});
app.post('/api/admin/logout', requireAdmin, (req,res) => { adminTokens.delete(req.get('X-Admin-Token')); res.json({success:true}); });
app.get('/api/admin/bookings', requireAdmin, (req,res) => {
  const list = readBookings().sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  res.json(list);
});
app.post('/api/admin/schedule', requireAdmin, (req,res) => {
  const input = req.body || {}; const days = ['monday','tuesday','wednesday','thursday','friday']; const out={};
  for (const d of days) {
    const x=input[d]||{}; const start=/^\d\d:\d\d$/.test(x.start)?x.start:'09:00'; const end=/^\d\d:\d\d$/.test(x.end)?x.end:'19:00';
    out[d]={enabled:Boolean(x.enabled),start,end};
  }
  writeJson(SCHEDULE_FILE,out); res.json({success:true,schedule:out});
});
app.delete('/api/admin/bookings/:id', requireAdmin, async (req,res) => {
  const bookings=readBookings(); const booking=bookings.find(b=>b.id===req.params.id);
  if(!booking) return res.status(404).json({error:'A foglalás nem található.'});
  writeJson(BOOKINGS_FILE, bookings.filter(b=>b.id!==booking.id));
  const html=`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h1>CSIMPI CUTZ</h1><h2>Időpont törölve</h2><p>Szia ${escapeHtml(booking.name)}!</p><p>Sajnos a következő foglalásodat törölni kellett:</p><p><b>Szolgáltatás:</b> ${escapeHtml(booking.serviceName)}<br><b>Dátum:</b> ${escapeHtml(booking.date)}<br><b>Időpont:</b> ${escapeHtml(booking.time)}</p><p>Kérlek, válassz egy új időpontot a foglalási oldalon.</p></div>`;
  sendEmail({to:booking.email,subject:'CSIMPI CUTZ – Időpont törölve',html}).catch(e=>logMailError('CANCELLATION EMAIL HIBA',e));
  res.json({success:true});
});

app.get('*',(req,res)=>res.sendFile(path.join(ROOT,'public','index.html')));
app.listen(PORT, '0.0.0.0', ()=>console.log(`CSIMPI CUTZ online | port ${PORT}`));
