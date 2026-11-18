// ============================================================
// PAWTECT — shared script.js (organized)
// Sections:
//   1. Storage / API helpers
//   2. Auth
//   3. Profile
//   4. Map
//   5. Reports (submit + report page)
//   6. Rescue cases (list, details, progress)
//   7. Home (active cases + notifications)
//   8. Admin dashboard
//   9. Boot / navigation
// ============================================================

// ============================================================
// 1. STORAGE / API HELPERS
// ============================================================

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
    ...(options.headers || {})
  };

  if (getToken()) {
    headers.Authorization = `Bearer ${getToken()}`;
  }

  // FormData automatically sets the multipart Content-Type.
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.message || `Request failed (${response.status})`
    );
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

// ============================================================
// 2. AUTH
// ============================================================

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

    window.location.href = result.user.role === "admin"
      ? "admin-dashboard.html"
      : "landing-page.html";
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
    if (message) message.textContent = "Creating your account...";

    const result = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password
      })
    });

    let verifyText = result.message || "Account created successfully.";

    if (result.developmentVerificationToken) {
      const token = prompt(
        "Development email verification token:",
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

// ============================================================
// 3. PROFILE
// ============================================================

async function loadProfileState() {
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
  } catch (error) {
    alert(error.message);
  }
}

function triggerAvatarUpload() {
  alert("Profile photo upload is not connected yet.");
}

// ============================================================
// 4. MAP
// ============================================================

let map;
let markerData = [];
let userLocation = null;
let userLocationMarker = null;
let activeMapCategory = "all";
let activeMapSearch = "";
let placesService = null;
let nearbyPlaces = [];
let nearbyFacilityResults = [];
const facilityInfoWindow = null;

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

  placesService = new google.maps.places.PlacesService(map);
  getUserLocation();
  loadMapReports();
}

function getUserLocation() {
  const list = document.getElementById("nearestLocationsList");

  if (!navigator.geolocation) {
    if (list) {
      list.innerHTML = `<div class="nearest-empty">Your browser does not support location detection.</div>`;
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function (position) {
      userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
      map.setCenter(userLocation);
      map.setZoom(14);

      if (userLocationMarker) userLocationMarker.setMap(null);

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

      loadNearbyFacilities();
    },
    function (error) {
      console.warn("Location error:", error.message);
      if (list) {
        list.innerHTML = `
          <div class="nearest-empty">
            <i class="fa-solid fa-location-crosshairs"></i><br>
            Unable to access your location.
            Please allow location permission and try again.
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

function loadNearbyFacilities() {
  if (!placesService || !userLocation) return;

  const location = new google.maps.LatLng(userLocation.lat, userLocation.lng);
  nearbyPlaces = [];

  const searches = [
    { category: "clinic", request: { location, radius: 15000, type: "veterinary_care" } },
    { category: "shelter", request: { location, radius: 15000, keyword: "animal shelter" } },
    { category: "shelter", request: { location, radius: 15000, keyword: "animal rescue center" } }
  ];

  let completedSearches = 0;
  const list = document.getElementById("nearestLocationsList");

  if (list) {
    list.innerHTML = `
      <div class="nearest-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>Finding nearby animal facilities...</span>
      </div>`;
  }

  function finishSearch() {
    completedSearches++;
    if (completedSearches === searches.length) {
      addNearbyFacilityMarkers();
      updateMapDisplay();
    }
  }

  searches.forEach(search => {
    function requestPage() {
      placesService.nearbySearch(search.request, (results, status, pagination) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          results.forEach(place => {
            if (!place.place_id || !place.geometry?.location) return;
            const existing = nearbyPlaces.find(item => item.place_id === place.place_id);
            if (!existing) {
              nearbyPlaces.push({ ...place, facilityCategory: search.category });
            }
          });
        }

        if (pagination && pagination.hasNextPage) {
          setTimeout(() => pagination.nextPage(), 2000);
        } else {
          finishSearch();
        }
      });
    }
    requestPage();
  });
}

function getFacilityType(place) {
  const name = (place.name || "").toLowerCase();
  const types = place.types || [];

  if (
    name.includes("animal shelter") ||
    name.includes("rescue center") ||
    name.includes("animal rescue") ||
    name.includes("shelter")
  ) return "Animal Shelter / Rescue Center";

  if (name.includes("animal hospital") || name.includes("pet hospital")) {
    return "Animal Hospital";
  }

  if (
    types.includes("veterinary_care") ||
    name.includes("veterinary") ||
    name.includes("vet clinic")
  ) return "Veterinary Clinic";

  if (place.facilityCategory === "shelter") return "Animal Shelter / Rescue Center";

  return "Animal Care Facility";
}

function addNearbyFacilityMarkers() {
  markerData = markerData.filter(item => {
    if (item.type === "shelter" || item.type === "clinic") {
      item.marker.setMap(null);
      return false;
    }
    return true;
  });

  const infoWindow = new google.maps.InfoWindow();

  nearbyPlaces.forEach(place => {
    const position = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng()
    };

    const facilityType = getFacilityType(place);

    const marker = new google.maps.Marker({
      position,
      map,
      title: place.name,
      icon: {
        url: place.facilityCategory === "shelter"
          ? "https://maps.google.com/mapfiles/ms/icons/green-dot.png"
          : "https://maps.google.com/mapfiles/ms/icons/blue-dot.png"
      }
    });

    marker.addListener("click", () => {
      infoWindow.setContent(`
        <div style="padding:6px;color:#6E3419;font-family:'Plus Jakarta Sans',sans-serif;">
          <strong>${safeText(place.name)}</strong>
          <p>${safeText(facilityType)}</p>
          <span>${safeText(place.vicinity || "")}</span>
        </div>
      `);
      infoWindow.open(map, marker);
    });

    markerData.push({
      marker,
      type: place.facilityCategory,
      title: (place.name || "").toLowerCase(),
      name: place.name || "Unnamed Facility",
      info: facilityType,
      searchText: `${place.name || ""} ${facilityType} ${place.vicinity || ""}`.toLowerCase(),
      position,
      place
    });
  });
}

function renderNearbyFacilities() {
  const list = document.getElementById("nearestLocationsList");
  const count = document.getElementById("nearestCount");
  if (!list || !userLocation) return;

  const filtered = nearbyPlaces
    .map(place => {
      const position = {
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng()
      };
      return {
        ...place,
        position,
        distance: calculateDistance(userLocation, position),
        facilityType: getFacilityType(place)
      };
    })
    .filter(place => {
      const categoryMatches =
        activeMapCategory === "all" || activeMapCategory === place.facilityCategory;

      const searchableText = `
        ${place.name || ""}
        ${place.facilityType}
        ${place.vicinity || ""}
      `.toLowerCase();

      return categoryMatches && searchableText.includes(activeMapSearch);
    })
    .sort((a, b) => a.distance - b.distance);

  nearbyFacilityResults = filtered;

  if (count) count.textContent = `${filtered.length} Locations`;

  if (!filtered.length) {
    list.innerHTML = `
      <div class="nearest-empty">
        <i class="fa-solid fa-circle-info"></i>
        <p>No nearby animal facilities found.</p>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map((place, index) => {
    const icon = place.facilityCategory === "shelter" ? "fa-house" : "fa-house-medical";
    const distanceText = place.distance < 1
      ? `${Math.round(place.distance * 1000)} m away`
      : `${place.distance.toFixed(2)} km away`;

    return `
      <div class="nearest-location-item" onclick="focusNearbyFacility(${index})">
        <div class="nearest-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="nearest-info">
          <h4>${safeText(place.name || "Unnamed Facility")}</h4>
          <p>${safeText(place.facilityType)}</p>
          <small>${safeText(place.vicinity || "Address unavailable")}</small>
        </div>
        <div class="nearest-distance">${distanceText}</div>
      </div>`;
  }).join("");
}

function focusNearbyFacility(index) {
  const place = nearbyFacilityResults[index];
  if (!place) return;

  map.panTo(place.position);
  map.setZoom(17);

  const item = markerData.find(marker => marker.place?.place_id === place.place_id);
  if (item) google.maps.event.trigger(item.marker, "click");
}

function setMapFilter(category, buttonEl) {
  document.querySelectorAll(".filter-pills .pill").forEach(btn => btn.classList.remove("active"));
  if (buttonEl) buttonEl.classList.add("active");
  activeMapCategory = category;
  updateMapDisplay();
}

function filterMapPins() {
  const input = document.getElementById("mapSearchInput");
  activeMapSearch = (input?.value || "").toLowerCase().trim();
  updateMapDisplay();
}

function updateMapDisplay() {
  markerData.forEach(item => {
    const categoryMatches = activeMapCategory === "all" || item.type === activeMapCategory;
    const searchableText = item.searchText || item.title || "";
    const searchMatches = searchableText.includes(activeMapSearch);
    item.marker.setMap(categoryMatches && searchMatches ? map : null);
  });
  renderNearbyFacilities();
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
        position,
        map,
        title: `Report #${report.report_id}`
      });

      marker.addListener("click", () => {
        infoWindow.setContent(`
          <div style="padding:6px;color:#6E3419">
            <strong>Report #${safeText(report.report_id)}</strong><br>
            ${safeText(report.animal_type)} • ${safeText(report.status)}<br>
            ${safeText(report.location_address)}
          </div>
        `);
        infoWindow.open(map, marker);
      });

      markerData.push({
        marker,
        type: "reported",
        title: `report #${report.report_id} ${report.animal_type}`.toLowerCase(),
        name: `Report #${report.report_id}`,
        info: `${report.animal_type} • ${report.status}`,
        searchText: `report #${report.report_id} ${report.animal_type} ${report.location_address}`.toLowerCase(),
        position
      });
    });

    updateMapDisplay();
  } catch (error) {
    console.warn("Could not load report markers:", error.message);
  }
}

