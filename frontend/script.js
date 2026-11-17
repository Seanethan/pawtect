// ============================================================
// PAWTECT — shared script.js
// Fixes: removed duplicate getToken/apiRequest/getCurrentUser,
// added null checks, POST auth routes confirmed, safer form reads.
// ============================================================

// ---------------- STORAGE / API HELPERS ----------------
// When served from Express (port 3000), use same-origin /api.
// When served from VS Code Live Server (5500, 5501, etc.), use the Express API explicitly.
const API_BASE = "http://localhost:5000/api";

const TOKEN_KEY = "pawtect_token";
const USER_KEY = "pawtect_user";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (getToken()) {
    headers.Authorization = `Bearer ${getToken()}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || `Request failed (${response.status})`);
  }

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
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function displayDate(value) {
  if (!value) return "Date unavailable";
  return new Date(value).toLocaleString();
}

// ---------------- AUTH ----------------

async function handleLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const emailEl = form.querySelector('[name="email"]');
  const passwordEl = form.querySelector('[name="password"]');
  const message = document.getElementById("authMessage");

  const email = (emailEl?.value || "").trim();
  const password = passwordEl?.value || "";

  if (!email || !password) {
    if (message) message.textContent = "Email and password are required.";
    return;
  }

  try {
    if (message) message.textContent = "Logging in...";

    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    if (!result.token || !result.user) {
      throw new Error("Login response missing token or user.");
    }

    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));

    if (result.user.role === "admin") {
      window.location.href = "admin-dashboard.html";
    } else {
      window.location.href = "index.html";
    }
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
        firstName: data.firstName,
        lastName: data.lastName,
        username: data.username,
        email: data.email,
        password: data.password,
        contactNumber: data.contactNumber,
        birthday: data.birthday || null
      })
    });

    let verifyText = result.message;
    if (result.developmentVerificationToken) {
      const token = prompt(
        "Development email verification token (copy it from here):",
        result.developmentVerificationToken
      );
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

// ---------------- PROFILE ----------------

async function loadProfileState() {
  if (!getToken()) return;
  try {
    const { user } = await apiRequest("/auth/me");
    localStorage.setItem(USER_KEY, JSON.stringify(user));

    const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
    const setEl    = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? ""; };
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

// ---------------- MAP ----------------

let map;
let markerData = [];
let userLocation = null;
let userLocationMarker = null;
let activeMapCategory = 'all';
let activeMapSearch = '';

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
    { title: "Supremo Furbabies Shelter",     lat: 14.7050, lng: 120.9800, type: "shelter",  info: "Open today 9:00 am - 5:00 pm" },
    { title: "St. Jude Veterinary Clinic",    lat: 14.6980, lng: 120.9890, type: "clinic",   info: "Open 24/7" },
    { title: "Case #6969 - Injured Dog",      lat: 14.7020, lng: 120.9750, type: "reported", info: "Rescue Assigned" }
  ];

  markerData = [];
  const infoWindow = new google.maps.InfoWindow();

  locations.forEach(loc => {
    const marker = new google.maps.Marker({
      position: { lat: loc.lat, lng: loc.lng },
      map,
      title: loc.title
    });

    marker.addListener("click", () => {
      infoWindow.setContent(`
        <div style="padding:6px;color:#6E3419;font-family:'Plus Jakarta Sans',sans-serif;">
          <strong>${loc.title}</strong><br><span>${loc.info}</span>
        </div>`);
      infoWindow.open(map, marker);
    });

    markerData.push({
      marker, type: loc.type, title: loc.title.toLowerCase(),
      name: loc.title, info: loc.info,
      position: { lat: loc.lat, lng: loc.lng }
    });
  });

  getUserLocation();
  loadMapReports();
}

function getUserLocation() {
  const list = document.getElementById('nearestLocationsList');

  if (!navigator.geolocation) {
    if (list) list.innerHTML = '<div class="nearest-empty">Your browser does not support location detection.</div>';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function (position) {
      userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      map.setCenter(userLocation);
      map.setZoom(14);

      userLocationMarker = new google.maps.Marker({
        position: userLocation,
        map,
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
    function () {
      if (list) {
        list.innerHTML = `
          <div class="nearest-empty">
            <i class="fa-solid fa-location-crosshairs"></i><br>
            Unable to access your location. Please allow location permission and try again.
          </div>`;
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function calculateDistance(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) *
    Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function renderNearestLocations() {
  const list = document.getElementById('nearestLocationsList');
  const count = document.getElementById('nearestCount');
  if (!list || !userLocation) return;

  const nearest = markerData
    .filter(item =>
      (activeMapCategory === 'all' || item.type === activeMapCategory) &&
      item.title.includes(activeMapSearch)
    )
    .map(item => ({ ...item, distance: calculateDistance(userLocation, item.position) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  if (count) count.textContent = `${nearest.length} Locations`;

  if (!nearest.length) {
    list.innerHTML = `<div class="nearest-empty">No nearby locations found.</div>`;
    window.nearestLocationResults = [];
    return;
  }

  list.innerHTML = nearest.map((item, index) => {
    let icon = 'fa-location-dot';
    if (item.type === 'shelter')  icon = 'fa-house';
    if (item.type === 'clinic')   icon = 'fa-house-medical';
    if (item.type === 'reported') icon = 'fa-paw';

    return `
      <div class="nearest-location-item" onclick="focusNearestLocation(${index})">
        <div class="nearest-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="nearest-info">
          <h4>${safeText(item.name)}</h4>
          <p>${safeText(item.type.toUpperCase())} • ${safeText(item.info)}</p>
        </div>
        <div class="nearest-distance">
          ${item.distance < 1
            ? `${Math.round(item.distance * 1000)} m`
            : `${item.distance.toFixed(2)} km`}
        </div>
      </div>`;
  }).join('');

  window.nearestLocationResults = nearest;
}

function focusNearestLocation(index) {
  const item = window.nearestLocationResults?.[index];
  if (!item) return;
  map.panTo(item.position);
  map.setZoom(17);
  google.maps.event.trigger(item.marker, 'click');
}

function setMapFilter(category, buttonEl) {
  document.querySelectorAll('.filter-pills .pill')
    .forEach(btn => btn.classList.remove('active'));
  if (buttonEl) buttonEl.classList.add('active');
  activeMapCategory = category;
  updateMapDisplay();
}

function filterMapPins() {
  const input = document.getElementById('mapSearchInput');
  activeMapSearch = (input?.value || "").toLowerCase();
  updateMapDisplay();
}

function updateMapDisplay() {
  markerData.forEach(item => {
    const matchesCategory = activeMapCategory === 'all' || item.type === activeMapCategory;
    const matchesSearch = item.title.includes(activeMapSearch);
    item.marker.setMap(matchesCategory && matchesSearch ? map : null);
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
      const marker = new google.maps.Marker({
        position, map, title: `Report #${report.report_id}`
      });
      marker.addListener("click", () => {
        infoWindow.setContent(
          `<div style="padding:6px;color:#6E3419">
            <strong>Report #${safeText(report.report_id)}</strong><br>
            ${safeText(report.animal_type)} • ${safeText(report.status)}<br>
            ${safeText(report.location_address)}
          </div>`);
        infoWindow.open(map, marker);
      });
      markerData.push({
        marker, type: "reported",
        title: `report #${report.report_id} ${report.animal_type}`.toLowerCase(),
        name: `Report #${report.report_id}`,
        info: `${report.animal_type} • ${report.status}`,
        position
      });
    });
    updateMapDisplay();
  } catch (error) {
    console.warn("Could not load report markers:", error.message);
  }
}

