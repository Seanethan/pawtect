// ===== MAP (Leaflet + OpenStreetMap: free, no API key) =====
const DEFAULT_CENTER = [14.7062, 121.0296];
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

let map;
let markerData = [];
let userMarker = null;
let accuracyCircle = null;
let mapFilter = 'all';

const PIN_ICONS = { shelter: 'fa-house-chimney', clinic: 'fa-briefcase-medical', reported: 'fa-paw', report: 'fa-paw' };

function pinIcon(type) {
  const colors = { shelter: '#6E3419', clinic: '#5B8E4A', reported: '#E35336', report: '#E35336' };
  const bg = colors[type] || '#E35336';
  return L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${bg};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;"><i class="fa-solid ${PIN_ICONS[type]||'fa-paw'}" style="transform:rotate(45deg);color:#fff;font-size:12px;"></i></div>`,
    iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -34]
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showUserLocation(lat, lng, accuracy, recenter) {
  const pos = [lat, lng];
  if (!userMarker) {
    userMarker = L.marker(pos, {
      icon: L.divIcon({ className:'', html:'<div style="width:16px;height:16px;border-radius:50%;background:#2F80ED;border:3px solid #fff;box-shadow:0 0 0 0 rgba(47,128,237,.6);animation:userPulse 2s infinite;"></div>', iconSize:[16,16], iconAnchor:[8,8] }),
      zIndexOffset: 1000
    }).addTo(map).bindPopup('You are here');
    accuracyCircle = L.circle(pos, { radius: accuracy||50, color:'#2F80ED', weight:1, fillOpacity:0.08 }).addTo(map);
  } else {
    userMarker.setLatLng(pos);
    accuracyCircle.setLatLng(pos).setRadius(accuracy||50);
  }
  if (recenter) map.setView(pos, 15);
}

function locateUser(showError) {
  if (!navigator.geolocation) { if(showError) alert('Your browser does not support GPS.'); return; }
  navigator.geolocation.getCurrentPosition(
    p => showUserLocation(p.coords.latitude, p.coords.longitude, p.coords.accuracy, true),
    () => { if(showError) alert('Could not get your location. Allow location access in your browser.'); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

function initMap() {
  const el = document.getElementById('leafletMap');
  if (!el) return;
  map = L.map(el).setView(DEFAULT_CENTER, 14);
  L.tileLayer(OSM_TILES, { maxZoom:19, attribution: OSM_ATTR }).addTo(map);

  const LocateControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const btn = L.DomUtil.create('button','');
      btn.type='button'; btn.title='Show my location';
      btn.style.cssText='background:#fff;width:34px;height:34px;border:2px solid rgba(0,0,0,.2);border-radius:4px;cursor:pointer;font-size:16px;color:#6E3419;';
      btn.innerHTML='<i class="fa-solid fa-location-crosshairs"></i>';
      L.DomEvent.disableClickPropagation(btn);
      btn.onclick = () => locateUser(true);
      return btn;
    }
  });
  map.addControl(new LocateControl());

  const locations = [
    { title:'Supremo Furbabies Shelter', lat:14.7080, lng:121.0260, type:'shelter', info:'Open today 9:00 am - 5:00 pm' },
    { title:'St. Jude Veterinary Clinic', lat:14.7020, lng:121.0340, type:'clinic', info:'Open 24/7' },
    { title:'Case #6969 - Injured Dog', lat:14.7040, lng:121.0230, type:'reported', info:'Rescue Assigned' }
  ];
  locations.forEach(loc => {
    const marker = L.marker([loc.lat, loc.lng], { icon: pinIcon(loc.type) })
      .bindPopup(`<div style="color:#6E3419;font-family:'Plus Jakarta Sans',sans-serif;"><strong>${escapeHtml(loc.title)}</strong><br><span>${escapeHtml(loc.info)}</span></div>`)
      .addTo(map);
    markerData.push({ marker, type:loc.type, title:loc.title.toLowerCase() });
  });
  getReports().then(rs => rs.filter(r => r.lat != null && r.lng != null).forEach(addReportPin)).catch(() => {});
  locateUser(false);
}

