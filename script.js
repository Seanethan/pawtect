// map logi namn dito naka center sa akin kaya paki adjust pag nag open user dapat naka pinpoint kung nasan active location ng dfevice  nila
let map;
let markerData = [];

let userLocation = null;
let userLocationMarker = null;
let activeMapCategory = 'all';
let activeMapSearch = '';

// function initMap() {
//   const centerLocation = { lat: 14.7011, lng: 120.9830 }; // Valenzuela / Metro Manila

//   map = new google.maps.Map(document.getElementById("googleMap"), {
//     zoom: 14,
//     center: centerLocation,
//     mapTypeControl: false,
//     streetViewControl: false,
//     styles: [
//       { elementType: "geometry", stylers: [{ color: "#F5F5DC" }] },
//       { elementType: "labels.text.fill", stylers: [{ color: "#6E3419" }] },
//       { featureType: "water", elementType: "geometry", stylers: [{ color: "#ADC178" }] }
//     ]
//   });

//   const locations = [
//     { title: "Supremo Furbabies Shelter", lat: 14.7050, lng: 120.9800, type: "shelter", info: "Open today 9:00 am - 5:00 pm" },
//     { title: "St. Jude Veterinary Clinic", lat: 14.6980, lng: 120.9890, type: "clinic", info: "Open 24/7" },
//     { title: "Case #6969 - Injured Dog", lat: 14.7020, lng: 120.9750, type: "reported", info: "Rescue Assigned" }
//   ];

//   const infoWindow = new google.maps.InfoWindow();

//   locations.forEach(loc => {
//     const marker = new google.maps.Marker({
//       position: { lat: loc.lat, lng: loc.lng },
//       map: map,
//       title: loc.title
//     });

//     marker.addListener("click", () => {
//       infoWindow.setContent(`
//         <div style="padding: 6px; color: #6E3419; font-family: 'Plus Jakarta Sans', sans-serif;">
//           <strong>${loc.title}</strong><br><span>${loc.info}</span>
//         </div>
//       `);
//       infoWindow.open(map, marker);
//     });

//     markerData.push({ marker: marker, type: loc.type, title: loc.title.toLowerCase() });
//   });
// }