// ============================================================
// 5. REPORTS (submit + report page)
// ============================================================

// Generic submit (used by any form calling handleReportSubmit with a strayReportForm)

async function handleReportSubmit(event) {
  event.preventDefault();

  const form = document.getElementById("strayReportForm");
  const submitButton = document.getElementById("submitReportBtn");
  const message = document.getElementById("reportFormMessage");

  if (!form || !getToken()) {
    window.location.href = "login.html";
    return;
  }

  if (!form.reportValidity()) return;

  const formData = new FormData();

  // Animal details
  formData.append(
    "animal_description",
    document.getElementById("animalDescription").value.trim()
  );

  formData.append(
    "animal_type",
    document.getElementById("animalType").value
  );

  formData.append(
    "condition",
    document.getElementById("animalCondition").value
  );

  formData.append(
    "urgency",
    document.getElementById("reportUrgency").value
  );

  // Location
  formData.append(
    "location_address",
    document.getElementById("reportLocation").value.trim()
  );

  // Coordinates
  const latitude = document.getElementById("reportLatitude")?.value;
  const longitude = document.getElementById("reportLongitude")?.value;

  if (latitude) formData.append("latitude", latitude);
  if (longitude) formData.append("longitude", longitude);

  // Upload selected photos
  selectedReportPhotos.forEach(file => {
    formData.append("photos", file);
  });

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
  }

  if (message) {
    message.textContent = "Submitting your report...";
  }

  try {
    const result = await apiRequest("/reports", {
      method: "POST",
      body: formData
    });

    selectedReportPhotos = [];

    if (message) {
      message.textContent =
        "Your report has been submitted successfully!";
    }

    const reportId = result.reportId || result.report?.report_id;

    setTimeout(() => {
      window.location.href = reportId
        ? `case-overview.html?id=${encodeURIComponent(reportId)}`
        : "rescue-cases.html";
    }, 1000);

  } catch (error) {
    console.error("Report submission failed:", error);

    if (message) {
      message.textContent =
        error.message || "Unable to submit your report. Please try again.";
    }

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML =
        '<i class="fa-solid fa-paper-plane"></i> Submit Report';
    }
  }
}


// --- Report page (photo upload + geolocation) ---

let selectedReportPhotos = [];

function initializeReportPage() {
  const form = document.getElementById("strayReportForm");
  const photoInput = document.getElementById("photoInput");
  const uploadBox = document.getElementById("photoUploadBox");
  const locationButton = document.getElementById("useReportLocationBtn");

  if (!form) return;

  if (!getToken()) {
    window.location.href = "landing-page.html";
    return;
  }

  selectedReportPhotos = [];

  uploadBox?.addEventListener("click", () => photoInput?.click());
  uploadBox?.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      photoInput?.click();
    }
  });

  photoInput?.addEventListener("change", handleReportPhotoSelection);
  locationButton?.addEventListener("click", getReportLocation);

  form.addEventListener("submit", handleReportSubmit);
}

function handleReportPhotoSelection(event) {
  const files = Array.from(event.target.files || []);
  const message = document.getElementById("photoUploadMessage");

  const validTypes = ["image/jpeg", "image/png", "image/webp"];

  if (selectedReportPhotos.length + files.length > 5) {
    if (message) message.textContent = "You can upload a maximum of 5 photos.";
    event.target.value = "";
    return;
  }

  for (const file of files) {
    if (!validTypes.includes(file.type)) {
      if (message) message.textContent = "Only JPG, PNG, and WEBP images are allowed.";
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      if (message) message.textContent = `${file.name} exceeds the 5MB limit.`;
      event.target.value = "";
      return;
    }
  }

  selectedReportPhotos.push(...files);
  renderReportPhotoPreviews();

  if (message) message.textContent = `${selectedReportPhotos.length} of 5 photos selected.`;

  event.target.value = "";
}