// ---------------- REPORTS ----------------

async function handleReportSubmit(event) {
  event.preventDefault();
  if (!requireLogin()) return;

  const form = event.currentTarget;
  const description = form.querySelector('[name="description"]')?.value.trim()
                   || form.querySelector("textarea")?.value.trim()
                   || "";
  const animalType = (form.querySelector('[name="animalType"]')?.value
                   || form.querySelectorAll("select")[0]?.value
                   || "").toLowerCase();
  const condition  = (form.querySelector('[name="condition"]')?.value
                   || form.querySelectorAll("select")[1]?.value
                   || "").toLowerCase();
  const urgency    = (form.querySelector('[name="urgency"]')?.value
                   || form.querySelectorAll("select")[2]?.value
                   || "Medium").toLowerCase();
  const locationAddress = form.querySelector('[name="locationAddress"]')?.value.trim()
                       || form.querySelector("input[type='text']")?.value.trim()
                       || "";

  try {
    const result = await apiRequest("/reports", {
      method: "POST",
      body: JSON.stringify({
        animalType, animalDescription: description, condition, urgency, locationAddress
      })
    });
    alert(`Report submitted successfully. Report ID: ${result.reportId}`);
    window.location.href = "rescue-cases.html";
  } catch (error) {
    alert(error.message);
  }
}