function applyMapFilters() {
  if (!map) return;
  const q = (document.getElementById('mapSearchInput')||{}).value||'';
  const query = q.toLowerCase();
  markerData.forEach(item => {
    const show = (mapFilter==='all'||item.type===mapFilter) && item.title.includes(query);
    if (show) item.marker.addTo(map); else map.removeLayer(item.marker);
  });
}
function setMapFilter(category, buttonEl) {
  document.querySelectorAll('.pill-filter').forEach(b=>b.classList.remove('active-pill'));
  buttonEl.classList.add('active-pill');
  mapFilter = category;
  applyMapFilters();
}
function filterMapPins() { applyMapFilters(); }

// ===== REPORT MAP =====
let reportMap, reportMarker;
function initReportMap() {
  const el = document.getElementById('reportMap');
  if (!el) return;
  reportMap = L.map(el).setView(DEFAULT_CENTER, 15);
  L.tileLayer(OSM_TILES, { maxZoom:19, attribution: OSM_ATTR }).addTo(reportMap);
  reportMap.on('click', e => setReportPin(e.latlng.lat, e.latlng.lng, true));
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      p => reportMap.setView([p.coords.latitude, p.coords.longitude], 16),
      ()=>{}, { timeout:8000 }
    );
  }
}
function setReportPin(lat, lng, reverseGeocode) {
  if (!reportMarker) {
    reportMarker = L.marker([lat,lng],{draggable:true,icon:pinIcon('report')}).addTo(reportMap);
    reportMarker.on('dragend',()=>{ const p=reportMarker.getLatLng(); setReportPin(p.lat,p.lng,true); });
  } else { reportMarker.setLatLng([lat,lng]); }
  const latEl=document.getElementById('reportLat'), lngEl=document.getElementById('reportLng');
  if(latEl) latEl.value=lat;
  if(lngEl) lngEl.value=lng;
  const status=document.getElementById('pinStatus');
  if(status) status.textContent=`Pinned at ${lat.toFixed(5)}, ${lng.toFixed(5)}. Drag the pin to adjust.`;
  if(reverseGeocode) reverseGeocodeToInput(lat,lng);
}
let _geoT;
function reverseGeocodeToInput(lat,lng){ clearTimeout(_geoT); _geoT=setTimeout(()=>_reverseGeocode(lat,lng),900); }  // respect Nominatim rate limits
async function _reverseGeocode(lat,lng) {
  const input=document.getElementById('locationInput');
  if(!input) return;
  try {
    const res=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
    const data=await res.json();
    if(data&&data.display_name) { input.value=data.display_name; return; }
  } catch(e) {}
  if(!input.value) input.value=`${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
function useMyLocation() {
  if(!navigator.geolocation){alert('GPS not supported.');return;}
  navigator.geolocation.getCurrentPosition(
    p => { reportMap.setView([p.coords.latitude,p.coords.longitude],17); setReportPin(p.coords.latitude,p.coords.longitude,true); },
    ()=>alert('Could not get location. Allow access or tap the map.'),
    {enableHighAccuracy:true,timeout:10000}
  );
}

// ===== PROFILE =====
const defaultProfile = {
  fullName:'Rene Buttercoconut', location:'Quezon City',
  email:'renebuttercoconut@gmail.com', contact:'0967 676 6767',
  note:'\u201cMAMAAAAAAAAAAAA\u201d'
};

function toggleEditField(field) {
  const g=document.getElementById(`edit${field}Group`);
  if(g) g.classList.toggle('hidden');
}

function setAmount(val){const e=document.getElementById('donationAmount');if(e)e.value=val;}
function handleFileSelect(event){const f=event.target.files[0];if(f){const e=document.getElementById('filePreview');if(e)e.textContent=`Attached: ${f.name}`;}}
function handleDonationSubmit(event){event.preventDefault();alert('Thank you for your donation!');event.target.reset();const e=document.getElementById('filePreview');if(e)e.textContent='';}

// ===== MOBILE NAV TOGGLE =====
function toggleMobileNav() {
  const nav = document.getElementById('mobileNav');
  if (nav) nav.classList.toggle('hidden');
}

document.addEventListener('DOMContentLoaded', ()=>{
  loadProfileState();
  initMap();
  initReportMap();
  // Add Leaflet pulse keyframe
  if(!document.getElementById('leaflet-pulse-style')){
    const s=document.createElement('style');
    s.id='leaflet-pulse-style';
    s.textContent='@keyframes userPulse{70%{box-shadow:0 0 0 14px rgba(47,128,237,0);}100%{box-shadow:0 0 0 0 rgba(47,128,237,0);}}';
    document.head.appendChild(s);
  }
});
// =====================================================================
// API LAYER  (PawTect backend: /api/auth/*, /api/reports/*)
// Set window.PAWTECT_API_BASE before this script to point at another host.
// Without a login token the site runs in local demo mode (localStorage).
// =====================================================================
const API_BASE = `${window.PAWTECT_API_BASE || location.origin}/api`;
const TOKEN_KEY = 'pawtect_token', USER_KEY = 'pawtect_user', LOCAL_REPORTS = 'pawtect_reports';
const getToken = () => localStorage.getItem(TOKEN_KEY);
function getCurrentUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } }

async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}
function logout() {
  localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
  location.href = 'login.html';
}

const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
const statusLabel = s => cap(String(s || '').replace(/_/g, ' '));
const displayDate = v => v ? new Date(v).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : 'Date unavailable';
const esc = escapeHtml;

// ---------- Auth ----------
async function handleLogin(e) {
  e.preventDefault();
  const f = e.currentTarget, msg = document.getElementById('authMessage');
  try {
    const r = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email: f.email.value.trim(), password: f.password.value }) });
    localStorage.setItem(TOKEN_KEY, r.token); localStorage.setItem(USER_KEY, JSON.stringify(r.user));
    const next = new URLSearchParams(location.search).get('next');
    location.href = /^[\w-]+\.html$/.test(next || '') ? next : 'index.html';   // only same-site pages
  } catch (err) { msg.textContent = err.message; }
}
async function handleRegister(e) {
  e.preventDefault();
  const f = e.currentTarget, d = Object.fromEntries(new FormData(f).entries()), msg = document.getElementById('authMessage');
  try {
    const r = await apiRequest('/auth/register', { method: 'POST', body: JSON.stringify({
      firstName: d.firstName, lastName: d.lastName, username: d.username, email: d.email,
      password: d.password, contactNumber: d.contactNumber, birthday: d.birthday || null }) });
    let text = r.message || 'Account created. Check your email to verify it.';
    if (r.developmentVerificationToken) {
      const token = prompt('Development email verification token:', r.developmentVerificationToken);
      if (token) { await apiRequest('/auth/verify-email', { method: 'POST', body: JSON.stringify({ userId: r.userId, token }) }); text = 'Email verified. You can now log in.'; }
    }
    msg.textContent = text; f.reset();
  } catch (err) { msg.textContent = err.message; }
}

// ---------- Reports (API when logged in, localStorage otherwise) ----------
const IN_PROGRESS = ['accepted', 'en_route', 'arrived'];
const STAGES = ['reported', 'accepted', 'en_route', 'arrived', 'rescued'];
const STAGE_LABELS = ['Reported', 'Accepted', 'En route', 'Arrived', 'Rescued'];

function normalize(r) {
  if (r.report_id !== undefined) return {
    id: r.report_id, type: r.animal_type, condition: r.condition, urgency: r.urgency, status: r.status,
    address: r.location_address, date: r.created_at, desc: r.animal_description, by: r.reporter_name,
    lat: r.latitude == null ? null : +r.latitude, lng: r.longitude == null ? null : +r.longitude };
  return {
    id: r.id || 'L' + Date.parse(r.date), type: (r.animal || '').toLowerCase(), condition: (r.condition || '').toLowerCase(),
    urgency: (r.urgency || '').toLowerCase(), status: 'reported', address: r.address, date: r.date,
    desc: r.description, by: 'You', lat: r.lat, lng: r.lng };
}
const localReports = () => JSON.parse(localStorage.getItem(LOCAL_REPORTS) || '[]').map(normalize);
async function getReports() {
  if (!getToken()) return localReports();
  const { reports } = await apiRequest('/reports');
  return reports.map(normalize);
}

async function handleReportSubmit(e) {
  e.preventDefault();
  const f = e.target, v = n => (f.elements[n]?.value || '').trim();
  const lat = parseFloat(document.getElementById('reportLat').value), lng = parseFloat(document.getElementById('reportLng').value);
  if (isNaN(lat) || isNaN(lng)) return alert('Please pin the location on the map or tap "Use my location".');
  const rep = { animal: v('animal'), condition: v('condition'), urgency: v('urgency'), description: v('description'), address: v('locationInput'), lat, lng };
  const btn = f.querySelector('[type=submit]'); btn.disabled = true;
  try {
    if (getToken()) {
      const r = await apiRequest('/reports', { method: 'POST', body: JSON.stringify({
        animalType: rep.animal.toLowerCase(), animalDescription: rep.description, condition: rep.condition.toLowerCase(),
        urgency: rep.urgency.toLowerCase(), locationAddress: rep.address, latitude: lat, longitude: lng }) });
      alert(`Report submitted. Report ID: ${r.reportId}`);
    } else {
      const all = JSON.parse(localStorage.getItem(LOCAL_REPORTS) || '[]');
      all.push({ ...rep, id: 'L' + Date.now(), date: new Date().toISOString() });
      localStorage.setItem(LOCAL_REPORTS, JSON.stringify(all));
      alert('Report saved on this device. Log in to send reports to the rescue team.');
    }
    location.href = 'rescue-cases.html';
  } catch (err) { alert(err.message); btn.disabled = false; }
}

function handlePhotoSelect(e) {
  const slots = document.querySelectorAll('.photo-slot');
  slots.forEach(s => s.innerHTML = '');
  [...e.target.files].slice(0, slots.length).forEach((file, i) => {
    if (file.size > 5 * 1024 * 1024) return alert(`${file.name} is over 5 MB.`);
    const img = new Image(); img.alt = 'Selected photo'; img.className = 'w-full h-full object-cover';
    img.src = URL.createObjectURL(file); slots[i].appendChild(img);
  });
}

// ---------- Rescue cases list ----------
function caseItem(c) {
  const cats = `${c.type} ${c.urgency} ${IN_PROGRESS.includes(c.status) ? 'progress' : ''}`;
  return `<div class="case-list-item border border-bdr rounded-xl p-3 sm:p-4 flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 bg-cream" data-category="${esc(cats)}" data-date="${esc(c.date)}" data-urgency="${esc(c.urgency)}">
    <div class="w-14 h-14 sm:w-16 sm:h-16 shrink-0 bg-[#E0DDD0] rounded-lg flex items-center justify-center text-2xl sm:text-3xl text-gray-400"><i class="fa-solid ${c.type === 'cat' ? 'fa-cat' : 'fa-dog'}"></i></div>
    <div class="flex-1 min-w-0"><span class="block font-extrabold text-sm mb-1">Report #${esc(c.id)}</span>
      <div class="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
        <span class="flex items-center gap-1"><i class="fa-solid fa-paw w-3"></i>${esc(cap(c.type))} <span class="text-gray-400">${esc(cap(c.condition))}</span></span>
        <span class="flex items-center gap-1"><i class="fa-solid fa-location-dot w-3"></i>${esc(c.address || 'Pinned location')}</span>
        <span class="flex items-center gap-1"><i class="fa-solid fa-calendar-days w-3"></i>${esc(displayDate(c.date))}</span></div></div>
    <div class="flex flex-col items-end gap-2 shrink-0 ml-auto">
      <div class="flex gap-1"><span class="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">${esc(cap(c.type))}</span><span class="bg-rose-200 text-rose-900 text-xs font-bold px-2 py-0.5 rounded-full">${esc(cap(c.urgency))}</span></div>
      <a href="case-overview.html?id=${encodeURIComponent(c.id)}" class="flex items-center gap-1 bg-coral text-white text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap">View Details <i class="fa-solid fa-chevron-right text-xs"></i></a></div></div>`;
}
async function loadRescueCases() {
  const list = document.getElementById('casesList'); if (!list) return;
  let items, note = '';
  try { items = await getReports(); } catch (err) { note = `<p class="text-sm text-coral">${esc(err.message)}. Showing data saved on this device.</p>`; items = localReports(); }
  const html = items.map(caseItem).join('');
  if (getToken()) list.innerHTML = note + (html || '<p class="text-sm text-gray-500">No reports yet.</p>');
  else list.insertAdjacentHTML('afterbegin', html);   // demo card stays below your own reports
  filterRescueCases();
}

let caseCat = 'all';
function filterCategory(cat, btn) {
  document.querySelectorAll('.pill-cat').forEach(b => b.classList.remove('active-pill-cat'));
  btn?.classList.add('active-pill-cat'); caseCat = cat; filterRescueCases();
}
function filterRescueCases() {
  const list = document.getElementById('casesList'); if (!list) return;
  const q = (document.getElementById('caseSearchInput')?.value || '').toLowerCase(), sort = document.getElementById('sortBySelect')?.value;
  const t = el => Date.parse(el.dataset.date) || 0, u = el => el.dataset.urgency === 'urgent' ? 1 : 0;
  [...list.querySelectorAll('.case-list-item')]
    .sort((a, b) => sort === 'oldest' ? t(a) - t(b) : sort === 'urgent' ? u(b) - u(a) || t(b) - t(a) : t(b) - t(a))
    .forEach(el => {
      const ok = el.textContent.toLowerCase().includes(q) && (caseCat === 'all' || (el.dataset.category || '').includes(caseCat));
      el.style.display = ok ? 'flex' : 'none'; list.appendChild(el);
    });
}

// ---------- Home: active cases ----------
const homeCard = c => `<div class="bg-cream-card border border-bdr rounded-xl p-4 flex gap-4 cursor-pointer hover:shadow-md transition" onclick="location.href='case-overview.html?id=${encodeURIComponent(c.id)}'">
  <div class="w-20 h-20 shrink-0 bg-[#E0DDD0] rounded-lg flex items-center justify-center text-3xl text-gray-400"><i class="fa-solid ${c.type === 'cat' ? 'fa-cat' : 'fa-dog'}"></i></div>
  <div class="flex-1 min-w-0"><div class="flex items-center justify-between gap-2 mb-2 flex-wrap"><h4 class="font-extrabold">Report #${esc(c.id)}</h4><span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">${esc(statusLabel(c.status))}</span></div>
  <ul class="text-xs text-gray-500 space-y-1"><li><i class="fa-solid fa-paw w-3"></i> ${esc(cap(c.type))} &bull; ${esc(cap(c.condition))}</li><li><i class="fa-solid fa-location-dot w-3"></i> ${esc(c.address || 'Pinned location')}</li><li><i class="fa-solid fa-calendar-days w-3"></i> ${esc(displayDate(c.date))}</li></ul></div></div>`;
async function loadHomeCases() {
  const grid = document.getElementById('homeCases'); if (!grid) return;
  try {
    const items = (await getReports()).filter(r => !/^(rescued|brought_|rejected)/.test(r.status)).slice(0, 4);
    if (getToken()) grid.innerHTML = items.map(homeCard).join('') || '<p class="text-sm text-gray-500 sm:col-span-2">No active cases yet. <a class="text-coral font-bold" href="submit-report.html">Report a stray</a></p>';
    else grid.insertAdjacentHTML('afterbegin', items.map(homeCard).join(''));
  } catch (err) { console.warn(err.message); }
}

// ---------- Case overview (?id=...) ----------
function renderStepper(idx) {
  const box = document.getElementById('stepper'); if (!box) return;
  box.innerHTML = STAGE_LABELS.map((label, i) => {
    const node = i < idx ? 'bg-peach text-white' : i === idx ? 'border-2 border-coral text-coral bg-white' : 'border-2 border-bdr text-brown-dark bg-white';
    return `<div class="step-wrap ${i <= idx ? 'done' : ''} flex flex-col items-center text-center w-1/5 relative z-10">
      <div class="w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-sm mb-1 ${node}">${i < idx ? '<i class="fa-solid fa-check text-xs"></i>' : i + 1}</div>
      <span class="text-xs font-bold leading-tight">${label}</span></div>`;
  }).join('');
}
async function loadReportDetails() {
  if (!document.getElementById('stepper')) return;
  const id = new URLSearchParams(location.search).get('id'); let c = null;
  try {
    if (id && getToken() && /^\d+$/.test(id)) c = normalize((await apiRequest(`/reports/${id}`)).report);
    else if (id) c = localReports().find(r => String(r.id) === id) || null;
  } catch (err) { console.warn(err.message); }
  if (c) {
    const set = (k, val) => { const el = document.getElementById(k); if (el) el.textContent = val; };
    set('caseTitle', `Report #${c.id}`); set('caseStatus', statusLabel(c.status)); set('caseUrgency', cap(c.urgency));
    set('caseLoc', c.address || 'Pinned location'); set('caseDate', `Reported on ${displayDate(c.date)}`);
    set('dType', cap(c.type)); set('dCondition', cap(c.condition)); set('dLoc', c.address || '--');
    set('dDate', displayDate(c.date)); set('dBy', c.by || '--'); set('dDesc', c.desc || 'No description provided.');
  }
  renderStepper(c ? (c.status.startsWith('brought') ? 4 : Math.max(0, STAGES.indexOf(c.status))) : 0);
}