function renderReportPhotoPreviews() {
  const grid = document.getElementById("reportPhotoGrid");
  if (!grid) return;

  grid.querySelectorAll(".photo-preview").forEach(item => item.remove());

  selectedReportPhotos.forEach((file, index) => {
    const preview = document.createElement("div");
    preview.className = "photo-slot photo-preview";

    const image = document.createElement("img");
    image.src = URL.createObjectURL(file);
    image.alt = `Animal photo ${index + 1}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-report-photo";
    removeButton.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    removeButton.setAttribute("aria-label", `Remove photo ${index + 1}`);

    removeButton.addEventListener("click", () => {
      URL.revokeObjectURL(image.src);
      selectedReportPhotos.splice(index, 1);
      renderReportPhotoPreviews();

      const message = document.getElementById("photoUploadMessage");
      if (message) message.textContent = `${selectedReportPhotos.length} of 5 photos selected.`;
    });

    preview.append(image, removeButton);
    grid.appendChild(preview);
  });
}

function getReportLocation() {
  const locationInput = document.getElementById("reportLocation");
  const message = document.getElementById("locationMessage");
  const button = document.getElementById("useReportLocationBtn");

  if (!navigator.geolocation) {
    if (message) message.textContent = "Geolocation is not supported by your browser.";
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Getting location...";
  }

  navigator.geolocation.getCurrentPosition(
    async position => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      const latitudeInput = document.getElementById("reportLatitude");
const longitudeInput = document.getElementById("reportLongitude");

if (latitudeInput) latitudeInput.value = latitude;
if (longitudeInput) longitudeInput.value = longitude;
      if (message) message.textContent = "Location acquired successfully.";

      const mapEl = document.getElementById("reportLocationMap");
      if (mapEl) {
        mapEl.innerHTML = `
          <i class="fa-solid fa-location-dot mini-map-icon"></i>
          <span>Location selected: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}</span>
        `;
      }

      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Use my location';
      }
    },
    error => {
      const errors = {
        1: "Location permission was denied. Please allow location access.",
        2: "Your current location is unavailable.",
        3: "Location request timed out."
      };

      if (message) message.textContent = errors[error.code] || "Unable to get your location.";

      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Use my location';
      }
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

// ============================================================
// 6. RESCUE CASES
// ============================================================

let activeRescueCategory = "all";

function getRescueStatus(item, isRescuer) {
  return isRescuer ? item.case_status : item.status;
}

function rescueStatusLabel(status) {
  const labels = {
    reported: "Reported",
    accepted: "Accepted",
    en_route: "En Route",
    arrived: "Arrived",
    rescued: "Rescued",
    brought_to_vet: "Brought to Vet",
    brought_to_shelter: "Brought to Shelter",
    rejected: "Rejected",
    completed: "Completed",
    cancelled: "Cancelled",
    not_found: "Not Found"
  };
  return labels[status] || String(status || "Unknown").replaceAll("_", " ");
}

function isRescueInProgress(status) {
  return ["accepted", "en_route", "arrived"].includes(status);
}


async function loadRescueCases() {
  const list = document.getElementById("casesList");
  const resultCount = document.getElementById("casesResultCount");

  if (!list) return;

  if (!getToken()) {
    list.innerHTML = `
      <div class="cases-empty">
        <i class="fa-solid fa-lock"></i>
        <h3>Login Required</h3>
        <p>Please log in to view rescue cases.</p>
        <a href="auth.html" class="btn btn-coral">Login</a>
      </div>`;

    if (resultCount) resultCount.textContent = "0 cases";
    return;
  }

  list.innerHTML = `
    <div class="cases-loading">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <p>Loading rescue cases...</p>
    </div>`;

  try {
    const user = getCurrentUser();

    if (!user) {
      throw new Error("User information is unavailable.");
    }

    const isRescuer = user.role === "rescuer";
    let items = [];

    if (isRescuer) {
      const result = await apiRequest("/cases");
      items = result.cases || [];
    } else {
      const result = await apiRequest("/reports/mine");
      items = result.reports || [];
    }

    if (!items.length) {
      list.innerHTML = `
        <div class="cases-empty">
          <i class="fa-solid fa-paw"></i>
          <h3>No Rescue Cases Yet</h3>
          <p>
            ${isRescuer
              ? "You do not have any assigned rescue cases yet."
              : "You have not submitted any animal reports yet."}
          </p>
          ${!isRescuer
            ? '<a href="submit-report.html" class="btn btn-coral">Submit a Report</a>'
            : ""}
        </div>`;

      if (resultCount) resultCount.textContent = "0 cases";
      return;
    }

    list.innerHTML = items.map(item => {
      const animal = String(item.animal_type || "other").toLowerCase();
      const condition = item.condition || "Unknown";
      const urgency = String(item.urgency || "low").toLowerCase();
      const status = getRescueStatus(item, isRescuer);

      const reportId = item.report_id;
      const caseId = item.case_id;
      const date = item.created_at;
      const location = item.location_address || "Location not provided";
      const description = item.animal_description || "No description provided.";

      const icon = animal === "cat"
        ? "fa-cat"
        : animal === "dog"
          ? "fa-dog"
          : "fa-paw";

      const progress = isRescueInProgress(status);

      const categories = [
        animal,
        urgency,
        ...(progress ? ["progress"] : [])
      ].join(" ");

      const title = isRescuer
        ? `Case #${caseId}`
        : `Report #${reportId}`;

      const statusClass = progress
        ? "case-status-progress"
        : status === "reported"
          ? "case-status-pending"
          : ["rescued", "completed", "brought_to_vet",
             "brought_to_shelter"].includes(status)
            ? "case-status-completed"
            : "case-status-other";

      const photo = item.photo_url
        ? `<img src="${safeText(item.photo_url)}"
                alt="${safeText(animal)}"
                style="width:100%;height:100%;object-fit:cover;"
                onerror="this.style.display='none';">`
        : `<i class="fa-solid ${icon}"></i>`;

      const searchText = [
        title,
        reportId,
        caseId,
        animal,
        condition,
        urgency,
        status,
        location,
        description
      ].join(" ").toLowerCase();

      return `
        <article
          class="case-list-item"
          data-category="${safeText(categories)}"
          data-date="${safeText(date || "")}"
          data-urgency="${safeText(urgency)}"
          data-search="${safeText(searchText)}"
        >

          <div class="item-thumb">
            ${photo}
          </div>

          <div class="item-details">

            <span class="item-code">
              ${safeText(title)}
            </span>

            <div class="item-field">
              <i class="fa-solid ${icon}"></i>
              <span>${safeText(animal.toUpperCase())}</span>
              <span class="sub-label">
                ${safeText(condition)}
              </span>
            </div>

            <div class="item-field">
              <i class="fa-solid fa-align-left"></i>
              <span>${safeText(description)}</span>
            </div>

            <div class="item-field">
              <i class="fa-solid fa-location-dot"></i>
              <span>${safeText(location)}</span>
            </div>

            <div class="item-field">
              <i class="fa-solid fa-calendar-days"></i>
              <span>${safeText(displayDate(date))}</span>
            </div>

            <div class="item-field">
              <i class="fa-solid fa-circle-info"></i>
              <span>Status:</span>
              <span class="case-status ${statusClass}">
                ${safeText(rescueStatusLabel(status))}
              </span>
            </div>

          </div>

          <div class="item-right-actions">

            <div class="tag-row">
              <span class="badge badge-amber">
                ${safeText(animal)}
              </span>

              <span class="badge ${urgency === "urgent"
                ? "badge-rose"
                : "badge-amber"}">
                ${safeText(urgency)}
              </span>
            </div>

            <a href="case-details.html?id=${encodeURIComponent(reportId)}" class="btn btn-coral">
              View Details
              <i class="fa-solid fa-chevron-right"></i>
            </a>

          </div>

        </article>`;
    }).join("");

    activeRescueCategory = "all";

    document.querySelectorAll(".pill-bar .pill-btn").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.category === "all"
      );
    });

    filterRescueCases();

  } catch (error) {
    console.error("Could not load rescue cases:", error);

    list.innerHTML = `
      <div class="cases-empty">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h3>Unable to Load Cases</h3>
        <p>${safeText(error.message)}</p>
        <button class="btn btn-coral"
                onclick="loadRescueCases()">
          Try Again
        </button>
      </div>`;

    if (resultCount) {
      resultCount.textContent = "Unable to load cases";
    }
  }
}


