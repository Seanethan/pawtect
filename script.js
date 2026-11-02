// map logi namn dito naka center sa akin kaya paki adjust pag nag open user dapat naka pinpoint kung nasan active location ng dfevice  nila
let map;
let markerData = [];

function initMap() {
  const centerLocation = { lat: 14.7011, lng: 120.9830 }; // Valenzuela / Metro Manila

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
          <strong>${loc.title}</strong><br><span>${loc.info}</span>
        </div>
      `);
      infoWindow.open(map, marker);
    });

    markerData.push({ marker: marker, type: loc.type, title: loc.title.toLowerCase() });
  });
}

function setMapFilter(category, buttonEl) {
  document.querySelectorAll('.filter-pills .pill').forEach(btn => btn.classList.remove('active'));
  buttonEl.classList.add('active');

  markerData.forEach(item => {
    if (category === 'all' || item.type === category) {
      item.marker.setMap(map);
    } else {
      item.marker.setMap(null);
    }
  });
}

function filterMapPins() {
  const query = document.getElementById('mapSearchInput').value.toLowerCase();
  markerData.forEach(item => {
    if (item.title.includes(query)) {
      item.marker.setMap(map);
    } else {
      item.marker.setMap(null);
    }
  });
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

document.addEventListener('DOMContentLoaded', loadProfileState);