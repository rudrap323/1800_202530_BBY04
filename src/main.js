// -------------------------------------------------------------
// src/main.js
// -------------------------------------------------------------

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap";
import "/src/styles/style.css";
import { onAuthReady } from "./authentication.js"
import { auth, db } from "./firebaseConfig.js";
import { collection, getDocs } from "firebase/firestore";
import { createGroup, joinGroup } from "./groups.js";

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

async function renderMyGroups() {
  const list = document.getElementById("my-groups");
  if (!list) return;
  list.innerHTML = "";

  const user = auth.currentUser;
  if (!user) return;

  // 'users' is an array of objects, so we'll fetch and filter client-side.
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
      await createGroup(name, pw);       // writes a doc in "groups"
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
    const name = document.getElementById("join-group-name")?.value.trim();
    const pw   = document.getElementById("join-group-password")?.value;
    setButtonLoading(joinBtn, true);
    try {
      await joinGroup(name, pw);
      showAlert(`Joined "${name}".`,"success");
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