function filterCategory(category, buttonEl) {
  activeRescueCategory = category;

  document.querySelectorAll(".pill-bar .pill-btn").forEach(button => {
    button.classList.remove("active");
  });

  if (buttonEl) buttonEl.classList.add("active");

  filterRescueCases();
}


function filterRescueCases() {
  const searchInput = document.getElementById("caseSearchInput");
  const sortSelect = document.getElementById("sortBySelect");
  const list = document.getElementById("casesList");
  const resultCount = document.getElementById("casesResultCount");

  if (!list) return;

  const query = (searchInput?.value || "").toLowerCase().trim();
  const sort = sortSelect?.value || "newest";

  const items = [...list.querySelectorAll(".case-list-item")];

  items.sort((a, b) => {
    const dateA = new Date(a.dataset.date || 0).getTime();
    const dateB = new Date(b.dataset.date || 0).getTime();

    if (sort === "oldest") return dateA - dateB;

    if (sort === "urgent") {
      const urgencyOrder = {
        urgent: 3,
        medium: 2,
        low: 1
      };

      return (urgencyOrder[b.dataset.urgency] || 0) -
             (urgencyOrder[a.dataset.urgency] || 0);
    }

    return dateB - dateA;
  });

  let visibleCount = 0;

  items.forEach(item => {
    const categories = (item.dataset.category || "").split(/\s+/);
    const searchable = item.dataset.search || "";

    const matchesCategory =
      activeRescueCategory === "all" ||
      categories.includes(activeRescueCategory);

    const matchesSearch = searchable.includes(query);

    const visible = matchesCategory && matchesSearch;

    item.style.display = visible ? "flex" : "none";

    if (visible) visibleCount++;

    list.appendChild(item);
  });

  let emptyMessage = list.querySelector(".cases-filter-empty");

  if (visibleCount === 0 && items.length > 0) {
    if (!emptyMessage) {
      emptyMessage = document.createElement("div");
      emptyMessage.className = "cases-empty cases-filter-empty";

      emptyMessage.innerHTML = `
        <i class="fa-solid fa-magnifying-glass"></i>
        <h3>No Matching Cases</h3>
        <p>Try another search term or category.</p>
      `;

      list.appendChild(emptyMessage);
    }
  } else {
    emptyMessage?.remove();
  }

  if (resultCount) {
    resultCount.textContent =
      `Showing ${visibleCount} of ${items.length} cases`;
  }
}

// --- Case overview (report details) ---

async function loadReportDetails() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  if (!getToken()) {
    window.location.href = "auth.html";
    return;
  }

  if (!id) {
    showCaseOverviewError("No report ID was provided.");
    return;
  }

  const user = getCurrentUser();

  try {
    const result = await apiRequest(
      `/cases/by-report/${encodeURIComponent(id)}`
    );

    if (!result.report) {
      throw new Error("Report details could not be found.");
    }

    renderCaseOverview(
      result.report,
      result.history || [],
      result.rescueCase || null,
      user,
      result.photos || []
    );

  } catch (error) {
    console.error("Unable to load case details:", error);

    showCaseOverviewError(
      error.message || "Unable to load case details."
    );
  }
}

function showCaseOverviewError(message) {
  const heading = document.getElementById("overviewCaseTitle");
  if (heading) heading.textContent = "Unable to load case";

  const progressMessage = document.getElementById("caseProgressMessage");
  if (progressMessage) progressMessage.textContent = message;

  const historyList = document.getElementById("caseHistoryList");
  if (historyList) {
    historyList.innerHTML = `
      <p class="case-history-empty">${safeText(message)}</p>
      <a href="rescue-cases.html" class="case-back-link">
        <i class="fa-solid fa-arrow-left"></i> Back to Rescue Cases
      </a>
    `;
  }
}

function renderCaseOverview(report, history, rescueCase, user, photos = []) {
  const reportStatus = report.status || "reported";
  const currentStatus = rescueCase?.case_status || reportStatus;
  const urgency = report.urgency || "medium";

  const heading = document.getElementById("overviewCaseTitle");
  const statusBadge = document.getElementById("overviewStatus");
  const urgencyBadge = document.getElementById("overviewUrgency");

  // Case title.
  if (heading) {
    heading.textContent = rescueCase
      ? `Rescue Case #${rescueCase.case_id}`
      : `Report #${report.report_id}`;
  }

  // Status badge.
  if (statusBadge) {
    statusBadge.textContent = formatCaseStatus(currentStatus);
    statusBadge.className = `tag ${getCaseStatusClass(currentStatus)}`;
  }

  // Urgency badge.
  if (urgencyBadge) {
    urgencyBadge.textContent = `${formatCaseUrgency(urgency)} Urgency`;

    urgencyBadge.className =
      `badge ${urgency.toLowerCase() === "urgent"
        ? "badge-rose"
        : "badge-neutral"}`;
  }

  // Main report information.
  setCaseText("overviewAnimalType", report.animal_type || "Animal");

  setCaseText(
    "overviewLocation",
    report.location_address || "Location not provided",
    "fa-solid fa-location-dot"
  );

  setCaseText(
    "overviewDate",
    displayDate(report.created_at),
    "fa-solid fa-calendar-days"
  );

  // Report photo.
  const imageBox = document.getElementById("overviewImageBox");

  if (imageBox) {
    imageBox.innerHTML = "";

    const photoUrl = report.photo_url || photos[0]?.photo_url;

    if (photoUrl) {
      const image = document.createElement("img");

      image.src = photoUrl;
      image.alt = `${report.animal_type || "Animal"} photo`;
      image.className = "overview-case-image";

      image.onerror = () => {
        imageBox.innerHTML = '<i class="fa-regular fa-image"></i>';
      };

      imageBox.appendChild(image);

    } else {
      imageBox.innerHTML = '<i class="fa-regular fa-image"></i>';
    }
  }

  // Case details.
  setCaseText("detailAnimalType", report.animal_type);
  setCaseText("detailCondition", report.condition);
  setCaseText("detailUrgency", formatCaseUrgency(urgency));
  setCaseText("detailLocation", report.location_address);
  setCaseText("detailDate", displayDate(report.created_at));
  setCaseText("detailReporter", report.reporter_name || "Not available");

  setCaseText(
    "detailDescription",
    report.animal_description || "No description provided."
  );

  // These fields are not included in your current database schema.
  setCaseText("detailBreed", "Not provided");
  setCaseText("detailSize", "Not provided");
  setCaseText("detailColor", "Not provided");

  // Progress tracker and history.
  updateCaseProgress(currentStatus);
  renderCaseHistory(history);

  // Rescuer/admin status controls.
  const controls = document.getElementById("rescuerCaseControls");

  if (controls) {
    const canUpdate = Boolean(
      rescueCase &&
      user &&
      (
        user.role === "admin" ||
        (
          user.role === "rescuer" &&
          Number(rescueCase.rescuer_id) === Number(user.userId)
        )
      )
    );

    controls.style.display = canUpdate ? "flex" : "none";

    if (canUpdate) {
      const statusSelect = document.getElementById("caseStatusSelect");
      const updateButton = document.getElementById("updateCaseStatusBtn");

      if (statusSelect) {
        statusSelect.value = getNextCaseStatus(currentStatus);
      }

      if (updateButton) {
        updateButton.onclick = () => {
          updateRescueCaseStatus(rescueCase.case_id);
        };
      }
    }
  }
}