async function loadRescueCases() {
  const list = document.getElementById("casesList");
  if (!list || !getToken()) return;
  try {
    const { reports } = await apiRequest("/reports");
    list.innerHTML = reports.map(report => {
      const category = `${report.animal_type} ${report.urgency} ${
        ["accepted", "en_route", "arrived"].includes(report.status) ? "progress" : ""
      }`;
      const id = report.report_id;
      const icon = report.animal_type === "cat" ? "fa-cat" : "fa-dog";
      return `<div class="case-list-item"
                    data-category="${safeText(category)}"
                    data-date="${safeText(report.created_at)}"
                    data-urgency="${safeText(report.urgency)}">
        <div class="item-thumb"><i class="fa-solid ${icon}"></i></div>
        <div class="item-details">
          <span class="item-code">Report #${safeText(id)}</span>
          <div class="item-field"><i class="fa-solid fa-paw"></i> ${safeText(report.animal_type)} <span class="sub-label">${safeText(report.condition)}</span></div>
          <div class="item-field"><i class="fa-solid fa-location-dot"></i> ${safeText(report.location_address)}</div>
          <div class="item-field"><i class="fa-solid fa-calendar-days"></i> ${safeText(displayDate(report.created_at))}</div>
          <div class="item-field">Status: ${safeText(report.status)}</div>
        </div>
        <div class="item-right-actions">
          <div class="tag-row"><span class="badge badge-rose">${safeText(report.urgency)}</span></div>
          <a href="case-overview.html?id=${safeText(id)}" class="btn btn-coral">View Details <i class="fa-solid fa-chevron-right"></i></a>
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
    const active = reports
      .filter(r => !["rescued", "brought_to_vet", "brought_to_shelter", "rejected"].includes(r.status))
      .slice(0, 4);

    grid.innerHTML = active.map(r => `
      <div class="case-card" onclick="location.href='case-overview.html?id=${safeText(r.report_id)}'" style="cursor:pointer">
        <div class="card-thumb"><i class="fa-solid ${r.animal_type === "cat" ? "fa-cat" : "fa-dog"}"></i></div>
        <div class="card-body">
          <div class="card-title-row">
            <strong>Report #${safeText(r.report_id)}</strong>
            <span class="tag tag-reported">${safeText(r.status)}</span>
          </div>
          <ul class="meta-list">
            <li><i class="fa-solid fa-paw"></i>${safeText(r.animal_type)} • ${safeText(r.condition)}</li>
            <li><i class="fa-solid fa-location-dot"></i>${safeText(r.location_address)}</li>
            <li><i class="fa-regular fa-calendar"></i>${safeText(displayDate(r.created_at))}</li>
          </ul>
        </div>
      </div>`).join("") || "<p>No active reports yet.</p>";
  } catch (error) {
    console.warn("Could not load home reports:", error.message);
  }
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
  const list = document.getElementById("casesList");
  const items = [...document.querySelectorAll(".case-list-item")];

  items.sort((a, b) => {
    const dateA = new Date(a.dataset.date || 0).getTime();
    const dateB = new Date(b.dataset.date || 0).getTime();
    if (sort?.value === "oldest") return dateA - dateB;
    if (sort?.value === "urgent") return (b.dataset.urgency === "urgent") - (a.dataset.urgency === "urgent");
    return dateB - dateA;
  });

  items.forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(query) ? "flex" : "none";
    list?.appendChild(item);
  });
}

async function loadReportDetails() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id || !getToken()) return;
  try {
    const { report } = await apiRequest(`/reports/${encodeURIComponent(id)}`);
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
      if (values[i] !== undefined) {
        el.innerHTML = `<strong>${el.querySelector("strong")?.textContent || ""}</strong><br>${safeText(values[i])}`;
      }
    });

    const steps = document.querySelectorAll(".timeline-stepper .step");
    const stages = ["reported", "accepted", "en_route", "arrived", "rescued"];
    const current = Math.max(0, stages.indexOf(report.status));
    steps.forEach((step, i) => {
      step.classList.toggle("completed", i < current);
      step.classList.toggle("active", i === current);
    });
  } catch (error) {
    console.warn("Unable to load report details:", error.message);
  }
}

// ---------------- ADMIN ----------------

const adminDashboardState = {
  users: [], staff: [], reports: [],
  reportStatusFilter: "", reportUrgencyFilter: ""
};

function adminStatusLabel(status) {
  const labels = {
    active: "Active", pending: "Pending", suspended: "Suspended",
    disabled: "Disabled", reported: "Pending", accepted: "Accepted",
    en_route: "En Route", arrived: "Arrived", rescued: "Rescued",
    brought_to_vet: "Brought to Vet", brought_to_shelter: "Brought to Shelter",
    rejected: "Rejected", in_progress: "In Progress", resolved: "Resolved"
  };
  return labels[status] || String(status || "Unknown").replaceAll("_", " ");
}

function adminBadge(status) {
  const key = String(status || "").toLowerCase();
  const css = {
    active: "active-status", available: "available", suspended: "suspended",
    pending: "pending", "on duty": "onduty", disabled: "offline",
    reported: "pending", accepted: "progress", en_route: "progress",
    arrived: "progress", in_progress: "progress", rescued: "resolved",
    brought_to_vet: "resolved", brought_to_shelter: "resolved",
    resolved: "resolved", rejected: "suspended", urgent: "suspended",
    high: "onduty", medium: "available", low: "offline"
  }[key] || "offline";
  return `<span class="status ${css}">${safeText(adminStatusLabel(status))}</span>`;
}

function adminPersonName(user) {
  return `${user.first_name || ""} ${user.last_name || ""}`.trim();
}


async function initAdminDashboard() {
  if (!getToken()) {
    alert("Please log in with your admin account.");
    window.location.href = "auth.html";
    return;
  }

  // Bind navigation and controls immediately.
  // This way, they still work if an API request fails.
  bindAdminDashboardEvents();

  try {
    const result = await apiRequest("/auth/me");
    const user = result.user;

    if (!user || user.role !== "admin") {
      alert("You do not have permission to access the admin dashboard.");
      window.location.href = "index.html";
      return;
    }

    localStorage.setItem(USER_KEY, JSON.stringify(user));

    const fullName = adminPersonName(user) || user.username || "Administrator";
    const firstName = user.first_name || "Admin";

    ["adminName", "adminTopName"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = fullName;
    });

    const roleEl = document.getElementById("adminRole");
    if (roleEl) roleEl.textContent = "Administrator";

    const greeting = document.getElementById("adminFirstName");
    if (greeting) greeting.textContent = `${firstName}!`;

    // Load dashboard data independently.
    const tasks = [
      ["Overview", loadAdminOverview],
      ["Users", loadAdminUsers],
      ["Staff", loadAdminStaff],
      ["Reports", loadAdminReports]
    ];

    const results = await Promise.allSettled(
      tasks.map(task => task[1]())
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(
          `Failed to load admin ${tasks[index][0]}:`,
          result.reason
        );
      }
    });

  } catch (error) {
    console.error("Admin dashboard initialization failed:", error);
    alert(`${error.message} Please log in again.`);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = "auth.html";
  }
}


async function loadAdminOverview() {
  const data = await apiRequest("/admin/overview");
  const stats = data.stats || {};
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = Number(value || 0).toLocaleString();
  };
  set("flagReportTotal", stats.flagReports);
  set("urgentReportTotal", stats.urgentReports);
  set("rescuedAnimalTotal", stats.rescuedAnimals);
  set("userTotal", stats.totalUsers);
  set("userActive", stats.activeUsers);
  set("userNewMonth", stats.newUsersThisMonth);
  set("userSuspended", stats.suspendedUsers);
  set("staffTotal", stats.totalStaff);
  set("staffAvailable", stats.availableStaff);
  set("staffOnDuty", stats.onDutyStaff);
  set("staffOffDuty", stats.offDutyStaff);
  set("reportTotal", stats.totalReports);
  set("reportPending", stats.pendingReports);
  set("reportUrgent", stats.urgentReports);

  const summary = document.getElementById("reportOverviewSummary");
  if (summary) {
    summary.innerHTML = `
      <div class="overview-stat-row"><span>Pending reports</span><strong>${Number(stats.pendingReports || 0).toLocaleString()}</strong></div>
      <div class="overview-stat-row"><span>In progress</span><strong>${Number(stats.inProgressReports || 0).toLocaleString()}</strong></div>
      <div class="overview-stat-row"><span>Resolved</span><strong>${Number(stats.resolvedReports || 0).toLocaleString()}</strong></div>
      <div class="overview-stat-row"><span>Urgent</span><strong>${Number(stats.urgentReports || 0).toLocaleString()}</strong></div>`;
  }

  const recent = document.getElementById("recentReports");
  if (recent) {
    recent.innerHTML = (data.recentReports || []).map(report => `
      <div class="report-mini">
        <div class="thumb"></div>
        <div>
          <strong>${safeText(report.location_address || "Location not provided")}</strong>
          <span class="priority">${safeText(adminStatusLabel(report.urgency))} Urgency</span><br>
          <small>Report #${safeText(report.report_id)} • ${safeText(displayDate(report.created_at))}</small>
        </div>
      </div>`).join("") || "<p>No reports submitted yet.</p>";
  }
}

async function loadAdminUsers() {
  const result = await apiRequest("/admin/users");
  adminDashboardState.users = result.users || [];
  renderAdminUsers();
}

function renderAdminUsers() {
  const tbody = document.getElementById("userRows");
  if (!tbody) return;
  const query = (document.getElementById("userSearch")?.value || "").toLowerCase();
  const status = document.getElementById("userStatus")?.value || "";
  const filtered = adminDashboardState.users.filter(user => {
    const searchable = [user.user_id, adminPersonName(user), user.email, user.contact_number]
      .join(" ").toLowerCase();
    return searchable.includes(query) && (!status || user.account_status === status);
  });

  tbody.innerHTML = filtered.map(user => {
    const isActive = user.account_status === "active";
    const nextStatus = isActive ? "suspended" : "active";
    const actionLabel = isActive ? "Suspend" : "Activate";
    return `<tr>
      <td>U${String(user.user_id).padStart(3, "0")}</td>
      <td>${safeText(adminPersonName(user))}</td>
      <td>${safeText(user.email)}</td>
      <td>${safeText(user.contact_number || "—")}</td>
      <td>${adminBadge(user.account_status)}</td>
      <td><div class="actions">
        <button type="button" title="${actionLabel}" data-admin-action="user-status"
          data-id="${user.user_id}" data-status="${nextStatus}">${actionLabel}</button>
      </div></td>
    </tr>`;
  }).join("") || '<tr><td colspan="6" class="empty">No matching users found.</td></tr>';

  const count = document.getElementById("userCount");
  if (count) count.textContent = `Showing ${filtered.length} of ${adminDashboardState.users.length} users`;
}

async function loadAdminStaff() {
  const result = await apiRequest("/admin/staff");
  adminDashboardState.staff = result.staff || [];
  renderAdminStaff();
}

function renderAdminStaff() {
  const tbody = document.getElementById("staffRows");
  if (!tbody) return;
  const query = (document.getElementById("staffSearch")?.value || "").toLowerCase();
  const status = document.getElementById("staffStatus")?.value || "";
  const filtered = adminDashboardState.staff.filter(person => {
    const searchable = [person.user_id, adminPersonName(person), person.email, person.contact_number]
      .join(" ").toLowerCase();
    return searchable.includes(query) && (!status || person.duty_status === status);
  });

  tbody.innerHTML = filtered.map(person => {
    const isActive = person.account_status === "active";
    const nextStatus = isActive ? "suspended" : "active";
    const appAction = person.application_status === "pending"
      ? `<button type="button" data-admin-action="staff-application" data-id="${person.user_id}" data-status="approved">Approve</button>
         <button type="button" data-admin-action="staff-application" data-id="${person.user_id}" data-status="rejected">Reject</button>`
      : "";
    return `<tr>
      <td>S${String(person.user_id).padStart(3, "0")}</td>
      <td>${safeText(adminPersonName(person))}</td>
      <td>${safeText(person.email)}</td>
      <td>${safeText(person.contact_number || "—")}</td>
      <td>${adminBadge(person.duty_status)}${person.application_status !== "approved" ? `<small>${safeText(adminStatusLabel(person.application_status))} application</small>` : ""}</td>
      <td><div class="actions">
        ${appAction}
        <button type="button" data-admin-action="staff-status" data-id="${person.user_id}" data-status="${nextStatus}">
          ${isActive ? "Suspend" : "Activate"}
        </button>
      </div></td>
    </tr>`;
  }).join("") || '<tr><td colspan="6" class="empty">No matching staff found.</td></tr>';

  const count = document.getElementById("staffCount");
  if (count) count.textContent = `Showing ${filtered.length} of ${adminDashboardState.staff.length} staff`;
}

async function loadAdminReports() {
  const result = await apiRequest("/admin/reports");
  adminDashboardState.reports = result.reports || [];
  renderAdminReports();
}

function reportProgressGroup(status) {
  if (["accepted", "en_route", "arrived"].includes(status)) return "in_progress";
  if (["rescued", "brought_to_vet", "brought_to_shelter"].includes(status)) return "resolved";
  return status;
}

function renderAdminReports() {
  const tbody = document.getElementById("reportRows");
  if (!tbody) return;
  const query = (document.getElementById("reportSearch")?.value || "").toLowerCase();
  const status = document.getElementById("reportStatus")?.value || "";
  const range = document.getElementById("reportDateRange")?.value || "7";
  const cutoff = range === "all" ? null : Date.now() - Number(range) * 24 * 60 * 60 * 1000;

  const filtered = adminDashboardState.reports.filter(report => {
    const searchable = [report.report_id, report.location_address, report.animal_type,
      report.animal_description, report.reporter_name, report.status].join(" ").toLowerCase();
    const dateMatches = !cutoff || new Date(report.created_at).getTime() >= cutoff;
    const statusMatches = !status || report.status === status;
    const group = reportProgressGroup(report.status);
    const quickStatusMatches =
  !adminDashboardState.reportStatusFilter ||
  adminDashboardState.reportStatusFilter.split(",").includes(group);

const urgencyMatches =
  !adminDashboardState.reportUrgencyFilter ||
  adminDashboardState.reportUrgencyFilter.split(",").includes(report.urgency);
    return searchable.includes(query) && dateMatches && statusMatches && quickStatusMatches && urgencyMatches;
  });

  const statusOptions = ["reported", "accepted", "en_route", "arrived", "rescued",
    "brought_to_vet", "brought_to_shelter", "rejected"];

  tbody.innerHTML = filtered.map(report => {
    const options = statusOptions.map(option =>
      `<option value="${option}" ${report.status === option ? "selected" : ""}>${safeText(adminStatusLabel(option))}</option>`
    ).join("");
    const photo = report.photo_url
      ? `<img src="${safeText(report.photo_url)}" alt="Animal" class="admin-report-image">`
      : '<span class="report-photo"></span>';
    return `<tr>
      <td><input type="checkbox" aria-label="Select report ${report.report_id}"></td>
      <td>RP-${String(report.report_id).padStart(3, "0")}</td>
      <td>${photo}</td>
      <td>${safeText(report.animal_type)}<br><small>${safeText(report.condition)}</small></td>
      <td>${safeText(report.location_address)}</td>
      <td>${safeText(displayDate(report.created_at))}</td>
      <td>${adminBadge(report.status)}</td>
      <td>${adminBadge(report.urgency)}</td>
      <td><div class="actions">
        <select aria-label="New report status" data-report-status-select="${report.report_id}">${options}</select>
        <button type="button" data-admin-action="report-status" data-id="${report.report_id}">Save</button>
      </div></td>
    </tr>`;
  }).join("") || '<tr><td colspan="9" class="empty">No matching reports found.</td></tr>';

  const count = document.querySelector("#reports .pagination > span");
  if (count) count.textContent = `Showing ${filtered.length} of ${adminDashboardState.reports.length} reports`;
}

function bindAdminDashboardEvents() {

  // ==========================================
  // DASHBOARD PAGE NAVIGATION
  // ==========================================

  const pages = document.querySelectorAll(".page");
  const navButtons = document.querySelectorAll(".nav [data-page]");
  const topTitle = document.getElementById("topTitle");

  function showAdminPage(pageName) {
    const target = document.getElementById(pageName);

    if (!target) {
      console.warn("Admin page not found:", pageName);
      return;
    }

    // Hide every page.
    pages.forEach(page => {
      page.classList.add("hidden");
    });

    // Show selected page.
    target.classList.remove("hidden");

    // Update active navigation button.
    navButtons.forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page === pageName
      );
    });

    // Update topbar title.
    const titles = {
      dashboard: "Dashboard",
      users: "User Management",
      staff: "Staff Management",
      reports: "Report Management"
    };

    if (topTitle) {
      topTitle.textContent = titles[pageName] || "Dashboard";
    }
  }

  // Navigation buttons.
  navButtons.forEach(button => {
    button.addEventListener("click", () => {
      showAdminPage(button.dataset.page);
    });
  });

  // Review reports button.
  document.querySelectorAll('[data-go="reports"]').forEach(button => {
    button.addEventListener("click", () => {
      showAdminPage("reports");
    });
  });

  // ==========================================
  // ACCOUNT MANAGEMENT DROPDOWN
  // ==========================================

  const accountToggle = document.getElementById("accountToggle");
  const accountSubmenu = document.getElementById("accountSubmenu");

  accountToggle?.addEventListener("click", () => {
    const isExpanded =
      accountToggle.getAttribute("aria-expanded") === "true";

    accountToggle.setAttribute("aria-expanded", String(!isExpanded));

accountToggle.classList.toggle("open", !isExpanded);

accountSubmenu?.classList.toggle("open", !isExpanded);
  });

  // Automatically open Account Management when
  // User Management or Staff Management is selected.
  navButtons.forEach(button => {
    if (button.dataset.page === "users" || button.dataset.page === "staff") {
      button.addEventListener("click", () => {
        accountToggle?.setAttribute("aria-expanded", "true");
accountToggle?.classList.add("open");
accountSubmenu?.classList.add("open");
      });
    }
  });

  // Start on Dashboard.
  showAdminPage("dashboard");

  ["userSearch", "staffSearch", "reportSearch"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", () => {
      if (id === "userSearch") renderAdminUsers();
      if (id === "staffSearch") renderAdminStaff();
      if (id === "reportSearch") renderAdminReports();
    });
  });
  ["userStatus", "staffStatus", "reportStatus", "reportDateRange"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", () => {
      if (id === "userStatus") renderAdminUsers();
      if (id === "staffStatus") renderAdminStaff();
      if (id === "reportStatus" || id === "reportDateRange") renderAdminReports();
    });
  });

  // Multiple report status filters
document.querySelectorAll("[data-report-status-filter]").forEach(input => {
  input.addEventListener("change", () => {
    const selected = [
      ...document.querySelectorAll("[data-report-status-filter]:checked")
    ].map(el => el.dataset.reportStatusFilter);

    adminDashboardState.reportStatusFilter = selected.join(",");
    renderAdminReports();
  });
});

// Multiple report urgency filters
document.querySelectorAll("[data-report-urgency-filter]").forEach(input => {
  input.addEventListener("change", () => {
    const selected = [
      ...document.querySelectorAll("[data-report-urgency-filter]:checked")
    ].map(el => el.dataset.reportUrgencyFilter);

    adminDashboardState.reportUrgencyFilter = selected.join(",");
    renderAdminReports();
  });
});

  document.getElementById("clearFilters")?.addEventListener("click", () => {
    ["reportSearch", "reportStatus"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const dateRange = document.getElementById("reportDateRange");
    if (dateRange) dateRange.value = "all";
    document.querySelectorAll(".filter-box input").forEach(input => { input.checked = false; });
    const quickStatusMatches =
  !adminDashboardState.reportStatusFilter ||
  adminDashboardState.reportStatusFilter.split(",").includes(group);

const urgencyMatches =
  !adminDashboardState.reportUrgencyFilter ||
  adminDashboardState.reportUrgencyFilter.split(",").includes(report.urgency);
    renderAdminReports();
  });

  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-admin-action]");
    if (!button) return;
    const action = button.dataset.adminAction;
    const id = button.dataset.id;
    button.disabled = true;
    try {
      if (action === "user-status") {
        await apiRequest(`/admin/users/${id}/status`, {
          method: "PATCH", body: JSON.stringify({ status: button.dataset.status })
        });
        await Promise.all([loadAdminUsers(), loadAdminOverview()]);
      } else if (action === "staff-status") {
        await apiRequest(`/admin/staff/${id}/status`, {
          method: "PATCH", body: JSON.stringify({ status: button.dataset.status })
        });
        await Promise.all([loadAdminStaff(), loadAdminOverview()]);
      } else if (action === "staff-application") {
        await apiRequest(`/admin/staff/${id}/application`, {
          method: "PATCH", body: JSON.stringify({ status: button.dataset.status })
        });
        await Promise.all([loadAdminStaff(), loadAdminOverview()]);
      } else if (action === "report-status") {
        const select = document.querySelector(`[data-report-status-select="${id}"]`);
        await apiRequest(`/admin/reports/${id}/status`, {
          method: "PATCH", body: JSON.stringify({ status: select?.value })
        });
        await Promise.all([loadAdminReports(), loadAdminOverview()]);
      }
    } catch (error) {
      alert(error.message);
      button.disabled = false;
    }
  });

  const modal = document.getElementById("staffModal");
  document.getElementById("addStaff")?.addEventListener("click", () => modal?.classList.add("show"));
  document.getElementById("cancelModal")?.addEventListener("click", () => modal?.classList.remove("show"));
  modal?.addEventListener("click", event => {
    if (event.target === modal) modal.classList.remove("show");
  });

  document.getElementById("staffForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fullName = document.getElementById("newName").value.trim();
    const parts = fullName.split(/\s+/);
    const firstName = parts.shift() || "";
    const lastName = parts.join(" ") || "-";
    const payload = {
      firstName,
      lastName,
      email: document.getElementById("newEmail").value.trim(),
      contactNumber: document.getElementById("newPhone").value.trim(),
      password: document.getElementById("newPassword").value
    };
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await apiRequest("/admin/staff", { method: "POST", body: JSON.stringify(payload) });
      form.reset();
      modal.classList.remove("show");
      await Promise.all([loadAdminStaff(), loadAdminOverview()]);
      alert("Rescuer account created successfully.");
    } catch (error) {
      alert(error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

// ---------------- BOOT ----------------

document.addEventListener("DOMContentLoaded", () => {
  if (document.body.classList.contains("admin-page")) initAdminDashboard();
  if (document.getElementById("casesList")) loadRescueCases();
  if (document.querySelector(".cards-grid")) loadHomeReports();
  if (document.querySelector(".overview-main-card")) loadReportDetails();
  if (document.getElementById("displayFullName")) loadProfileState();

  const user = getCurrentUser();
  document.querySelectorAll(".user-select span").forEach(el => {
    if (user) el.textContent = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  });
});