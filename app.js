import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, updatePassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, addDoc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// PASTE YOUR FIREBASE CONFIG HERE
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

const loginSection = document.getElementById("login-section");
const staffSection = document.getElementById("staff-section");
const adminSection = document.getElementById("admin-section");
let currentStaff = null;

// 1. UNIFIED LOGIN (Admin via Firebase Auth, Staff via Firestore ID/Pass)
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const idInput = document.getElementById("login-id").value.trim();
  const passInput = document.getElementById("login-pass").value.trim();
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";

  // If input contains '@', treat as Admin Login
  if (idInput.includes("@")) {
    try {
      await signInWithEmailAndPassword(auth, idInput, passInput);
      loginSection.classList.add("hidden");
      adminSection.classList.remove("hidden");
      loadAdminData();
    } catch (err) {
      errorEl.textContent = "Invalid Admin credentials.";
    }
  } else {
    // Staff Login using Staff ID & Password created by Admin
    const staffRef = doc(db, "staff", idInput.toUpperCase());
    const snap = await getDoc(staffRef);
    if (snap.exists() && snap.data().password === passInput) {
      currentStaff = { id: snap.id, ...snap.data() };
      loginSection.classList.add("hidden");
      staffSection.classList.remove("hidden");
      loadStaffPortal();
    } else {
      errorEl.textContent = "Invalid Staff ID or Password.";
    }
  }
});

// 2. ADMIN: CHANGE CREDENTIALS
document.getElementById("admin-pass-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const newPass = document.getElementById("new-admin-pass").value;
  try {
    await updatePassword(auth.currentUser, newPass);
    alert("Admin password updated successfully!");
    e.target.reset();
  } catch (err) {
    alert("Please log out and log back in before changing password.");
  }
});

// 3. ADMIN: ADD & REMOVE STAFF
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
  if (confirm(`Remove staff ${id}?`)) {
    await deleteDoc(doc(db, "staff", id));
    loadAdminData();
  }
};