function setCaseText(id, value, iconClass = null) {
  const element = document.getElementById(id);
  if (!element) return;

  element.textContent = value || "--";

  if (iconClass) {
    element.innerHTML = "";
    const icon = document.createElement("i");
    icon.className = iconClass;
    element.appendChild(icon);
    element.appendChild(document.createTextNode(` ${value || "--"}`));
  }
}

function formatCaseStatus(status) {
  const labels = {
    reported: "Reported",
    accepted: "Accepted",
    en_route: "En Route",
    arrived: "Arrived",
    rescued: "Rescued",
    completed: "Completed",
    brought_to_vet: "Brought to Vet",
    brought_to_shelter: "Brought to Shelter",
    not_found: "Animal Not Found",
    cancelled: "Cancelled",
    rejected: "Rejected"
  };

  return labels[status] ||
    String(status || "Unknown").replaceAll("_", " ");
}

function formatCaseUrgency(urgency) {
  if (!urgency) return "Medium";
  return urgency.charAt(0).toUpperCase() + urgency.slice(1).toLowerCase();
}

function getCaseStatusClass(status) {
  const classes = {
    reported: "tag-reported",
    accepted: "tag-accepted",
    en_route: "tag-progress",
    arrived: "tag-progress",
    rescued: "tag-completed",
    completed: "tag-completed",
    brought_to_vet: "tag-completed",
    brought_to_shelter: "tag-completed",
    not_found: "tag-cancelled",
    cancelled: "tag-cancelled",
    rejected: "tag-cancelled"
  };

  return classes[status] || "tag-reported";
}

function getNextCaseStatus(status) {
  const nextStatuses = {
    accepted: "en_route",
    en_route: "arrived",
    arrived: "completed",
    reported: "en_route"
  };
  return nextStatuses[status] || "completed";
}

function updateCaseProgress(status) {
  const steps = document.querySelectorAll("#caseTimeline .step");
  const fill = document.getElementById("caseProgressFill");
  const message = document.getElementById("caseProgressMessage");

  const stages = ["reported", "accepted", "en_route", "arrived", "completed"];
  const normalizedStatus = status === "rescued" ? "completed" : status;
  const index = stages.indexOf(normalizedStatus);
  const terminalStatus = ["cancelled", "not_found"].includes(status);

  if (terminalStatus) {
    steps.forEach(step => step.classList.remove("active", "completed"));
    if (fill) fill.style.width = "0%";
    if (message) {
      message.textContent = status === "not_found"
        ? "The reported animal could not be found at the location."
        : "This rescue operation has been cancelled.";
    }
    return;
  }

  const currentIndex = index >= 0 ? index : 0;

  steps.forEach((step, stepIndex) => {
    const completed = stepIndex < currentIndex;
    const active = stepIndex === currentIndex;

    step.classList.toggle("completed", completed);
    step.classList.toggle("active", active);

    const node = step.querySelector(".step-node");
    if (node) {
      node.innerHTML = completed ? '<i class="fa-solid fa-check"></i>' : String(stepIndex + 1);
    }
  });

  const progressPercentage = (currentIndex / (stages.length - 1)) * 100;
  if (fill) fill.style.width = `${progressPercentage}%`;

  if (message) {
    const messages = [
      "Your report has been successfully submitted.",
      "A rescuer has accepted this report.",
      "The rescuer is currently on the way.",
      "The rescuer has arrived at the reported location.",
      "The rescue has been successfully completed."
    ];
    message.textContent = messages[currentIndex];
  }
}

function renderCaseHistory(history) {
  const container = document.getElementById("caseHistoryList");
  if (!container) return;

  if (!history.length) {
    container.innerHTML = `<p class="case-history-empty">No case history is available yet.</p>`;
    return;
  }

  container.innerHTML = "";

  history.forEach(item => {
    const entry = document.createElement("div");
    entry.className = "case-history-item";

    const status = document.createElement("div");
    status.className = "case-history-status";
    status.textContent = formatCaseStatus(item.new_status);

    const remarks = document.createElement("p");
    remarks.textContent = item.remarks || "Status updated.";

    const date = document.createElement("small");
    date.textContent = displayDate(item.created_at);

    entry.append(status, remarks, date);
    container.appendChild(entry);
  });
}