// ---------- Map: report pins ----------
function addReportPin(r) {
  const m = L.marker([r.lat, r.lng], { icon: pinIcon('reported') }).addTo(map)
    .bindPopup(`<div style="color:#6E3419"><strong>${esc(cap(r.type))} - ${esc(cap(r.condition))}</strong><br>${esc(statusLabel(r.status))} - ${esc(r.address || 'Pinned location')}</div>`);
  markerData.push({ marker: m, type: 'reported', title: `${r.type} ${r.condition} ${r.address || ''}`.toLowerCase() });
}

// ---------- Profile ----------
async function loadProfileState() {
  let p = JSON.parse(localStorage.getItem('pawtect_user_profile') || 'null') || { ...defaultProfile };
  if (getToken()) {
    try {
      const { user } = await apiRequest('/auth/me'); localStorage.setItem(USER_KEY, JSON.stringify(user));
      p = { ...p, fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(), email: user.email, contact: user.contact_number || '', location: user.address || p.location };
    } catch (err) { console.warn(err.message); }
  }
  const T = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const I = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  const note = (p.note || '').replace(/[\u201c\u201d]/g, '');
  T('displayFullName', p.fullName); T('valFullName', p.fullName); I('inputFullName', p.fullName);
  T('displayLocation', p.location); T('valLocation', p.location); I('inputLocation', p.location);
  T('valEmail', p.email); I('inputEmail', p.email); T('valContact', p.contact); I('inputContact', p.contact);
  T('displayNote', `\u201c${note}\u201d`); I('inputNote', note); T('navUserName', p.fullName);
  paintAvatar();
}
async function saveProfileField(field) {
  const input = document.getElementById(`input${field}`); if (!input) return;
  const v = input.value.trim();
  if (field === 'Password') return alert(v.length < 8 ? 'Use at least 8 characters.' : 'Password changes are not connected to the server yet.');
  if (!v && field !== 'Note') return alert('This field cannot be empty.');
  if (getToken() && (field === 'Email' || field === 'Location')) return alert(`${field} can't be changed through the server yet.`);
  const p = JSON.parse(localStorage.getItem('pawtect_user_profile') || 'null') || { ...defaultProfile };
  p[{ FullName: 'fullName', Location: 'location', Email: 'email', Contact: 'contact', Note: 'note' }[field]] = v;
  if (getToken() && (field === 'FullName' || field === 'Contact')) {
    try {
      const [first, ...rest] = v.split(/\s+/);
      await apiRequest('/auth/me', { method: 'PATCH', body: JSON.stringify(field === 'FullName' ? { firstName: first, lastName: rest.join(' ') } : { contactNumber: v }) });
    } catch (err) { return alert(err.message); }
  }
  localStorage.setItem('pawtect_user_profile', JSON.stringify(p));
  await loadProfileState(); toggleEditField(field);
}
function triggerAvatarUpload() { document.getElementById('avatarInput')?.click(); }
function handleAvatar(e) {
  const file = e.target.files[0];
  if (!file || file.size > 2 * 1024 * 1024) return alert('Choose an image under 2 MB.');
  const r = new FileReader(); r.onload = () => { localStorage.setItem('pawtect_avatar', r.result); paintAvatar(); }; r.readAsDataURL(file);
}
function paintAvatar() {
  const el = document.getElementById('avatarCircle'), a = localStorage.getItem('pawtect_avatar');
  if (el && a) { el.style.background = `url("${a}") center/cover`; el.innerHTML = ''; }
}

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', () => {
  loadRescueCases(); loadHomeCases(); loadReportDetails(); paintAvatar();
  document.querySelectorAll('header nav').forEach(nav => {   // Log in / Log out link in every navbar
    const a = document.createElement('a'), mobile = nav.id === 'mobileNav';
    a.className = mobile ? 'flex items-center gap-3 px-4 py-3 text-white font-bold hover:bg-white/10 rounded-lg'
                         : 'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold text-white hover:bg-white/10 transition-colors';
    if (getToken()) { a.href = '#'; a.onclick = ev => { ev.preventDefault(); logout(); }; a.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i><span>Log out</span>'; }
    else { a.href = 'login.html'; a.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i><span>Log in</span>'; }
    nav.appendChild(a);
  });
});
