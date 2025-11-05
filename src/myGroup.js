import { db } from "./firebaseConfig.js";
import {
  doc, getDoc, updateDoc, writeBatch, serverTimestamp,
  collection, query, where, limit, getDocs
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
  el?.classList[on ? "remove" : "add"]("d-none");
}
// normalize a user-entered joinKey -> slug “a-z0-9-”
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
  const joinKey = g.joinKey || state.groupId; // fallback for old docs

  $("#groupName").textContent = name;

  const img = $("#groupImage");
  const code = g.code || "default-group";
  if (img) {
    img.src = `./images/${code}.jpg`;
    img.alt = `${name} image`;
  }

  const metaBits = [];
  metaBits.push(`Privacy: ${g.privacy || "private"}`);
  metaBits.push(`Owner: ${ownerName}`);
  metaBits.push(`Join name: ${joinKey}`);
  if (createdAt) metaBits.push(`Created: ${createdAt}`);
  const metaEl = $("#groupMeta");
  if (metaEl) metaEl.textContent = metaBits.join(" • ");

  const descEl = $("#groupDescription");
  if (descEl) descEl.textContent = desc;

  // Admin panel visibility + prefill
  show($("#adminPanel"), computeIsAdmin());
  const renameInput = $("#renameInput");
  if (renameInput) renameInput.value = name;
  const joinKeyInput = $("#joinKeyInput");
  if (joinKeyInput) joinKeyInput.value = joinKey;
}

function renderMembers() {
  const host = $("#memberChips");
  const tpl = $("#memberChipTemplate");
  if (!host || !tpl) return;
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

    const avatar = chip.querySelector(".avatar");
    if (avatar) {
      avatar.src = m.photoURL || "/images/avatar-placeholder.png";
      avatar.alt = `${name} avatar`;
    }
    const nameEl = chip.querySelector(".name");
    if (nameEl) nameEl.textContent = name;

    const roleEl = chip.querySelector(".role");
    if (roleEl) roleEl.textContent = isOwner ? " • owner" : "";

    // Remove button: only visible to admin, and not on owner
    const removeBtn = chip.querySelector(".remove");
    if (removeBtn) {
      if (state.isAdmin && !isOwner) {
        removeBtn.addEventListener("click", () => onRemoveMember(m.uid, name));
      } else {
        removeBtn.remove(); // hide entirely
      }
    }

    host.appendChild(chip);
  });

  if (members.length === 0) {
    host.innerHTML = `<div class="meta">No members to show.</div>`;
  }
}

// -------- Admin actions (display name) --------
async function onRenameDisplayName() {
  const input = $("#renameInput");
  const newName = (input?.value || "").trim();
  if (!state.isAdmin) return alert("Only the owner can rename this group.");
  if (!newName) return alert("Please enter a group name.");

  try {
    await updateDoc(state.groupDoc.ref, { name: newName });
    state.groupDoc.name = newName;
    renderGroupHeader();
    alert("Group name updated.");
  } catch (e) {
    console.error(e);
    alert("Failed to rename group. Check console for details.");
  }
}

// -------- Admin actions (joinKey) --------
async function onSaveJoinKey() {
  if (!state.isAdmin) return alert("Only the owner can change the join name.");
  const input = $("#joinKeyInput");
  const raw = (input?.value || "").trim();
  const newKey = slugifyJoinKey(raw);
  if (!newKey) return alert("Join name is required (letters/numbers and dashes).");

  // if nothing really changed, bail
  const currentKey = state.groupDoc.joinKey || state.groupId;
  if (newKey === currentKey) return alert("Join name is unchanged.");

  try {
    // Client-side uniqueness check (best-effort)
    const q = query(collection(db, "groups"), where("joinKey", "==", newKey), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      // if it's this same doc, allow; else conflict
      if (snap.docs[0].id !== state.groupId) {
        return alert("That join name is already taken. Try another.");
      }
    }

    await updateDoc(state.groupDoc.ref, { joinKey: newKey });
    state.groupDoc.joinKey = newKey;
    renderGroupHeader();
    alert("Join name updated.");
  } catch (e) {
    console.error(e);
    alert("Failed to update join name. Check console for details.");
  }
}

// -------- Member removal --------
async function onRemoveMember(uid, displayName) {
  if (!state.isAdmin) return alert("Only the owner can remove members.");
  if (!uid) return;

  if (!confirm(`Remove ${displayName || "this user"} from the group?`)) return;

  try {
    const current = Array.isArray(state.groupDoc.users) ? state.groupDoc.users : [];
    const next = current.filter(u => u.uid !== uid);

    await updateDoc(state.groupDoc.ref, { users: next });

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

  $("#saveRenameBtn")?.addEventListener("click", onRenameDisplayName);
  $("#saveJoinKeyBtn")?.addEventListener("click", onSaveJoinKey);
}


// -------- Init flow --------
async function initAfterAuth(user) {
  state.currentUser = user || null;
  state.groupId = getDocIdFromUrl();
  if (!state.groupId) {
    const h = $("#groupName"); if (h) h.textContent = "Group not found";
    return;
  }

  try {
    await fetchGroup(state.groupId);
    renderGroupHeader();
    renderMembers();
  } catch (e) {
    console.error(e);
    const h = $("#groupName"); if (h) h.textContent = "Error loading group.";
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