function initMap() {
  const centerLocation = { lat: 14.7011, lng: 120.9830 };

  map = new google.maps.Map(document.getElementById("googleMap"), {
    zoom: 14,
    center: centerLocation,
    mapTypeControl: false,
    streetViewControl: false,
    styles: [
      { elementType: "geometry", stylers: [{ color: "#F5F5DC" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#6E3419" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#ADC178" }] }
    ]
  });

  const locations = [
    { title: "Supremo Furbabies Shelter", lat: 14.7050, lng: 120.9800, type: "shelter", info: "Open today 9:00 am - 5:00 pm" },
    { title: "St. Jude Veterinary Clinic", lat: 14.6980, lng: 120.9890, type: "clinic", info: "Open 24/7" },
    { title: "Case #6969 - Injured Dog", lat: 14.7020, lng: 120.9750, type: "reported", info: "Rescue Assigned" }
  ];

  markerData = [];

  const infoWindow = new google.maps.InfoWindow();

  locations.forEach(loc => {
    const marker = new google.maps.Marker({
      position: { lat: loc.lat, lng: loc.lng },
      map: map,
      title: loc.title
    });

    marker.addListener("click", () => {
      infoWindow.setContent(`
        <div style="padding: 6px; color: #6E3419; font-family: 'Plus Jakarta Sans', sans-serif;">
          <strong>${loc.title}</strong><br>
          <span>${loc.info}</span>
        </div>
      `);

      infoWindow.open(map, marker);
    });

    markerData.push({
      marker: marker,
      type: loc.type,
      title: loc.title.toLowerCase(),
      name: loc.title,
      info: loc.info,
      position: { lat: loc.lat, lng: loc.lng }
    });
  });

  // Detect user's actual device location
  getUserLocation();
  loadMapReports();
}

function getUserLocation() {
  const list = document.getElementById('nearestLocationsList');

  if (!navigator.geolocation) {
    list.innerHTML = '<div class="nearest-empty">Your browser does not support location detection.</div>';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function(position) {
      userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      map.setCenter(userLocation);
      map.setZoom(14);

      userLocationMarker = new google.maps.Marker({
        position: userLocation,
        map: map,
        title: "Your Current Location",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#4285F4",
          fillOpacity: 1,
          strokeColor: "#FFFFFF",
          strokeWeight: 3
        },
        zIndex: 999
      });

      renderNearestLocations();
    },

    function(error) {
      list.innerHTML = `
        <div class="nearest-empty">
          <i class="fa-solid fa-location-crosshairs"></i><br>
          Unable to access your location. Please allow location permission and try again.
        </div>
      `;
    },

    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

function calculateDistance(location1, location2) {
  const R = 6371;

  const dLat = (location2.lat - location1.lat) * Math.PI / 180;
  const dLng = (location2.lng - location1.lng) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(location1.lat * Math.PI / 180) *
    Math.cos(location2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function renderNearestLocations() {
  const list = document.getElementById('nearestLocationsList');
  const count = document.getElementById('nearestCount');

  if (!userLocation) return;

  const nearest = markerData
    .filter(item => {
      const matchesCategory =
        activeMapCategory === 'all' ||
        item.type === activeMapCategory;

      const matchesSearch =
        item.title.includes(activeMapSearch);

      return matchesCategory && matchesSearch;
    })
    .map(item => ({
      ...item,
      distance: calculateDistance(userLocation, item.position)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  count.textContent = `${nearest.length} Locations`;

  if (nearest.length === 0) {
    list.innerHTML = `
      <div class="nearest-empty">
        No nearby locations found.
      </div>
    `;
    return;
  }

  list.innerHTML = nearest.map((item, index) => {
    let icon = 'fa-location-dot';

    if (item.type === 'shelter') icon = 'fa-house';
    if (item.type === 'clinic') icon = 'fa-house-medical';
    if (item.type === 'reported') icon = 'fa-paw';

    return `
      <div class="nearest-location-item"
           onclick="focusNearestLocation(${index})">

        <div class="nearest-icon">
          <i class="fa-solid ${icon}"></i>
        </div>

        <div class="nearest-info">
          <h4>${item.name}</h4>
          <p>${item.type.toUpperCase()} • ${item.info}</p>
        </div>

        <div class="nearest-distance">
          ${item.distance < 1
            ? `${Math.round(item.distance * 1000)} m`
            : `${item.distance.toFixed(2)} km`}
        </div>

      </div>
    `;
  }).join('');

  window.nearestLocationResults = nearest;
}

function focusNearestLocation(index) {
  const item = window.nearestLocationResults[index];

  if (!item) return;

  map.panTo(item.position);
  map.setZoom(17);

  google.maps.event.trigger(item.marker, 'click');
}

// function setMapFilter(category, buttonEl) {
//   document.querySelectorAll('.filter-pills .pill').forEach(btn => btn.classList.remove('active'));
//   buttonEl.classList.add('active');

//   markerData.forEach(item => {
//     if (category === 'all' || item.type === category) {
//       item.marker.setMap(map);
//     } else {
//       item.marker.setMap(null);
//     }
//   });
// }

// function filterMapPins() {
//   const query = document.getElementById('mapSearchInput').value.toLowerCase();
//   markerData.forEach(item => {
//     if (item.title.includes(query)) {
//       item.marker.setMap(map);
//     } else {
//       item.marker.setMap(null);
//     }
//   });
// }

function setMapFilter(category, buttonEl) {
  document.querySelectorAll('.filter-pills .pill')
    .forEach(btn => btn.classList.remove('active'));

  buttonEl.classList.add('active');

  activeMapCategory = category;
  updateMapDisplay();
}

function filterMapPins() {
  activeMapSearch = document
    .getElementById('mapSearchInput')
    .value.toLowerCase();

  updateMapDisplay();
}

function updateMapDisplay() {
  markerData.forEach(item => {
    const matchesCategory =
      activeMapCategory === 'all' ||
      item.type === activeMapCategory;

    const matchesSearch =
      item.title.includes(activeMapSearch);

    item.marker.setMap(
      matchesCategory && matchesSearch ? map : null
    );
  });

  renderNearestLocations();
}



async function loadMapReports() {
  if (!getToken() || !map) return;
  try {
    const { reports } = await apiRequest("/reports");
    const infoWindow = new google.maps.InfoWindow();
    reports.forEach(report => {
      if (report.latitude == null || report.longitude == null) return;
      const position = { lat: Number(report.latitude), lng: Number(report.longitude) };
      const marker = new google.maps.Marker({ position, map, title: `Report #${report.report_id}` });
      marker.addListener("click", () => {
        infoWindow.setContent(`<div style="padding:6px;color:#6E3419"><strong>Report #${report.report_id}</strong><br>${safeText(report.animal_type)} • ${safeText(report.status)}<br>${safeText(report.location_address)}</div>`);
        infoWindow.open(map, marker);
      });
      markerData.push({
        marker, type: "reported", title: `report #${report.report_id} ${report.animal_type}`.toLowerCase(),
        name: `Report #${report.report_id}`, info: `${report.animal_type} • ${report.status}`, position
      });
    });
    updateMapDisplay();
  } catch (error) { console.warn("Could not load report markers:", error.message); }
}

// ---------------- PAWTECT DATABASE INTEGRATION ----------------
const API_BASE = `${window.PAWTECT_API_BASE || window.location.origin}/api`;
const TOKEN_KEY = "pawtect_token";
const USER_KEY = "pawtect_user";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); }
  catch { return null; }
}

async function apiRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
  return payload;
}

function requireLogin() {
  if (!getToken()) {
    alert("Please log in first.");
    window.location.href = "auth.html";
    return false;
  }
  return true;
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.href = "auth.html";
}

function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[ch]));
}

function displayDate(value) {
  if (!value) return "Date unavailable";
  return new Date(value).toLocaleString();
}

// Authentication page: login and registration forms.
async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = form.querySelector('[name="email"]').value.trim();
  const password = form.querySelector('[name="password"]').value;
  const message = document.getElementById("authMessage");
  try {
    const result = await apiRequest("/auth/login", {
      method: "POST", body: JSON.stringify({ email, password })
    });
    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    window.location.href = "index.html";
  } catch (error) {
    if (message) message.textContent = error.message;
    else alert(error.message);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const message = document.getElementById("authMessage");
  try {
    const result = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        firstName: data.firstName, lastName: data.lastName,
        username: data.username, email: data.email, password: data.password,
        contactNumber: data.contactNumber, birthday: data.birthday || null
      })
    });
    let verifyText = result.message;
    if (result.developmentVerificationToken) {
      const token = prompt("Development email verification token (copy it from here):", result.developmentVerificationToken);
      if (token) {
        await apiRequest("/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({ userId: result.userId, token })
        });
        verifyText = "Email verified. You can now log in.";
      }
    }
    if (message) message.textContent = verifyText;
    else alert(verifyText);
    form.reset();
  } catch (error) {
    if (message) message.textContent = error.message;
    else alert(error.message);
  }
}