async function updateRescueCaseStatus(caseId) {
  const statusSelect = document.getElementById("caseStatusSelect");
  const updateButton = document.getElementById("updateCaseStatusBtn");
  if (!statusSelect || !caseId) return;

  const status = statusSelect.value;
  const confirmation = confirm(
    `Are you sure you want to update this rescue case to "${formatCaseStatus(status)}"?`
  );
  if (!confirmation) return;

  try {
    if (updateButton) {
      updateButton.disabled = true;
      updateButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
    }

    await apiRequest(`/cases/${encodeURIComponent(caseId)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        remarks: `Case status changed to ${formatCaseStatus(status)}.`
      })
    });

    alert("Rescue case status updated successfully.");
    await loadReportDetails();
  } catch (error) {
    console.error("Unable to update rescue case:", error);
    alert(error.message || "Unable to update the rescue case.");
  } finally {
    if (updateButton) {
      updateButton.disabled = false;
      updateButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update Status';
    }
  }
}

// --- Case progress details page ---

async function loadCaseProgressDetails() {
  const id = new URLSearchParams(window.location.search).get("id");

  if (!getToken()) {
    window.location.href = "auth.html";
    return;
  }

  if (!id) {
    showProgressDetailsError("No report ID was provided.");
    return;
  }

  try {
    const result = await apiRequest(
      `/cases/by-report/${encodeURIComponent(id)}`
    );

    if (!result.report) {
      throw new Error("Report details could not be found.");
    }

    renderCaseProgressDetails(
      result.report,
      result.history || [],
      result.rescueCase,
      result.photos || []
    );

  } catch (error) {
    console.error("Unable to load case progress:", error);
    showProgressDetailsError(
      error.message || "Unable to load case progress."
    );
  }
}


function renderCaseProgressDetails(report, history, rescueCase, photos = []) {
  const status = rescueCase?.status || report.report_status || "reported";

  const caseNumber = document.getElementById("progressCaseNumber");
  const statusBadge = document.getElementById("progressCaseStatus");

  if (caseNumber) {
    caseNumber.textContent = rescueCase
      ? `Case #${rescueCase.case_id}`
      : `Report #${report.report_id}`;
  }

  if (statusBadge) {
    statusBadge.textContent = formatCaseStatus(status);
    statusBadge.className = `tag ${getCaseStatusClass(status)}`;
  }

  setProgressDetailText(
    "progressReportType",
    `${report.animal_type || "Animal"} Report`
  );

  setProgressDetailText(
    "progressLocation",
    report.location_address || "Location not provided"
  );

  setProgressDetailText(
    "progressDate",
    displayDate(report.created_at)
  );

  setProgressDetailText(
    "progressCondition",
    report.condition || "Not specified"
  );

  setProgressDetailText(
    "progressUrgency",
    `${formatCaseUrgency(report.urgency)} Urgency`
  );

  const imageContainer = document.getElementById("progressCaseImage");

  if (imageContainer) {
    imageContainer.innerHTML = "";

    const photoUrl = report.photo_url || photos[0]?.photo_url;

    if (photoUrl) {
      const image = document.createElement("img");

      image.src = photoUrl;
      image.alt = `${report.animal_type || "Reported animal"} photo`;
      image.className = "progress-case-image";

      image.onerror = () => {
        imageContainer.innerHTML = '<i class="fa-solid fa-paw"></i>';
      };

      imageContainer.appendChild(image);

    } else {
      const icon = document.createElement("i");

      icon.className =
        report.animal_type?.toLowerCase() === "dog"
          ? "fa-solid fa-dog"
          : report.animal_type?.toLowerCase() === "cat"
            ? "fa-solid fa-cat"
            : "fa-solid fa-paw";

      imageContainer.appendChild(icon);
    }
  }

  updateProgressDetailsTracker(status);
  renderProgressDetailsHistory(history);
}

function setProgressDetailText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value || "--";
}

function updateProgressDetailsTracker(status) {
  const steps = document.querySelectorAll("#progressTrackerSteps .step");
  const fill = document.getElementById("progressTrackerFill");
  const subtitle = document.getElementById("progressStageSubtitle");
  const message = document.getElementById("progressStatusMessage");

  const stages = ["reported", "accepted", "en_route", "arrived", "completed"];
  const normalizedStatus = status === "rescued" ? "completed" : status;
  const index = stages.indexOf(normalizedStatus);
  const terminalStatus = ["cancelled", "not_found"].includes(status);

  if (terminalStatus) {
    steps.forEach(step => step.classList.remove("active", "completed"));
    if (fill) fill.style.width = "0%";
    if (subtitle) subtitle.textContent = `Case status: ${formatCaseStatus(status)}`;
    if (message) {
      message.textContent = status === "not_found"
        ? "The reported animal could not be found at the location."
        : "This rescue case has been cancelled.";
    }
    return;
  }

  const currentIndex = index >= 0 ? index : 0;

  steps.forEach((step, stepIndex) => {
    const completed = stepIndex < currentIndex;
    const active = stepIndex === currentIndex;

    step.classList.toggle("completed", completed);
    step.classList.toggle("active", active);

    const node = step.querySelector(".step-node");
    if (node) {
      node.innerHTML = completed ? '<i class="fa-solid fa-check"></i>' : String(stepIndex + 1);
    }
  });

  const progressPercentage = (currentIndex / (stages.length - 1)) * 100;
  if (fill) fill.style.width = `${progressPercentage}%`;

  if (subtitle) {
    subtitle.textContent = `Stage ${currentIndex + 1} of ${stages.length}: ${formatCaseStatus(normalizedStatus)}`;
  }

  if (message) {
    const messages = [
      "Your report has been successfully submitted.",
      "A rescuer has accepted your report.",
      "The rescuer is currently on the way.",
      "The rescuer has arrived at the reported location.",
      "The rescue has been successfully completed."
    ];
    message.textContent = messages[currentIndex];
  }
}

function renderProgressDetailsHistory(history) {
  const container = document.getElementById("progressHistoryList");
  if (!container) return;

  if (!history.length) {
    container.innerHTML = `
      <p class="case-history-empty">
        No progress updates have been recorded yet.
      </p>`;
    return;
  }

  container.innerHTML = "";

  history.forEach(item => {
    const entry = document.createElement("div");
    entry.className = "case-history-item";

    const status = document.createElement("div");
    status.className = "case-history-status";
    status.textContent = formatCaseStatus(item.new_status);

    const remarks = document.createElement("p");
    remarks.textContent = item.remarks || "Status updated.";

    const date = document.createElement("small");
    date.textContent = displayDate(item.created_at);

    entry.append(status, remarks, date);
    container.appendChild(entry);
  });
}

function showProgressDetailsError(message) {
  const title = document.querySelector("#caseProgressDetailsPage .page-title-bar h2");
  if (title) title.textContent = "Unable to Load Case";

  const subtitle = document.getElementById("progressStageSubtitle");
  const statusMessage = document.getElementById("progressStatusMessage");
  const history = document.getElementById("progressHistoryList");

  if (subtitle) subtitle.textContent = "Case information unavailable.";
  if (statusMessage) statusMessage.textContent = message;

  if (history) {
    history.innerHTML = `<p class="case-history-empty">${safeText(message)}</p>`;
  }
}

// ============================================================
// 7. HOME (active cases + notifications)
// ============================================================

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

