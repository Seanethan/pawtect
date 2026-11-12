// ===== MAP (Leaflet + OpenStreetMap: free, no API key) =====
const DEFAULT_CENTER = [14.7011, 120.9830];
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
    { title:'Supremo Furbabies Shelter', lat:14.7050, lng:120.9800, type:'shelter', info:'Open today 9:00 am - 5:00 pm' },
    { title:'St. Jude Veterinary Clinic', lat:14.6980, lng:120.9890, type:'clinic', info:'Open 24/7' },
    { title:'Case #6969 - Injured Dog', lat:14.7020, lng:120.9750, type:'reported', info:'Rescue Assigned' }
  ];
  JSON.parse(localStorage.getItem('pawtect_reports')||'[]').forEach(r => locations.push({
    title:`${r.animal} - ${r.condition}`, lat:r.lat, lng:r.lng, type:'reported', info:`Pending - ${r.address||'Pinned location'}`
  }));
  locations.forEach(loc => {
    const marker = L.marker([loc.lat, loc.lng], { icon: pinIcon(loc.type) })
      .bindPopup(`<div style="color:#6E3419;font-family:'Plus Jakarta Sans',sans-serif;"><strong>${escapeHtml(loc.title)}</strong><br><span>${escapeHtml(loc.info)}</span></div>`)
      .addTo(map);
    markerData.push({ marker, type:loc.type, title:loc.title.toLowerCase() });
  });
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
async function reverseGeocodeToInput(lat,lng) {
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
function loadProfileState() {
  const profile=JSON.parse(localStorage.getItem('pawtect_user_profile'))||defaultProfile;
  const setEl=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  const setIn=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v;};
  setEl('displayFullName',profile.fullName); setEl('valFullName',profile.fullName); setIn('inputFullName',profile.fullName);
  setEl('displayLocation',profile.location); setEl('valLocation',profile.location); setIn('inputLocation',profile.location);
  setEl('valEmail',profile.email); setIn('inputEmail',profile.email);
  setEl('valContact',profile.contact); setIn('inputContact',profile.contact);
  setEl('displayNote',profile.note.startsWith('\u201c')?profile.note:`\u201c${profile.note}\u201d`);
  setIn('inputNote',profile.note.replace(/[\u201c\u201d]/g,''));
  setEl('navUserName',profile.fullName);
}
function toggleEditField(field) {
  const g=document.getElementById(`edit${field}Group`);
  if(g) g.classList.toggle('hidden');
}
function saveProfileField(field) {
  const profile=JSON.parse(localStorage.getItem('pawtect_user_profile'))||defaultProfile;
  const inputEl=document.getElementById(`input${field}`);
  if(inputEl){
    const v=inputEl.value.trim();
    if(field==='FullName') profile.fullName=v;
    if(field==='Location') profile.location=v;
    if(field==='Email') profile.email=v;
    if(field==='Contact') profile.contact=v;
    if(field==='Note') profile.note=v;
    if(field==='Password'){alert('Password updated!');toggleEditField('Password');return;}
    localStorage.setItem('pawtect_user_profile',JSON.stringify(profile));
    loadProfileState(); toggleEditField(field);
  }
}
function triggerAvatarUpload(){alert('Select a new profile photo to upload...');}
function setAmount(val){const e=document.getElementById('donationAmount');if(e)e.value=val;}
function handleFileSelect(event){const f=event.target.files[0];if(f){const e=document.getElementById('filePreview');if(e)e.textContent=`Attached: ${f.name}`;}}
function handleDonationSubmit(event){event.preventDefault();alert('Thank you for your donation!');event.target.reset();const e=document.getElementById('filePreview');if(e)e.textContent='';}
function handleReportSubmit(event) {
  event.preventDefault();
  const latEl=document.getElementById('reportLat');
  if(latEl){
    const lat=parseFloat(latEl.value), lng=parseFloat(document.getElementById('reportLng').value);
    if(isNaN(lat)||isNaN(lng)){alert('Please pin the location on the map or tap "Use my location".');return;}
    const selects=event.target.querySelectorAll('select');
    const reports=JSON.parse(localStorage.getItem('pawtect_reports')||'[]');
    reports.push({animal:selects[0].value,condition:selects[1].value,urgency:selects[2].value,address:document.getElementById('locationInput').value,lat,lng,date:new Date().toISOString()});
    localStorage.setItem('pawtect_reports',JSON.stringify(reports));
  }
  alert('Stray report submitted! Case pending review.');
  window.location.href='rescue-cases.html';
}
function filterCategory(category,buttonEl) {
  document.querySelectorAll('.pill-cat').forEach(b=>b.classList.remove('active-pill-cat'));
  buttonEl.classList.add('active-pill-cat');
  document.querySelectorAll('.case-list-item').forEach(item=>{
    const cats=item.getAttribute('data-category');
    item.style.display=(category==='all'||cats.includes(category))?'flex':'none';
  });
}
function filterRescueCases() {
  const q=document.getElementById('caseSearchInput').value.toLowerCase();
  document.querySelectorAll('.case-list-item').forEach(item=>{
    item.style.display=item.textContent.toLowerCase().includes(q)?'flex':'none';
  });
}

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