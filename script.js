// ===== MAP (Leaflet + OpenStreetMap: free, no API key) =====
const DEFAULT_CENTER = [14.7011, 120.9830]; // fallback if GPS is denied/unavailable
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

let map;
let markerData = [];
let userMarker = null;
let accuracyCircle = null;
let mapFilter = 'all';

const PIN_ICONS = { shelter: 'fa-house-chimney', clinic: 'fa-briefcase-medical', reported: 'fa-paw', report: 'fa-paw' };

function pinIcon(type) {
  return L.divIcon({
    className: 'paw-pin pin-' + type,
    html: `<span><i class="fa-solid ${PIN_ICONS[type]}"></i></span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -30]
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showUserLocation(lat, lng, accuracy, recenter) {
  const pos = [lat, lng];
  if (!userMarker) {
    userMarker = L.marker(pos, {
      icon: L.divIcon({ className: '', html: '<div class="user-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      zIndexOffset: 1000
    }).addTo(map).bindPopup('You are here');
    accuracyCircle = L.circle(pos, { radius: accuracy || 50, color: '#2F80ED', weight: 1, fillOpacity: 0.08 }).addTo(map);
  } else {
    userMarker.setLatLng(pos);
    accuracyCircle.setLatLng(pos).setRadius(accuracy || 50);
  }
  if (recenter) map.setView(pos, 15);
}

function locateUser(showError) {
  if (!navigator.geolocation) {
    if (showError) alert('Your browser does not support GPS location.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    p => showUserLocation(p.coords.latitude, p.coords.longitude, p.coords.accuracy, true),
    () => { if (showError) alert('Could not get your location. Please allow location access in your browser.'); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

function initMap() {
  const el = document.getElementById('leafletMap');
  if (!el) return;

  map = L.map(el).setView(DEFAULT_CENTER, 14);
  L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTR }).addTo(map);

  // "Locate me" button
  const LocateControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const btn = L.DomUtil.create('button', 'locate-btn');
      btn.type = 'button';
      btn.title = 'Show my location';
      btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
      L.DomEvent.disableClickPropagation(btn);
      btn.onclick = () => locateUser(true);
      return btn;
    }
  });
  map.addControl(new LocateControl());

  // Sample facilities + case (replace with real data from your backend later)
  const locations = [
    { title: 'Supremo Furbabies Shelter', lat: 14.7050, lng: 120.9800, type: 'shelter', info: 'Open today 9:00 am - 5:00 pm' },
    { title: 'St. Jude Veterinary Clinic', lat: 14.6980, lng: 120.9890, type: 'clinic', info: 'Open 24/7' },
    { title: 'Case #6969 - Injured Dog', lat: 14.7020, lng: 120.9750, type: 'reported', info: 'Rescue Assigned' }
  ];

  // Reports submitted from the Report page (saved in localStorage for now)
  JSON.parse(localStorage.getItem('pawtect_reports') || '[]').forEach(r => locations.push({
    title: `${r.animal} - ${r.condition}`, lat: r.lat, lng: r.lng, type: 'reported',
    info: `Pending - ${r.address || 'Pinned location'}`
  }));

  locations.forEach(loc => {
    const marker = L.marker([loc.lat, loc.lng], { icon: pinIcon(loc.type) })
      .bindPopup(`<div style="color:#6E3419;font-family:'Plus Jakarta Sans',sans-serif;"><strong>${escapeHtml(loc.title)}</strong><br><span>${escapeHtml(loc.info)}</span></div>`)
      .addTo(map);
    markerData.push({ marker, type: loc.type, title: loc.title.toLowerCase() });
  });

  // Center on the user's real GPS position
  locateUser(false);
}

function applyMapFilters() {
  if (!map) return;
  const input = document.getElementById('mapSearchInput');
  const query = input ? input.value.toLowerCase() : '';
  markerData.forEach(item => {
    const show = (mapFilter === 'all' || item.type === mapFilter) && item.title.includes(query);
    if (show) item.marker.addTo(map); else map.removeLayer(item.marker);
  });
}

function setMapFilter(category, buttonEl) {
  document.querySelectorAll('.filter-pills .pill').forEach(btn => btn.classList.remove('active'));
  buttonEl.classList.add('active');
  mapFilter = category;
  applyMapFilters();
}

function filterMapPins() { applyMapFilters(); }

// ===== REPORT PAGE: GPS + tap-to-pin location picker =====
let reportMap, reportMarker;

function initReportMap() {
  const el = document.getElementById('reportMap');
  if (!el) return;

  reportMap = L.map(el).setView(DEFAULT_CENTER, 15);
  L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTR }).addTo(reportMap);
  reportMap.on('click', e => setReportPin(e.latlng.lat, e.latlng.lng, true));

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      p => reportMap.setView([p.coords.latitude, p.coords.longitude], 16),
      () => {}, { timeout: 8000 }
    );
  }
}

function setReportPin(lat, lng, reverseGeocode) {
  if (!reportMarker) {
    reportMarker = L.marker([lat, lng], { draggable: true, icon: pinIcon('report') }).addTo(reportMap);
    reportMarker.on('dragend', () => {
      const p = reportMarker.getLatLng();
      setReportPin(p.lat, p.lng, true);
    });
  } else {
    reportMarker.setLatLng([lat, lng]);
  }
  document.getElementById('reportLat').value = lat;
  document.getElementById('reportLng').value = lng;
  const status = document.getElementById('pinStatus');
  if (status) status.textContent = `Pinned at ${lat.toFixed(5)}, ${lng.toFixed(5)}. Drag the pin to adjust.`;
  if (reverseGeocode) reverseGeocodeToInput(lat, lng);
}

// Free reverse geocoding via OpenStreetMap Nominatim (light usage only)
async function reverseGeocodeToInput(lat, lng) {
  const input = document.getElementById('locationInput');
  if (!input) return;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    if (data && data.display_name) { input.value = data.display_name; return; }
  } catch (e) { /* fall through */ }
  if (!input.value) input.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function useMyLocation() {
  if (!navigator.geolocation) {
    alert('Your browser does not support GPS location.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    p => {
      const { latitude, longitude } = p.coords;
      reportMap.setView([latitude, longitude], 17);
      setReportPin(latitude, longitude, true);
    },
    () => alert('Could not get your location. Please allow location access, or tap the map to drop a pin.'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// profile logic toh ah 
const defaultProfile = {
  fullName: "Rene Buttercoconut",
  location: "Quezon City",
  email: "renebuttercoconut@gmail.com",
  contact: "0967 676 6767",
  note: "“MAMAAAAAAAAAAAA”"
};

function loadProfileState() {
  const profile = JSON.parse(localStorage.getItem('pawtect_user_profile')) || defaultProfile;

  const setEl = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  const setInput = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };

  setEl('displayFullName', profile.fullName);
  setEl('valFullName', profile.fullName);
  setInput('inputFullName', profile.fullName);

  setEl('displayLocation', profile.location);
  setEl('valLocation', profile.location);
  setInput('inputLocation', profile.location);

  setEl('valEmail', profile.email);
  setInput('inputEmail', profile.email);

  setEl('valContact', profile.contact);
  setInput('inputContact', profile.contact);

  setEl('displayNote', profile.note.startsWith('“') ? profile.note : `“${profile.note}”`);
  setInput('inputNote', profile.note.replace(/[“”]/g, ''));

  setEl('navUserName', profile.fullName);
}

function toggleEditField(field) {
  const editGroup = document.getElementById(`edit${field}Group`);
  if (editGroup) editGroup.classList.toggle('hidden');
}

function saveProfileField(field) {
  const profile = JSON.parse(localStorage.getItem('pawtect_user_profile')) || defaultProfile;
  const inputEl = document.getElementById(`input${field}`);

  if (inputEl) {
    let newVal = inputEl.value.trim();

    if (field === 'FullName') profile.fullName = newVal;
    if (field === 'Location') profile.location = newVal;
    if (field === 'Email') profile.email = newVal;
    if (field === 'Contact') profile.contact = newVal;
    if (field === 'Note') profile.note = newVal;
    if (field === 'Password') {
      alert('Password updated successfully!');
      toggleEditField('Password');
      return;
    }

    localStorage.setItem('pawtect_user_profile', JSON.stringify(profile));
    loadProfileState();
    toggleEditField(field);
  }
}

function triggerAvatarUpload() {
  alert('Select a new profile photo to upload...');
}

function setAmount(val) {
  document.getElementById('donationAmount').value = val;
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    document.getElementById('filePreview').textContent = `Attached: ${file.name}`;
  }
}

function handleDonationSubmit(event) {
  event.preventDefault();
  alert('Thank you for your donation!');
  event.target.reset();
  document.getElementById('filePreview').textContent = '';
}

function handleReportSubmit(event) {
  event.preventDefault();
  const latEl = document.getElementById('reportLat');
  if (latEl) {
    const lat = parseFloat(latEl.value);
    const lng = parseFloat(document.getElementById('reportLng').value);
    if (isNaN(lat) || isNaN(lng)) {
      alert('Please pin the location on the map or tap "Use my location".');
      return;
    }
    const selects = event.target.querySelectorAll('select');
    const reports = JSON.parse(localStorage.getItem('pawtect_reports') || '[]');
    reports.push({
      animal: selects[0].value, condition: selects[1].value, urgency: selects[2].value,
      address: document.getElementById('locationInput').value, lat, lng, date: new Date().toISOString()
    });
    localStorage.setItem('pawtect_reports', JSON.stringify(reports));
  }
  alert('Stray report submitted successfully! Case pending review.');
  window.location.href = 'rescue-cases.html';
}

function filterCategory(category, buttonEl) {
  document.querySelectorAll('.pill-bar .pill-btn').forEach(btn => btn.classList.remove('active'));
  buttonEl.classList.add('active');

  document.querySelectorAll('.case-list-item').forEach(item => {
    const cats = item.getAttribute('data-category');
    if (category === 'all' || cats.includes(category)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

function filterRescueCases() {
  const query = document.getElementById('caseSearchInput').value.toLowerCase();
  document.querySelectorAll('.case-list-item').forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(query) ? 'flex' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadProfileState();
  initMap();
  initReportMap();
});