// Profile data is now loaded from MySQL through the authenticated API.
async function loadProfileState() {
  const localUser = getCurrentUser();
  if (!getToken()) return;
  try {
    const { user } = await apiRequest("/auth/me");
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? ""; };
    const setInput = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ""; };
    setEl("displayFullName", fullName);
    setEl("valFullName", fullName);
    setInput("inputFullName", fullName);
    setEl("displayLocation", user.address || "Location not set");
    setEl("valLocation", user.address || "Location not set");
    setInput("inputLocation", user.address || "");
    setEl("valEmail", user.email);
    setInput("inputEmail", user.email);
    setEl("valContact", user.contact_number);
    setInput("inputContact", user.contact_number);
    setEl("navUserName", fullName || user.username || "My Account");
  } catch (error) {
    console.warn("Could not load profile:", error.message);
  }
}

function toggleEditField(field) {
  const editGroup = document.getElementById(`edit${field}Group`);
  if (editGroup) editGroup.classList.toggle("hidden");
}

async function saveProfileField(field) {
  if (!requireLogin()) return;
  const inputEl = document.getElementById(`input${field}`);
  if (!inputEl) return;
  const value = inputEl.value.trim();
  try {
    if (field === "Password") {
      alert("Password changes need a dedicated secure password-change flow; this field is not saved yet.");
      return;
    }
    if (field === "Email" || field === "Note" || field === "Location") {
      alert(`${field} editing is not available in the current users table/API yet.`);
      return;
    }
    const parts = field === "FullName" ? value.split(/\s+/) : [];
    const body = field === "FullName"
      ? { firstName: parts.shift() || "", lastName: parts.join(" ") }
      : field === "Contact" ? { contactNumber: value } : {};
    await apiRequest("/auth/me", { method: "PATCH", body: JSON.stringify(body) });
    await loadProfileState();
    toggleEditField(field);
    alert("Profile updated.");
  } catch (error) { alert(error.message); }
}

