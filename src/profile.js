import { db } from "./firebaseConfig.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";

/* =========================================================
   State & small utilities (same style as myGroup.js)
   ========================================================= */
const $ = (sel) => document.querySelector(sel);
const setTxt = (sel, v) => {
  const el = $(sel);
  if (el) el.textContent = v;
};
const fmtTime = (ts) => {
  try {
    if (ts?.toDate) return ts.toDate().toLocaleString();
    if (typeof ts === "number") return new Date(ts).toLocaleString();
  } catch {
    /* noop */
  }
  return "";
};

const state = {
  currentUser: null,
  profileUid: null,
  profileDoc: null,
  isMe: false,
  unsubGroups: null,
};

const userRef = () => doc(db, "users", state.profileUid);

/* =========================================================
   Firestore: load profile + groups
   ========================================================= */
async function loadProfile() {
  const snap = await getDoc(userRef());
  if (!snap.exists()) throw new Error("User profile not found");
  state.profileDoc = { id: snap.id, ref: userRef(), ...snap.data() };
  return state.profileDoc;
}

/* =========================================================
   Rendering (mirrors myGroup render rhythm)
   ========================================================= */
function renderHeader() {
  const u = state.profileDoc || {};

  const username =
    u.username ||
    u.displayName ||
    u.name ||
    (u.email ? u.email.split("@")[0] : "Unnamed user");

  setTxt("#profileName", u.displayName || username);
  setTxt("#profileBio", u.bio || "No bio yet.");

  const meta = [
    u.email ? `Email: ${u.email}` : null,
    u.createdAt ? `Joined: ${fmtTime(u.createdAt)}` : null,
    u.lastLoginAt ? `Last login: ${fmtTime(u.lastLoginAt)}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  setTxt("#profileMeta", meta);

  const img = $("#profileImage");
  if (img) {
    img.src = u.photoURL || "/images/avatar-placeholder.png";
    img.alt = `${u.displayName || username} avatar`;
  }

  // Edit panel visibility + seed inputs
  const panel = $("#editPanel");
  if (panel) panel.classList[state.isMe ? "remove" : "add"]("d-none");

  if (state.isMe) {
    $("#displayNameInput").value = u.displayName || "";
    $("#bioInput").value = u.bio || "";
    $("#photoUrlInput").value = u.photoURL || "";
  }
}

function renderGroups(groups) {
  const host = $("#groupChips");
  const tpl = $("#groupChipTemplate");
  if (!host || !tpl) return;

  host.innerHTML = "";

  if (!groups.length) {
    host.innerHTML = `<div class="meta">No groups yet.</div>`;
    return;
  }

  groups
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .forEach((g) => {
      const chip = tpl.content.cloneNode(true);
      chip.querySelector(".name").textContent = g.name || "Untitled Group";
      chip.querySelector(".avatar").src =
        g.code ? `./images/${g.code}.jpg` : "/images/group-placeholder.png";
      chip.querySelector(".avatar").alt = `${g.name || "Group"} image`;

      chip.querySelector(".member-chip").style.cursor = "pointer";
      chip.querySelector(".member-chip").addEventListener("click", () => {
        window.location.href = `/myGroup.html?docID=${encodeURIComponent(
          g.id
        )}`;
      });

      host.appendChild(chip);
    });
}

function watchUserGroups(uid) {
  const qy = query(
    collection(db, "groups"),
    where("userUids", "array-contains", uid)
  );

  state.unsubGroups?.();
  state.unsubGroups = onSnapshot(qy, (snap) => {
    const groups = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderGroups(groups);
  });
}

/* =========================================================
   Sync profile snapshots into groups
   ========================================================= */
async function syncUserToGroups(uid, patch) {
  const qy = query(
    collection(db, "groups"),
    where("userUids", "array-contains", uid)
  );
  const snap = await getDocs(qy);
  if (snap.empty) return;

  const batch = writeBatch(db);

  snap.forEach((gdoc) => {
    const g = gdoc.data();
    const users = Array.isArray(g.users) ? g.users : [];

    const nextUsers = users.map((m) => {
      if (m?.uid !== uid) return m;
      const next = { ...m, ...patch };
      const fallbackName =
        next.username || next.displayName || m.username || m.displayName;
      next.displayName = next.displayName || fallbackName || "Member";
      return next;
    });

    batch.update(gdoc.ref, {
      users: nextUsers,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

/* =========================================================
   Edit actions
   ========================================================= */
async function onSaveDisplayName() {
  if (!state.isMe) return;
  const newName = ($("#displayNameInput")?.value || "").trim();
  if (!newName) return alert("Display name cannot be empty.");

  try {
    await updateDoc(userRef(), {
      displayName: newName,
      username: state.profileDoc.username || newName,
      updatedAt: serverTimestamp(),
    });

    await syncUserToGroups(state.profileUid, { displayName: newName });

    state.profileDoc.displayName = newName;
    renderHeader();
    alert("Display name updated.");
  } catch (e) {
    console.error(e);
    alert("Failed to update display name.");
  }
}

async function onSaveBio() {
  if (!state.isMe) return;
  const newBio = ($("#bioInput")?.value || "").trim();

  try {
    await updateDoc(userRef(), {
      bio: newBio,
      updatedAt: serverTimestamp(),
    });
    state.profileDoc.bio = newBio;
    renderHeader();
    alert("Bio updated.");
  } catch (e) {
    console.error(e);
    alert("Failed to update bio.");
  }
}

async function onSavePhoto() {
  if (!state.isMe) return;
  const newUrl = ($("#photoUrlInput")?.value || "").trim();

  try {
    await updateDoc(userRef(), {
      photoURL: newUrl,
      updatedAt: serverTimestamp(),
    });

    await syncUserToGroups(state.profileUid, { photoURL: newUrl });

    state.profileDoc.photoURL = newUrl;
    renderHeader();
    alert("Photo updated.");
  } catch (e) {
    console.error(e);
    alert("Failed to update photo.");
  }
}

/* =========================================================
   Wiring & init
   ========================================================= */
function wire() {
  $("#saveDisplayNameBtn")?.addEventListener("click", onSaveDisplayName);
  $("#saveBioBtn")?.addEventListener("click", onSaveBio);
  $("#savePhotoBtn")?.addEventListener("click", onSavePhoto);

  $("#goGroupsBtn")?.addEventListener("click", () => {
    window.location.href = "/groups.html";
  });

  $("#signOutBtn")?.addEventListener("click", async () => {
    await signOut(getAuth());
    window.location.href = "/index.html";
  });
}

async function start(user) {
  state.currentUser = user || null;

  const params = new URL(location.href).searchParams;
  state.profileUid = params.get("uid") || user?.uid;

  if (!state.profileUid) {
    setTxt("#profileName", "No user selected.");
    return;
  }

  state.isMe = !!user && state.profileUid === user.uid;

  try {
    await loadProfile();
    renderHeader();

    // live groups membership
    watchUserGroups(state.profileUid);

    // live profile doc updates
    onSnapshot(userRef(), (snap) => {
      if (!snap.exists()) return;
      state.profileDoc = { id: snap.id, ref: userRef(), ...snap.data() };
      renderHeader();
    });
  } catch (e) {
    console.error(e);
    setTxt("#profileName", "Error loading profile.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  wire();
  onAuthStateChanged(getAuth(), (user) => start(user));
});