// 4. STAFF: GPS PUNCH IN & PUNCH OUT
function getGPSLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject("GPS not supported");
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`),
      () => reject("Location permission denied")
    );
  });
}

document.getElementById("punch-in-btn").addEventListener("click", async () => {
  const status = document.getElementById("gps-status");
  status.textContent = "Fetching GPS location...";
  try {
    const coords = await getGPSLocation();
    const today = new Date().toISOString().split("T")[0];
    await addDoc(collection(db, "attendance"), {
      staffId: currentStaff.id,
      staffName: currentStaff.name,
      date: today,
      punchIn: Date.now(),
      punchOut: null,
      inCoords: coords,
      outCoords: ""
    });
    status.textContent = `Punched In at ${coords}`;
    loadStaffPortal();
  } catch (err) {
    status.textContent = `Error: ${err}. Please allow GPS access.`;
  }
});

document.getElementById("punch-out-btn").addEventListener("click", async () => {
  const status = document.getElementById("gps-status");
  status.textContent = "Fetching GPS location...";
  try {
    const coords = await getGPSLocation();
    const today = new Date().toISOString().split("T")[0];
    const q = query(collection(db, "attendance"), where("staffId", "==", currentStaff.id), where("date", "==", today));
    const snap = await getDocs(q);
    let openLog = null;
    snap.forEach((d) => { if (!d.data().punchOut) openLog = d; });

    if (!openLog) {
      status.textContent = "No active Punch-In found for today.";
      return;
    }
    await updateDoc(doc(db, "attendance", openLog.id), {
      punchOut: Date.now(),
      outCoords: coords
    });
    status.textContent = `Punched Out at ${coords}`;
    loadStaffPortal();
  } catch (err) {
    status.textContent = `Error: ${err}`;
  }
});

// 5. LOAD DATA & CALCULATE SALARY (Per-Day & Per-Hour)
async function loadStaffPortal() {
  document.getElementById("staff-welcome").textContent = `Hi, ${currentStaff.name} (${currentStaff.id})`;
  document.getElementById("staff-info").textContent = `Role: ${currentStaff.role} | Base Monthly Salary: ₹${currentStaff.salary}`;

  const q = query(collection(db, "attendance"), where("staffId", "==", currentStaff.id));
  const snap = await getDocs(q);
  const tbody = document.getElementById("staff-logs");
  tbody.innerHTML = "";

  let totalHours = 0;
  const uniqueDays = new Set();

  snap.forEach((docSnap) => {
    const d = docSnap.data();
    uniqueDays.add(d.date);
    const hrs = d.punchOut ? (d.punchOut - d.punchIn) / 3600000 : 0;
    totalHours += hrs;

    tbody.innerHTML += `<tr>
      <td>${d.date}</td>
      <td>${new Date(d.punchIn).toLocaleTimeString()}</td>
      <td>${d.punchOut ? new Date(d.punchOut).toLocaleTimeString() : "Active"}</td>
      <td>${hrs.toFixed(2)}h</td>
      <td><a href="https://maps.google.com/?q=${d.inCoords}" target="_blank">Map</a></td>
    </tr>`;
  });

  // Per-day calculation (assuming 30-day month) & Per-hour (assuming 8h/day = 240h/month)
  const perDayPay = ((currentStaff.salary / 30) * uniqueDays.size).toFixed(0);
  const perHourPay = ((currentStaff.salary / 240) * totalHours).toFixed(0);
  document.getElementById("staff-salary-summary").textContent =
    `Present: ${uniqueDays.size} Days (${totalHours.toFixed(1)} hrs) | Est. Salary: ₹${perDayPay} (Day-wise) / ₹${perHourPay} (Hour-wise)`;
}

async function loadAdminData() {
  const staffSnap = await getDocs(collection(db, "staff"));
  const attSnap = await getDocs(collection(db, "attendance"));

  const logs = [];
  attSnap.forEach((d) => logs.push(d.data()));

  // Populate Staff Table with Salary Calculation
  const staffTbody = document.getElementById("admin-staff-list");
  staffTbody.innerHTML = "";

  staffSnap.forEach((sDoc) => {
    const s = sDoc.data();
    const sLogs = logs.filter((l) => l.staffId === sDoc.id);
    const days = new Set(sLogs.map((l) => l.date)).size;
    const hrs = sLogs.reduce((sum, l) => sum + (l.punchOut ? (l.punchOut - l.punchIn) / 3600000 : 0), 0);

    const dayPay = ((s.salary / 30) * days).toFixed(0);
    const hrPay = ((s.salary / 240) * hrs).toFixed(0);

    staffTbody.innerHTML += `<tr>
      <td><strong>${sDoc.id}</strong></td>
      <td>${s.name}</td>
      <td>${s.role}</td>
      <td>${s.password}</td>
      <td>₹${s.salary}</td>
      <td>${days}d / ${hrs.toFixed(1)}h</td>
      <td>₹${dayPay} (Day)<br>₹${hrPay} (Hr)</td>
      <td><button class="btn-danger" onclick="removeStaff('${sDoc.id}')">Remove</button></td>
    </tr>`;
  });

  // Populate Attendance Logs Table
  const logTbody = document.getElementById("admin-logs");
  logTbody.innerHTML = "";
  logs.forEach((l) => {
    const hrs = l.punchOut ? ((l.punchOut - l.punchIn) / 3600000).toFixed(2) + "h" : "Active";
    logTbody.innerHTML += `<tr>
      <td>${l.staffName} (${l.staffId})</td>
      <td>${l.date}</td>
      <td>${new Date(l.punchIn).toLocaleTimeString()}</td>
      <td>${l.punchOut ? new Date(l.punchOut).toLocaleTimeString() : "-"}</td>
      <td>${hrs}</td>
      <td><a href="https://maps.google.com/?q=${l.inCoords}" target="_blank">In GPS</a></td>
    </tr>`;
  });
}

// Logout handlers
document.getElementById("staff-logout").onclick = () => location.reload();
document.getElementById("admin-logout").onclick = async () => { await signOut(auth); location.reload(); };
