import { db } from "./firebaseConfig.js";
import {
  doc, getDoc, updateDoc
} from "firebase/firestore";
import {
  getAuth, onAuthStateChanged
} from "firebase/auth";

// -------- State --------
let state = {
  groupId: null,
  groupDoc: null,     // latest snapshot data
  currentUser: null,  // firebase auth user
  isAdmin: false      // currentUser.uid === ownerUid
};

// -------- Helpers --------
function getDocIdFromUrl() {
  const params = new URL(window.location.href).searchParams;
  return params.get("docID");
}
function toLocalTimeString(ts) {
  try {
    if (ts?.toDate) return ts.toDate().toLocaleString();
    if (typeof ts === "number") return new Date(ts).toLocaleString();
  } catch (_) {}
  return "";
}
function $(sel) { return document.querySelector(sel); }
function show(el, on = true) {
  el?.classList[on ? "remove" : "add"]("hidden");
}

// -------- Core loaders --------
async function fetchGroup(groupId) {
  const groupRef = doc(db, "groups", groupId);
  const snap = await getDoc(groupRef);
  if (!snap.exists()) throw new Error("Group does not exist.");
  state.groupDoc = { id: snap.id, ref: groupRef, ...snap.data() };
  return state.groupDoc;
}

function computeIsAdmin() {
  const ownerUid = state.groupDoc?.ownerUid;
  state.isAdmin = !!(state.currentUser && ownerUid && state.currentUser.uid === ownerUid);
  return state.isAdmin;
}

// -------- Renderers --------
function renderGroupHeader() {
  const g = state.groupDoc || {};
  const name = g.name || "Untitled Group";
  const desc = g.description || "No group description yet.";
  const createdAt = toLocalTimeString(g.createdAt);
  const owner = (g.users || []).find(u => u.uid === g.ownerUid);
  const ownerName = owner?.displayName || g.ownerUid || "unknown";

  $("#groupName").textContent = name;

  const img = $("#groupImage");
  const code = g.code || "default-group";
  img.src = `./images/${code}.jpg`;
  img.alt = `${name} image`;

  const metaBits = [];
  metaBits.push(`Privacy: ${g.privacy || "private"}`);
  metaBits.push(`Owner: ${ownerName}`);
  if (createdAt) metaBits.push(`Created: ${createdAt}`);
  $("#groupMeta").textContent = metaBits.join(" • ");

  $("#groupDescription").textContent = desc;

  // Admin panel visibility + prefill
  show($("#adminPanel"), computeIsAdmin());
  $("#renameInput").value = name;
}

function renderMembers() {
  const host = $("#memberChips");
  const tpl = $("#memberChipTemplate");
  host.innerHTML = "";

  const members = Array.isArray(state.groupDoc?.users) ? [...state.groupDoc.users] : [];

  // sort by joinedAt asc (optional)
  members.sort((a, b) => {
    const ta = a?.joinedAt?.toMillis ? a.joinedAt.toMillis() : +new Date(a?.joinedAt || 0);
    const tb = b?.joinedAt?.toMillis ? b.joinedAt.toMillis() : +new Date(b?.joinedAt || 0);
    return ta - tb;
  });

  members.forEach(m => {
    const chip = tpl.content.cloneNode(true);
    const name = m.displayName || "Member";
    const isOwner = m.uid === state.groupDoc?.ownerUid;

    chip.querySelector(".avatar").src = m.photoURL || "/images/avatar-placeholder.png";
    chip.querySelector(".avatar").alt = `${name} avatar`;
    chip.querySelector(".name").textContent = name;
    chip.querySelector(".role").textContent = isOwner ? " • owner" : "";

    // Remove button: only visible to admin, and not on owner
    const removeBtn = chip.querySelector(".remove");
    if (state.isAdmin && !isOwner) {
      removeBtn.addEventListener("click", () => onRemoveMember(m.uid, name));
    } else {
      removeBtn.remove(); // hide entirely
    }

    host.appendChild(chip);
  });

  if (members.length === 0) {
    host.innerHTML = `<div class="meta">No members to show.</div>`;
  }
}

// -------- Admin actions --------
async function onRename() {
  const newName = $("#renameInput").value.trim();
  if (!state.isAdmin) return alert("Only the owner can rename this group.");
  if (!newName) return alert("Please enter a group name.");

  try {
    await updateDoc(state.groupDoc.ref, { name: newName });
    // update local state and re-render
    state.groupDoc.name = newName;
    renderGroupHeader();
    alert("Group renamed.");
  } catch (e) {
    console.error(e);
    alert("Failed to rename group. Check console for details.");
  }
}

async function onRemoveMember(uid, displayName) {
  if (!state.isAdmin) return alert("Only the owner can remove members.");
  if (!uid) return;

  if (!confirm(`Remove ${displayName || "this user"} from the group?`)) return;

  try {
    // filter out the user from the array and write back
    const current = Array.isArray(state.groupDoc.users) ? state.groupDoc.users : [];
    const next = current.filter(u => u.uid !== uid);

    await updateDoc(state.groupDoc.ref, { users: next });

    // reflect locally and re-render
    state.groupDoc.users = next;
    renderMembers();
    alert("Member removed.");
  } catch (e) {
    console.error(e);
    alert("Failed to remove member. Check console for details.");
  }
}

// -------- Buttons --------
function wireButtons() {
  $("#openChatBtn")?.addEventListener("click", () => {
    const gid = state.groupId;
    window.location.href = `/src/groupChat.html?docID=${encodeURIComponent(gid)}`;
  });

  $("#leaveGroupBtn")?.addEventListener("click", () => {
    alert("Leaving a group is not implemented in this template. Hook up your Firestore write here.");
  });

  $("#saveRenameBtn")?.addEventListener("click", onRename);
}

// -------- Init flow --------
async function initAfterAuth(user) {
  state.currentUser = user || null;
  state.groupId = getDocIdFromUrl();
  if (!state.groupId) {
    $("#groupName").textContent = "Group not found";
    return;
  }

  try {
    await fetchGroup(state.groupId);
    renderGroupHeader();
    renderMembers();
    // posts left as-is / not implemented here
  } catch (e) {
    console.error(e);
    $("#groupName").textContent = "Error loading group.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  wireButtons();

  const auth = getAuth();
  onAuthStateChanged(auth, (user) => {
    // Still render for non-logged users, but admin actions will be hidden.
    initAfterAuth(user);
  });
});