async function loadHomeReports() {
  const grid = document.querySelector(".cards-grid");
  if (!grid) return;

if (!getToken()) {
  grid.innerHTML = `
    <div class="nearest-empty">
      <i class="fa-solid fa-lock"></i>
      <p>Please log in to view your active cases.</p>
      <a href="index.html" class="btn btn-coral">Login</a>
    </div>`;
  return;
}

grid.innerHTML = '<p class="nearest-empty">Loading your active cases...</p>';

  try {
    const user = getCurrentUser();
    if (!user) {
      grid.innerHTML = "<p>Please log in to view your cases.</p>";
      return;
    }

    let items = [];
    const isRescuer = user.role === "rescuer";

    if (isRescuer) {
      const result = await apiRequest("/cases");
      items = (result.cases || []).filter(item =>
        !["completed", "cancelled", "not_found"].includes(item.case_status)
      );
    } else {
      const result = await apiRequest("/reports/mine");
      items = (result.reports || []).filter(item =>
        !["rescued", "brought_to_vet", "brought_to_shelter", "rejected"].includes(item.status)
      );
    }

    items = items.slice(0, 4);

    if (!items.length) {
      grid.innerHTML = `
        <div class="nearest-empty">
          <i class="fa-solid fa-paw"></i>
          <p>You don't have any active cases yet.</p>
        </div>`;
      return;
    }

    grid.innerHTML = items.map(item => {
      const animal = item.animal_type || "Animal";
      const isCat = animal.toLowerCase().includes("cat");
      const icon = isCat ? "fa-cat" : "fa-dog";

      const reportId = item.report_id || item.reportId;
      const caseId = item.case_id;
      const status = isRescuer ? item.case_status : item.status;
      const title = isRescuer ? `Case #${caseId}` : `Report #${item.report_id}`;

      const description = item.animal_description ||
        (item.condition ? `Condition: ${item.condition}` : "Animal report");

      const date = displayDate(item.created_at);
      const location = item.location_address || "Location not provided";
      const statusText = adminStatusLabel(status);

      return `
        <div class="case-card"
             onclick="window.location.href='case-details.html?id=${encodeURIComponent(reportId)}'"
             style="cursor:pointer;">
          <div class="card-thumb"><i class="fa-solid ${icon}"></i></div>

          <div class="card-body">
            <div class="card-title-row">
              <h4>${safeText(title)}</h4>
              <span class="tag ${isRescuer ? "tag-assigned" : "tag-reported"}">
                ${safeText(statusText)}
              </span>
            </div>

            <ul class="meta-list">
              <li><i class="fa-solid fa-scroll"></i> ${safeText(animal)} - ${safeText(description)}</li>
              <li><i class="fa-solid fa-location-dot"></i> ${safeText(location)}</li>
              <li><i class="fa-solid fa-calendar-days"></i> ${safeText(date)}</li>
            </ul>

            <div class="status-banner ${isRescuer ? "status-coral" : "status-peach"}">
              <i class="fa-solid fa-paw"></i>
              ${isRescuer
                ? "This rescue case is assigned to you."
                : "Track the progress of your submitted report."}
            </div>
          </div>
        </div>`;
    }).join("");
  } catch (error) {
    console.error("Could not load active cases:", error);
    grid.innerHTML = `
      <p class="nearest-empty">
        Unable to load your active cases. ${safeText(error.message)}
      </p>`;
  }
}

async function loadHomeNotifications() {
  const list = document.getElementById("notificationList");
  const count = document.getElementById("notificationCount");
  if (!list) return;

if (!getToken()) {
  list.innerHTML = `
    <div class="notification-empty">
      <i class="fa-solid fa-lock"></i>
      <p>Please log in to view notifications.</p>
      <a href="index.html">Login</a>
    </div>`;

  if (count) {
    count.textContent = "0";
    count.classList.add("hidden");
  }

  return;
}

  try {
    const result = await apiRequest("/notifications");
    const notifications = result.notifications || [];
    const unreadCount = Number(result.unreadCount || 0);

    if (count) {
      count.textContent = unreadCount;
      count.classList.toggle("hidden", unreadCount === 0);
    }

    if (!notifications.length) {
      list.innerHTML = `
        <div class="notification-empty">
          <i class="fa-regular fa-bell-slash"></i>
          <p>No notifications yet.</p>
        </div>`;
      return;
    }

    list.innerHTML = notifications.map(notification => `
      <div class="notification-item ${notification.is_read ? "" : "unread"}"
           data-notification-id="${notification.notification_id}">
        <div class="notification-item-icon">
          <i class="fa-solid ${
            notification.notification_type === "rescue_update"
              ? "fa-paw"
              : notification.notification_type === "report_update"
                ? "fa-file-lines"
                : "fa-bell"
          }"></i>
        </div>

        <div class="notification-item-content">
          <strong>${safeText(notification.title)}</strong>
          <p>${safeText(notification.message)}</p>
          <small>${safeText(displayDate(notification.created_at))}</small>

          ${!notification.is_read
            ? `<button type="button" class="mark-notification-read"
                       data-mark-read="${notification.notification_id}">
                 Mark as read
               </button>`
            : ""}
        </div>

        ${!notification.is_read ? '<span class="notification-unread-dot"></span>' : ""}
      </div>
    `).join("");
  } catch (error) {
    console.error("Could not load notifications:", error);
    list.innerHTML = `<p class="notification-empty">Unable to load notifications.</p>`;
  }
}

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-mark-read]");
  if (!button) return;

  const notificationId = button.dataset.markRead;
  button.disabled = true;

  try {
    await apiRequest(`/notifications/${notificationId}/read`, { method: "PATCH" });
    await loadHomeNotifications();
  } catch (error) {
    alert(error.message);
    button.disabled = false;
  }
});

// ============================================================
// 8. ADMIN DASHBOARD
// ============================================================

