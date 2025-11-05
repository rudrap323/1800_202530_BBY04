// -------------------------------------------------------------
// src/main.js  (joinKey-enabled, fixed timestamps-in-arrays)
// -------------------------------------------------------------

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap";
import "/src/styles/style.css";
import { onAuthReady } from "./authentication.js";
import { auth, db } from "./firebaseConfig.js";
import {
  collection, getDocs, addDoc, serverTimestamp,
  query, where, limit, updateDoc, doc
} from "firebase/firestore";

const alerts = document.getElementById("alerts");
function showAlert(msg, type = "success") {
  const div = document.createElement("div");
  div.className = `alert alert-${type}`;
  div.textContent = msg;
  alerts?.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

function setButtonLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = !!loading;
  btn.dataset._orig = btn.dataset._orig || btn.textContent;
  btn.textContent = loading ? "Please wait..." : btn.dataset._orig;
}

// Simple slugifier: "My Group!!" -> "my-group"
function slugifyJoinKey(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-")
    .slice(0, 40);
}

async function renderMyGroups() {
  const list = document.getElementById("my-groups");
  if (!list) return;
  list.innerHTML = "";

  const user = auth.currentUser;
  if (!user) return;

  const snap = await getDocs(collection(db, "groups"));
  const my = [];
  snap.forEach(docSnap => {
    const g = docSnap.data();
    const isMember = Array.isArray(g.users) && g.users.some(u => u?.uid === user.uid);
    if (isMember) my.push({ id: docSnap.id, ...g });
  });

  if (my.length === 0) {
    const li = document.createElement("li");
    li.className = "list-group-item";
    li.textContent = "You haven't joined any groups yet.";
    list.appendChild(li);
    return;
  }

  for (const g of my) {
    const li = document.createElement("li");
    li.className = "list-group-item d-flex justify-content-between align-items-center";
    li.innerHTML = `<a href="/myGroup.html?docID=${g.id}">${g.name}</a>`;
    list.appendChild(li);
  }
}

/* ---------------------------
   CREATE (with joinKey)
---------------------------- */
async function createGroupJoinKeyFlow(name, password) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");

  const explicitJoinKey = document.getElementById("create-group-joinkey")?.value?.trim();
  const joinKey = explicitJoinKey ? slugifyJoinKey(explicitJoinKey) : slugifyJoinKey(name);

  if (!name) throw new Error("Group name is required.");
  if (!password) throw new Error("Password is required.");
  if (!joinKey) throw new Error("Join name is required.");

  // best-effort uniqueness check
  const q = query(collection(db, "groups"), where("joinKey", "==", joinKey), limit(1));
  const existing = await getDocs(q);
  if (!existing.empty) throw new Error("That join name is already taken. Try another.");

  // NOTE: serverTimestamp() is NOT allowed inside arrays -> use Date.now()
  const ownerUserObj = {
    uid: user.uid,
    displayName: user.displayName || user.email || "Owner",
    email: user.email || "",
    photoURL: user.photoURL || "",
    joinedAt: Date.now()
  };

  await addDoc(collection(db, "groups"), {
    name,
    joinKey,
    password,
    createdAt: serverTimestamp(),   // OK (top-level)
    ownerUid: user.uid,
    users: [ownerUserObj]           // joinedAt uses Date.now()
  });
}

/* ---------------------------
   JOIN (by joinKey)
---------------------------- */
async function joinGroupByJoinKey(joinKeyInput, passwordInput) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");

  const joinKeyRaw = (joinKeyInput || "").trim();
  const pw = (passwordInput || "");

  const joinKey = slugifyJoinKey(joinKeyRaw);
  if (!joinKey) throw new Error("Please enter the group's join name.");
  if (!pw) throw new Error("Please enter the group password.");

  const q = query(collection(db, "groups"), where("joinKey", "==", joinKey), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error("No group with that join name.");

  const docSnap = snap.docs[0];
  const g = docSnap.data();

  if (g.password !== pw) throw new Error("Incorrect password.");

  const already = Array.isArray(g.users) && g.users.some(u => u?.uid === user.uid);
  if (already) return;

  const usersNext = Array.isArray(g.users) ? g.users.slice() : [];
  usersNext.push({
    uid: user.uid,
    displayName: user.displayName || user.email || "Member",
    email: user.email || "",
    photoURL: user.photoURL || "",
    joinedAt: Date.now()            // FIX: no serverTimestamp() in arrays
  });

  await updateDoc(doc(db, "groups", docSnap.id), { users: usersNext });

  // Optional redirect after join:
  // window.location.href = `/myGroup.html?docID=${encodeURIComponent(docSnap.id)}`;
}

function wireForms() {
  // Create
  const createForm = document.getElementById("create-group-form");
  const createBtn = document.getElementById("create-group-btn");

  createForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("create-group-name")?.value.trim();
    const pw   = document.getElementById("create-group-password")?.value;
    setButtonLoading(createBtn, true);
    try {
      await createGroupJoinKeyFlow(name, pw);
      showAlert(`Group "${name}" created.`,"success");
      await renderMyGroups();
      createForm.reset();
    } catch (err) {
      console.error(err);
      showAlert(err.message || "Failed to create group.", "danger");
    } finally {
      setButtonLoading(createBtn, false);
    }
  });

  // Join
  const joinForm = document.getElementById("join-group-form");
  const joinBtn = document.getElementById("join-group-btn");

  joinForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const joinName = document.getElementById("join-group-name")?.value.trim();
    const pw       = document.getElementById("join-group-password")?.value;
    setButtonLoading(joinBtn, true);
    try {
      await joinGroupByJoinKey(joinName, pw);
      showAlert(`Joined "${joinName}".`,"success");
      await renderMyGroups();
      joinForm.reset();
    } catch (err) {
      console.error(err);
      showAlert(err.message || "Failed to join group.", "danger");
    } finally {
      setButtonLoading(joinBtn, false);
    }
  });
}

function showDashboard() {
  const nameElement = document.getElementById("name-goes-here");
  onAuthReady(async (user) => {
    if (!user) {
      location.href = "index.html";
      return;
    }
    const name = user.displayName || user.email;
    if (nameElement) nameElement.textContent = `${name}!`;
    wireForms();
    await renderMyGroups();
  });
}

showDashboard();
