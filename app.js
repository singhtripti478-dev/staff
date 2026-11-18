import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, updatePassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, addDoc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// YOUR FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyDo00xkz9zlu5crDCu3ZfpPt3-zVsypgPU",
  authDomain: "staff-eba40.firebaseapp.com",
  projectId: "staff-eba40",
  storageBucket: "staff-eba40.firebasestorage.app",
  messagingSenderId: "69026802540",
  appId: "1:69026802540:web:e65f8e40e32e37461d2149"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loader = document.getElementById("loading-screen");
const loginSection = document.getElementById("login-section");
const staffSection = document.getElementById("staff-section");
const adminSection = document.getElementById("admin-section");

let currentStaff = null;

function getTodayDate() {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
}

// 1. AUTO-RESTORE SESSION ON PAGE REFRESH
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Admin is already logged in
    loader.classList.add("hidden");
    loginSection.classList.add("hidden");
    adminSection.classList.remove("hidden");
    loadAdminData();
  } else {
    // Check if Staff is saved in localStorage
    const savedStaffId = localStorage.getItem("loggedStaffId");
    if (savedStaffId) {
      const snap = await getDoc(doc(db, "staff", savedStaffId));
      if (snap.exists()) {
        currentStaff = { id: snap.id, ...snap.data() };
        loader.classList.add("hidden");
        loginSection.classList.add("hidden");
        staffSection.classList.remove("hidden");
        loadStaffPortal();
        return;
      } else {
        localStorage.removeItem("loggedStaffId");
      }
    }
    // Nobody logged in -> show Login screen
    loader.classList.add("hidden");
    loginSection.classList.remove("hidden");
  }
});

// 2. UNIFIED LOGIN HANDLER
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const idInput = document.getElementById("login-id").value.trim();
  const passInput = document.getElementById("login-pass").value.trim();
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";

  if (idInput.includes("@")) {
    try {
      await signInWithEmailAndPassword(auth, idInput, passInput);
      // onAuthStateChanged will automatically switch to Admin view
    } catch (err) {
      errorEl.textContent = "Invalid Admin email or password.";
    }
  } else {
    const staffId = idInput.toUpperCase();
    const snap = await getDoc(doc(db, "staff", staffId));
    if (snap.exists() && snap.data().password === passInput) {
      currentStaff = { id: snap.id, ...snap.data() };
      localStorage.setItem("loggedStaffId", staffId); // Save session for refresh
      loginSection.classList.add("hidden");
      staffSection.classList.remove("hidden");
      loadStaffPortal();
    } else {
      errorEl.textContent = "Invalid Staff ID or Password.";
    }
  }
});

// 3. ADMIN PASSWORD DRAWER & UPDATE
document.getElementById("toggle-pass-modal").onclick = () => document.getElementById("admin-pass-box").classList.remove("hidden");
document.getElementById("close-pass-box").onclick = () => document.getElementById("admin-pass-box").classList.add("hidden");

document.getElementById("admin-pass-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const newPass = document.getElementById("new-admin-pass").value;
  try {
    await updatePassword(auth.currentUser, newPass);
    alert("Admin password updated successfully!");
    e.target.reset();
    document.getElementById("admin-pass-box").classList.add("hidden");
  } catch (err) {
    alert("For security, please Logout and Login again before changing your password.");
  }
});

// 4. ADMIN: ADD & REMOVE STAFF
document.getElementById("add-staff-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("s-id").value.trim().toUpperCase();
  await setDoc(doc(db, "staff", id), {
    name: document.getElementById("s-name").value.trim(),
    role: document.getElementById("s-role").value.trim(),
    salary: Number(document.getElementById("s-salary").value),
    password: document.getElementById("s-pass").value.trim()
  });
  e.target.reset();
  loadAdminData();
});

window.removeStaff = async (id) => {
  if (confirm(`Are you sure you want to remove staff ${id}?`)) {
    await deleteDoc(doc(db, "staff", id));
    loadAdminData();
  }
};