const adminDashboardState = {
  users: [], staff: [], reports: [],
  reportStatusFilter: "", reportUrgencyFilter: ""
};

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

    const tasks = [
      ["Overview", loadAdminOverview],
      ["Users", loadAdminUsers],
      ["Staff", loadAdminStaff],
      ["Reports", loadAdminReports]
    ];

    const results = await Promise.allSettled(tasks.map(task => task[1]()));
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`Failed to load admin ${tasks[index][0]}:`, result.reason);
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
  // --- Page navigation ---
  const pages = document.querySelectorAll(".page");
  const navButtons = document.querySelectorAll(".nav [data-page]");
  const topTitle = document.getElementById("topTitle");

  function showAdminPage(pageName) {
    const target = document.getElementById(pageName);
    if (!target) {
      console.warn("Admin page not found:", pageName);
      return;
    }

    pages.forEach(page => page.classList.add("hidden"));
    target.classList.remove("hidden");

    navButtons.forEach(button => {
      button.classList.toggle("active", button.dataset.page === pageName);
    });

    const titles = {
      dashboard: "Dashboard",
      users: "User Management",
      staff: "Staff Management",
      reports: "Report Management"
    };

    if (topTitle) topTitle.textContent = titles[pageName] || "Dashboard";
  }

  navButtons.forEach(button => {
    button.addEventListener("click", () => showAdminPage(button.dataset.page));
  });

  document.querySelectorAll('[data-go="reports"]').forEach(button => {
    button.addEventListener("click", () => showAdminPage("reports"));
  });

  // --- Account management dropdown ---
  const accountToggle = document.getElementById("accountToggle");
  const accountSubmenu = document.getElementById("accountSubmenu");

  accountToggle?.addEventListener("click", () => {
    const isExpanded = accountToggle.getAttribute("aria-expanded") === "true";
    accountToggle.setAttribute("aria-expanded", String(!isExpanded));
    accountToggle.classList.toggle("open", !isExpanded);
    accountSubmenu?.classList.toggle("open", !isExpanded);
  });

  navButtons.forEach(button => {
    if (button.dataset.page === "users" || button.dataset.page === "staff") {
      button.addEventListener("click", () => {
        accountToggle?.setAttribute("aria-expanded", "true");
        accountToggle?.classList.add("open");
        accountSubmenu?.classList.add("open");
      });
    }
  });

  showAdminPage("dashboard");

  // --- Search & filter listeners ---
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

  document.querySelectorAll("[data-report-status-filter]").forEach(input => {
    input.addEventListener("change", () => {
      const selected = [...document.querySelectorAll("[data-report-status-filter]:checked")]
        .map(el => el.dataset.reportStatusFilter);
      adminDashboardState.reportStatusFilter = selected.join(",");
      renderAdminReports();
    });
  });

  document.querySelectorAll("[data-report-urgency-filter]").forEach(input => {
    input.addEventListener("change", () => {
      const selected = [...document.querySelectorAll("[data-report-urgency-filter]:checked")]
        .map(el => el.dataset.reportUrgencyFilter);
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

    document.querySelectorAll(".filter-box input").forEach(input => {
      input.checked = false;
    });

    adminDashboardState.reportStatusFilter = "";
    adminDashboardState.reportUrgencyFilter = "";

    renderAdminReports();
  });

  // --- Delegated admin actions ---
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

  // --- Add staff modal ---
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

// ============================================================
// 9. BOOT / NAVIGATION
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  // Page-specific initialization
  if (document.body.classList.contains("admin-page")) {
    initAdminDashboard();
  }

  if (document.getElementById("casesList")) {
    loadRescueCases();
  }

  if (document.querySelector(".cards-grid")) {
    loadHomeReports();
  }

  if (document.getElementById("notificationList")) {
    loadHomeNotifications();
  }

  if (document.querySelector(".overview-main-card")) {
    loadReportDetails();
  }

  if (document.getElementById("displayFullName")) {
    loadProfileState();
  }

  if (document.getElementById("caseProgressDetailsPage")) {
    loadCaseProgressDetails();
  }

  if (document.getElementById("strayReportForm")) {
    initializeReportPage();
  }

  // --- User account dropdown ---
  const user = getCurrentUser();
  const isLoggedIn = Boolean(getToken());

  document.querySelectorAll(".user-select span").forEach(el => {
    if (isLoggedIn && user) {
      el.textContent =
        `${user.first_name || ""} ${user.last_name || ""}`.trim()
        || user.username
        || "My Account";
    } else {
      el.textContent = "Login";
    }
  });

  const toggle = document.getElementById("userDropdownToggle");
  const dropdown = document.getElementById("userDropdown");
  const logoutButton = document.getElementById("userLogout");

  if (toggle && dropdown) {
    if (!isLoggedIn) {
      dropdown.classList.remove("show");
      dropdown.style.display = "none";

      toggle.addEventListener("click", () => {
        window.location.href = "auth.html";
      });
    } else {
      toggle.addEventListener("click", event => {
        event.stopPropagation();

        const isOpen = dropdown.classList.toggle("show");
        toggle.classList.toggle("active", isOpen);
        toggle.setAttribute("aria-expanded", String(isOpen));
      });

      document.addEventListener("click", event => {
        if (!event.target.closest(".user-dropdown-container")) {
          dropdown.classList.remove("show");
          toggle.classList.remove("active");
          toggle.setAttribute("aria-expanded", "false");
        }
      });
    }
  }

  logoutButton?.addEventListener("click", () => {
    if (confirm("Are you sure you want to log out?")) {
      logout();
    }
  });
});

// ==========================================
// PROFILE PAGE - DATABASE INTEGRATION
// ==========================================

async function loadUserProfile() {
  if (!getToken()) {
    window.location.href = "auth.html";
    return;
  }

  try {
    const result = await apiRequest("/profile/me");

    if (!result.user) {
      throw new Error("Unable to load your profile.");
    }

    displayUserProfile(result.user);

  } catch (error) {
    console.error("Profile loading error:", error);
    alert(error.message || "Unable to load your profile.");
  }
}


// Display database information on the page
function displayUserProfile(user) {
  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  const location = user.location || "Not provided";
  const note = user.profile_note || "No note added yet.";

  // Navigation
  setProfileText("navUserName", fullName || user.username || "My Account");

  // Avatar card
  setProfileText("displayFullName", fullName);
  setProfileText("displayLocation", location);
  setProfileText("displayNote", note);

  // Personal information
  setProfileText("valFullName", fullName);
  setProfileText("valLocation", location);
  setProfileText("valEmail", user.email);
  setProfileText("valContact", user.contact_number || "Not provided");

  // Fill editable inputs
  setProfileValue("inputFullName", fullName);
  setProfileValue("inputLocation", user.location || "");
  setProfileValue("inputEmail", user.email);
  setProfileValue("inputContact", user.contact_number || "");
  setProfileValue("inputNote", user.profile_note || "");
}


// Safely update text
function setProfileText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value || "--";
  }
}


// Safely update input values
function setProfileValue(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.value = value || "";
  }
}


// Show or hide an editable field
function toggleEditField(field) {
  const group = document.getElementById(`edit${field}Group`);

  if (!group) return;

  group.classList.toggle("hidden");
}


// Save profile information
async function saveProfileField(field) {
  try {
    let updateData = {};

    switch (field) {
      case "FullName": {
        const fullName = document
          .getElementById("inputFullName")
          .value.trim();

        const nameParts = fullName.split(/\s+/);

        if (nameParts.length < 2) {
          alert("Please enter your first name and last name.");
          return;
        }

        updateData = {
          firstName: nameParts.shift(),
          lastName: nameParts.join(" ")
        };

        break;
      }

      case "Location":
        updateData.location = document
          .getElementById("inputLocation")
          .value.trim();
        break;

      case "Email":
        updateData.email = document
          .getElementById("inputEmail")
          .value.trim();
        break;

      case "Contact":
        updateData.contactNumber = document
          .getElementById("inputContact")
          .value.trim();
        break;

      case "Note":
        updateData.profileNote = document
          .getElementById("inputNote")
          .value.trim();
        break;

      case "Password": {
        const newPassword = document
          .getElementById("inputPassword")
          .value;

        if (newPassword.length < 8) {
          alert("Password must be at least 8 characters long.");
          return;
        }

        const result = await apiRequest("/profile/password", {
          method: "PATCH",
          body: JSON.stringify({ newPassword })
        });

        document.getElementById("inputPassword").value = "";
        toggleEditField("Password");

        alert(result.message || "Password updated successfully.");
        return;
      }

      default:
        return;
    }

    const result = await apiRequest("/profile/me", {
      method: "PATCH",
      body: JSON.stringify(updateData)
    });

    if (result.user) {
      displayUserProfile(result.user);
    }

    toggleEditField(field);

    alert(result.message || "Profile updated successfully.");

  } catch (error) {
    console.error("Profile update error:", error);
    alert(error.message || "Unable to update your profile.");
  }
}


// Initialize profile page
document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector(".profile-layout")) {
    loadUserProfile();
  }
});