function triggerAvatarUpload() {
  alert("Profile photo upload is not connected yet.");
}

// Submit report to MySQL. Current form supports report details and address; photo storage
// requires a separate upload/storage service, so this version records no uploaded image URL.
async function handleReportSubmit(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const form = event.currentTarget;
  const fields = form.querySelectorAll("textarea, select, input[type='text']");
  const description = form.querySelector("textarea")?.value.trim() || "";
  const selects = form.querySelectorAll("select");
  const animalType = (selects[0]?.value || "").toLowerCase();
  const condition = (selects[1]?.value || "").toLowerCase();
  const urgency = (selects[2]?.value || "Medium").toLowerCase();
  const locationAddress = form.querySelector("input[type='text']")?.value.trim() || "";
  try {
    const result = await apiRequest("/reports", {
      method: "POST",
      body: JSON.stringify({ animalType, animalDescription: description, condition, urgency, locationAddress })
    });
    alert(`Report submitted successfully. Report ID: ${result.reportId}`);
    window.location.href = "rescue-cases.html";
  } catch (error) { alert(error.message); }
}

// Rescue reports are loaded from the backend instead of the hardcoded demo cards.
async function loadRescueCases() {
  const list = document.getElementById("casesList");
  if (!list || !getToken()) return;
  try {
    const { reports } = await apiRequest("/reports");
    list.innerHTML = reports.map(report => {
      const category = `${report.animal_type} ${report.urgency} ${["accepted","en_route","arrived"].includes(report.status) ? "progress" : ""}`;
      const id = report.report_id;
      const icon = report.animal_type === "cat" ? "fa-cat" : "fa-dog";
      return `<div class="case-list-item" data-category="${safeText(category)}" data-date="${safeText(report.created_at)}" data-urgency="${safeText(report.urgency)}">
        <div class="item-thumb"><i class="fa-solid ${icon}"></i></div>
        <div class="item-details">
          <span class="item-code">Report #${id}</span>
          <div class="item-field"><i class="fa-solid fa-paw"></i> ${safeText(report.animal_type)} <span class="sub-label">${safeText(report.condition)}</span></div>
          <div class="item-field"><i class="fa-solid fa-location-dot"></i> ${safeText(report.location_address)}</div>
          <div class="item-field"><i class="fa-solid fa-calendar-days"></i> ${safeText(displayDate(report.created_at))}</div>
          <div class="item-field">Status: ${safeText(report.status)}</div>
        </div>
        <div class="item-right-actions">
          <div class="tag-row"><span class="badge badge-rose">${safeText(report.urgency)}</span></div>
          <a href="case-overview.html?id=${id}" class="btn btn-coral">View Details <i class="fa-solid fa-chevron-right"></i></a>
        </div>
      </div>`;
    }).join("") || '<p class="nearest-empty">No reports found yet.</p>';
    filterRescueCases();
  } catch (error) {
    list.innerHTML = `<p class="nearest-empty">${safeText(error.message)}. Please log in again.</p>`;
  }
}