// 5. STAFF: ONCE-PER-DAY GPS PUNCH IN & OUT
function getGPSLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject("GPS not supported on this device");
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`),
      () => reject("Please allow GPS Location access in browser settings")
    );
  });
}

document.getElementById("punch-in-btn").addEventListener("click", async () => {
  const btnIn = document.getElementById("punch-in-btn");
  const status = document.getElementById("gps-status");
  btnIn.disabled = true;
  status.textContent = "Fetching GPS location...";

  try {
    const today = getTodayDate();
    // Double-check database to ensure no duplicate punch-in today
    const q = query(collection(db, "attendance"), where("staffId", "==", currentStaff.id), where("date", "==", today));
    const existing = await getDocs(q);
    if (!existing.empty) {
      status.textContent = "You have already punched in today.";
      loadStaffPortal();
      return;
    }

    const coords = await getGPSLocation();
    await addDoc(collection(db, "attendance"), {
      staffId: currentStaff.id,
      staffName: currentStaff.name,
      date: today,
      punchIn: Date.now(),
      punchOut: null,
      inCoords: coords,
      outCoords: ""
    });
    status.textContent = `Punched In successfully at ${coords}`;
    loadStaffPortal();
  } catch (err) {
    status.textContent = `Error: ${err}`;
    btnIn.disabled = false;
  }
});

document.getElementById("punch-out-btn").addEventListener("click", async () => {
  const btnOut = document.getElementById("punch-out-btn");
  const status = document.getElementById("gps-status");
  btnOut.disabled = true;
  status.textContent = "Fetching GPS location...";

  try {
    const today = getTodayDate();
    const q = query(collection(db, "attendance"), where("staffId", "==", currentStaff.id), where("date", "==", today));
    const snap = await getDocs(q);
    let todayDoc = null;
    snap.forEach((d) => { todayDoc = d; });

    if (!todayDoc) {
      status.textContent = "You must Punch In first.";
      return;
    }
    if (todayDoc.data().punchOut) {
      status.textContent = "You have already punched out for today.";
      return;
    }

    const coords = await getGPSLocation();
    await updateDoc(doc(db, "attendance", todayDoc.id), {
      punchOut: Date.now(),
      outCoords: coords
    });
    status.textContent = `Punched Out successfully at ${coords}`;
    loadStaffPortal();
  } catch (err) {
    status.textContent = `Error: ${err}`;
    btnOut.disabled = false;
  }
});

// 6. LOAD STAFF PORTAL & ENFORCE DAILY BUTTON LOCKS
async function loadStaffPortal() {
  const today = getTodayDate();
  document.getElementById("staff-welcome").textContent = `${currentStaff.name} (${currentStaff.id})`;
  document.getElementById("staff-info").textContent = `${currentStaff.role} • Base ₹${currentStaff.salary}/mo`;
  document.getElementById("today-date-label").textContent = new Date().toDateString();

  const q = query(collection(db, "attendance"), where("staffId", "==", currentStaff.id));
  const snap = await getDocs(q);
  const tbody = document.getElementById("staff-logs");
  tbody.innerHTML = "";

  let totalHours = 0;
  const uniqueDays = new Set();
  let todayRecord = null;

  const logs = [];
  snap.forEach((d) => logs.push(d.data()));
  logs.sort((a, b) => b.punchIn - a.punchIn); // Newest first

  logs.forEach((d) => {
    if (d.date === today) todayRecord = d;
    uniqueDays.add(d.date);
    const hrs = d.punchOut ? (d.punchOut - d.punchIn) / 3600000 : 0;
    totalHours += hrs;

    tbody.innerHTML += `<tr>
      <td><strong>${d.date}</strong></td>
      <td>${new Date(d.punchIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
      <td>${d.punchOut ? new Date(d.punchOut).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '<span class="status-pill active">Working</span>'}</td>
      <td>${hrs.toFixed(2)}h</td>
      <td><a class="map-link" href="https://maps.google.com/?q=${d.inCoords}" target="_blank">View GPS</a></td>
    </tr>`;
  });

  // Enforce Once-Per-Day Punch In / Punch Out Buttons
  const btnIn = document.getElementById("punch-in-btn");
  const btnOut = document.getElementById("punch-out-btn");
  const badge = document.getElementById("today-status-badge");

  if (!todayRecord) {
    btnIn.disabled = false;
    btnOut.disabled = true;
    badge.className = "status-pill pending";
    badge.textContent = "Not Punched In";
  } else if (todayRecord && !todayRecord.punchOut) {
    btnIn.disabled = true;
    btnOut.disabled = false;
    badge.className = "status-pill active";
    badge.textContent = "Punched In (Active)";
  } else {
    btnIn.disabled = true;
    btnOut.disabled = true;
    badge.className = "status-pill done";
    badge.textContent = "Completed for Today";
  }

  // Update Staff Stats
  const perDayPay = ((currentStaff.salary / 30) * uniqueDays.size).toFixed(0);
  const perHourPay = ((currentStaff.salary / 240) * totalHours).toFixed(0);
  document.getElementById("staff-days-count").textContent = uniqueDays.size;
  document.getElementById("staff-hours-count").textContent = `${totalHours.toFixed(1)}h`;
  document.getElementById("staff-salary-est").textContent = `₹${perDayPay} / ₹${perHourPay}`;
}

// 7. LOAD ADMIN DASHBOARD
async function loadAdminData() {
  const today = getTodayDate();
  const staffSnap = await getDocs(collection(db, "staff"));
  const attSnap = await getDocs(collection(db, "attendance"));

  const logs = [];
  attSnap.forEach((d) => logs.push(d.data()));
  logs.sort((a, b) => b.punchIn - a.punchIn);

  const staffTbody = document.getElementById("admin-staff-list");
  staffTbody.innerHTML = "";

  let totalStaffCount = 0;
  let totalPayrollDayWise = 0;

  staffSnap.forEach((sDoc) => {
    totalStaffCount++;
    const s = sDoc.data();
    const sLogs = logs.filter((l) => l.staffId === sDoc.id);
    const days = new Set(sLogs.map((l) => l.date)).size;
    const hrs = sLogs.reduce((sum, l) => sum + (l.punchOut ? (l.punchOut - l.punchIn) / 3600000 : 0), 0);

    const dayPay = Math.round((s.salary / 30) * days);
    const hrPay = Math.round((s.salary / 240) * hrs);
    totalPayrollDayWise += dayPay;

    staffTbody.innerHTML += `<tr>
      <td><strong>${sDoc.id}</strong></td>
      <td><strong>${s.name}</strong><br><span class="muted">${s.role}</span></td>
      <td><code>${s.password}</code></td>
      <td>₹${s.salary}</td>
      <td>${days} days (${hrs.toFixed(1)}h)</td>
      <td><strong>₹${dayPay}</strong> (Day)<br><span class="muted">₹${hrPay} (Hr)</span></td>
      <td><button class="btn-sm" onclick="removeStaff('${sDoc.id}')">Remove</button></td>
    </tr>`;
  });

  // Update Admin Summary Cards
  const presentTodayCount = new Set(logs.filter((l) => l.date === today).map((l) => l.staffId)).size;
  document.getElementById("stat-total-staff").textContent = totalStaffCount;
  document.getElementById("stat-present-today").textContent = presentTodayCount;
  document.getElementById("stat-total-payroll").textContent = `₹${totalPayrollDayWise}`;

  // Populate Attendance Logs
  const logTbody = document.getElementById("admin-logs");
  logTbody.innerHTML = "";
  logs.forEach((l) => {
    const hrs = l.punchOut ? ((l.punchOut - l.punchIn) / 3600000).toFixed(2) + "h" : '<span class="status-pill active">Active</span>';
    logTbody.innerHTML += `<tr>
      <td><strong>${l.staffName}</strong> (${l.staffId})</td>
      <td>${l.date}</td>
      <td>${new Date(l.punchIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
      <td>${l.punchOut ? new Date(l.punchOut).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "-"}</td>
      <td>${hrs}</td>
      <td><a class="map-link" href="https://maps.google.com/?q=${l.inCoords}" target="_blank">In GPS</a></td>
    </tr>`;
  });
}

// 8. LOGOUT HANDLERS
document.getElementById("staff-logout").onclick = () => {
  localStorage.removeItem("loggedStaffId");
  location.reload();
};

document.getElementById("admin-logout").onclick = async () => {
  await signOut(auth);
  location.reload();
};