async function loadHomeReports() {
  const grid = document.querySelector(".cards-grid");
  if (!grid || !getToken()) return;
  try {
    const { reports } = await apiRequest("/reports");
    const active = reports.filter(r => !["rescued", "brought_to_vet", "brought_to_shelter", "rejected"].includes(r.status)).slice(0, 4);
    grid.innerHTML = active.map(r => `<div class="case-card" onclick="location.href='case-overview.html?id=${r.report_id}'" style="cursor:pointer">
      <div class="card-thumb"><i class="fa-solid ${r.animal_type === "cat" ? "fa-cat" : "fa-dog"}"></i></div>
      <div class="card-body"><div class="card-title-row"><strong>Report #${r.report_id}</strong><span class="tag tag-reported">${safeText(r.status)}</span></div>
      <ul class="meta-list"><li><i class="fa-solid fa-paw"></i>${safeText(r.animal_type)} • ${safeText(r.condition)}</li>
      <li><i class="fa-solid fa-location-dot"></i>${safeText(r.location_address)}</li><li><i class="fa-regular fa-calendar"></i>${safeText(displayDate(r.created_at))}</li></ul></div>
    </div>`).join("") || "<p>No active reports yet.</p>";
  } catch (error) { console.warn("Could not load home reports:", error.message); }
}

function filterCategory(category, buttonEl) {
  document.querySelectorAll(".pill-bar .pill-btn").forEach(btn => btn.classList.remove("active"));
  if (buttonEl) buttonEl.classList.add("active");
  document.querySelectorAll(".case-list-item").forEach(item => {
    const cats = item.getAttribute("data-category") || "";
    item.style.display = category === "all" || cats.includes(category) ? "flex" : "none";
  });
}

function filterRescueCases() {
  const search = document.getElementById("caseSearchInput");
  const sort = document.getElementById("sortBySelect");
  const query = (search?.value || "").toLowerCase();
  const items = [...document.querySelectorAll(".case-list-item")];
  items.sort((a, b) => {
    const dateA = new Date(a.dataset.date || 0).getTime();
    const dateB = new Date(b.dataset.date || 0).getTime();
    if (sort?.value === "oldest") return dateA - dateB;
    if (sort?.value === "urgent") return (b.dataset.urgency === "urgent") - (a.dataset.urgency === "urgent");
    return dateB - dateA;
  });
  const list = document.getElementById("casesList");
  items.forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(query) ? "flex" : "none";
    list?.appendChild(item);
  });
}

// Case detail pages use ?id=REPORT_ID and load the matching report/history.
async function loadReportDetails() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id || !getToken()) return;
  try {
    const { report, history } = await apiRequest(`/reports/${encodeURIComponent(id)}`);
    const heading = document.querySelector(".overview-header-line h3");
    if (heading) heading.textContent = `Report #${report.report_id}`;
    const locationLine = document.querySelector(".overview-main-card .location-line");
    if (locationLine) locationLine.textContent = report.location_address;
    const timeLine = document.querySelector(".overview-main-card .time-line");
    if (timeLine) timeLine.textContent = `Reported on ${displayDate(report.created_at)}`;
    const details = document.querySelectorAll(".overview-details-card .detail-row");
    const values = [
      report.animal_type, "--", "--", "--", report.condition,
      report.location_address, displayDate(report.created_at), report.reporter_name,
      report.animal_description || "No description provided."
    ];
    details.forEach((el, i) => {
      if (values[i] !== undefined) el.innerHTML = `<strong>${el.querySelector("strong")?.textContent || ""}</strong><br>${safeText(values[i])}`;
    });
    const steps = document.querySelectorAll(".timeline-stepper .step");
    const stages = ["reported", "accepted", "en_route", "arrived", "rescued"];
    const current = Math.max(0, stages.indexOf(report.status));
    steps.forEach((step, i) => {
      step.classList.toggle("completed", i < current);
      step.classList.toggle("active", i === current);
    });
  } catch (error) { console.warn("Unable to load report details:", error.message); }
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("casesList")) loadRescueCases();
  if (document.querySelector(".cards-grid")) loadHomeReports();
  if (document.querySelector(".overview-main-card")) loadReportDetails();
  if (document.getElementById("displayFullName")) loadProfileState();
  const user = getCurrentUser();
  document.querySelectorAll(".user-select span").forEach(el => {
    if (user) el.textContent = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  });
});
