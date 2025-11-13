import { db } from "./firebaseConfig.js";
import {
  doc, getDoc, updateDoc, deleteDoc, serverTimestamp,
  collection, query, where, limit, getDocs,
  onSnapshot, deleteField
}  from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";

/* =========================================================
   State & small utilities
   ========================================================= */
const $ = (sel) => document.querySelector(sel);
const setTxt = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };
const fmtTime = (ts) => {
  try { if (ts?.toDate) return ts.toDate().toLocaleString(); if (typeof ts === "number") return new Date(ts).toLocaleString(); }
  catch { /* noop */ }
  return "";
};
const safeKey = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-");
const slug = (s) => (s || "").toLowerCase().trim()
  .replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/--+/g, "-").slice(0, 40);

const state = { groupId: null, groupDoc: null, currentUser: null, isAdmin: false };
const groupRef = () => doc(db, "groups", state.groupId);

/* =========================================================
   Firestore: load, defaults, pantry mutations
   ========================================================= */
async function loadGroup() {
  const snap = await getDoc(groupRef());
  if (!snap.exists()) throw new Error("Group not found");
  state.groupDoc = { id: snap.id, ref: groupRef(), ...snap.data() };
  computeIsAdmin();
  return state.groupDoc;
}

function computeIsAdmin() {
  const ownerUid = state.groupDoc?.ownerUid;
  state.isAdmin = !!(state.currentUser && ownerUid && state.currentUser.uid === ownerUid);
  return state.isAdmin;
}

const DEFAULT_PANTRY = {
  eggs:   { name: "Eggs",   amount: 12, unit: "pcs",  baseline: 6 },
  milk:   { name: "Milk",   amount: 1,  unit: "L",    baseline: 1 },
  bread:  { name: "Bread",  amount: 1,  unit: "loaf", baseline: 1 },
  butter: { name: "Butter", amount: 1,  unit: "pack", baseline: 1 },
  rice:   { name: "Rice",   amount: 2,  unit: "kg",   baseline: 1 }
};
async function ensurePantryDefaults() {
  const p = state.groupDoc?.pantry || {};
  if (Object.keys(p).length) return;
  await updateDoc(groupRef(), { pantry: DEFAULT_PANTRY, pantryUpdatedAt: serverTimestamp() });
}

const pantry = () => state.groupDoc?.pantry || {};
const upsertItem = (key, value) =>
  updateDoc(groupRef(), { [`pantry.${key}`]: value, pantryUpdatedAt: serverTimestamp() });
const deleteItem = (key) =>
  updateDoc(groupRef(), { [`pantry.${key}`]: deleteField(), pantryUpdatedAt: serverTimestamp() });

/* =========================================================
   Rendering: header, members, pantry, grocery
   ========================================================= */
function renderHeader() {
  const g = state.groupDoc || {};
  setTxt("#groupName", g.name || "Untitled Group");
  setTxt("#groupDescription", g.description || "No group description yet.");
  const meta = [
    `Privacy: ${g.privacy || "private"}`,
    `Owner: ${(g.users || []).find(u => u.uid === g.ownerUid)?.displayName || g.ownerUid || "unknown"}`,
    g.createdAt ? `Created: ${fmtTime(g.createdAt)}` : null,
    `Join name: ${g.joinKey || state.groupId}`
  ].filter(Boolean).join(" • ");
  setTxt("#groupMeta", meta);

  const img = $("#groupImage");
  if (img) {
    const code = g.code || "default-group";
    img.src = `./images/${code}.jpg`;
    img.alt = `${g.name || "Group"} image`;
  }

  // Admin panel visibility + seed inputs
  const panel = $("#adminPanel");
  if (panel) panel.classList[state.isAdmin ? "remove" : "add"]("d-none");
  const rename = $("#renameInput"); if (rename) rename.value = g.name || "";
  const joinKey = $("#joinKeyInput"); if (joinKey) joinKey.value = g.joinKey || state.groupId;
}

function renderMembers() {
  const host = $("#memberChips");
  const tpl = $("#memberChipTemplate");
  if (!host || !tpl) return;
  host.innerHTML = "";

  (Array.isArray(state.groupDoc?.users) ? state.groupDoc.users : [])
    .sort((a, b) => {
      const ta = a?.joinedAt?.toMillis?.() ?? +new Date(a?.joinedAt || 0);
      const tb = b?.joinedAt?.toMillis?.() ?? +new Date(b?.joinedAt || 0);
      return ta - tb;
    })
    .forEach(m => {
      const chip = tpl.content.cloneNode(true);
      chip.querySelector(".avatar").src = m.photoURL || "/images/avatar-placeholder.png";
      chip.querySelector(".avatar").alt = `${m.displayName || "Member"} avatar`;
      chip.querySelector(".name").textContent = m.displayName || "Member";
      const isOwner = m.uid === state.groupDoc?.ownerUid;
      const roleEl = chip.querySelector(".role");
      if (roleEl) roleEl.textContent = isOwner ? " • owner" : "";

      const removeBtn = chip.querySelector(".remove");
      if (state.isAdmin && !isOwner) removeBtn.addEventListener("click", () => onRemoveMember(m.uid, m.displayName));
      else removeBtn.remove();

      host.appendChild(chip);
    });

  if (!host.children.length) host.innerHTML = `<div class="meta">No members to show.</div>`;
}

/* ---------- Leave and Delete Buttons ---------- */
onAuthStateChanged(getAuth(), async (user) => {
  if (!user) return;

  const groupId = new URL(location.href).searchParams.get("docID");
  if (!groupId) return console.warn("No group ID found in URL");

  const ref = doc(db, "groups", groupId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return console.warn("Group not found");

  const data = snap.data();
  const deleteBtn = document.getElementById("deleteBtn");
  const leaveBtn = document.getElementById("leaveBtn");

  const isAdmin = data.ownerUid === user.uid || data.admins?.includes?.(user.uid);
  const isMember = data.users?.some?.(u => u.uid === user.uid);

  // Show correct button
  if (isAdmin && deleteBtn) deleteBtn.classList.remove("d-none");
  if (!isAdmin && isMember && leaveBtn) leaveBtn.classList.remove("d-none");

  // Leave group
  leaveBtn?.addEventListener("click", async () => {
    if (!confirm("Leave this group?")) return;
    try {
      const nextUsers = (data.users || []).filter(u => u.uid !== user.uid);
      await updateDoc(ref, { users: nextUsers });
      alert("You have left the group.");
      window.location.href = "/groups.html";
    } catch (err) {
      console.error(err);
      alert("Failed to leave the group.");
    }
  });

  // Delete group
  deleteBtn?.addEventListener("click", async () => {
    if (!confirm("Delete this group? This cannot be undone!")) return;
    try {
      await deleteDoc(ref);
      alert("Group deleted successfully.");
      window.location.href = "/groups.html";
    } catch (err) {
      console.error(err);
      alert("Failed to delete group.");
    }
  });
});


/* ---------- Pantry & Grocery ---------- */
function groceryFrom(p) {
  return Object.entries(p).reduce((acc, [key, v]) => {
    const amt = +v?.amount || 0, base = +v?.baseline || 0;
    if (base > 0 && amt < base) acc.push({ key, name: v.name || key, need: Math.ceil(base - amt), unit: v.unit || "" });
    return acc;
  }, []).sort((a, b) => a.name.localeCompare(b.name));
}

function renderPantry() {
  const tbody = $("#pantryTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const p = pantry();
  const keys = Object.keys(p).sort((a, b) => (p[a].name || a).localeCompare(p[b].name || b));

  if (!keys.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="meta">No items yet. Add something above.</td></tr>`;
    renderGrocery();
    return;
  }

  keys.forEach((k) => {
    const item = p[k];
    const tr = document.createElement("tr");

    // name
    const tdName = document.createElement("td");
    tdName.textContent = item.name || k;

    // amount (number input)
    const tdAmount = document.createElement("td"); tdAmount.className = "text-end";
    const amt = document.createElement("input");
    Object.assign(amt, { type: "number", min: "0", step: "1", value: Number(item.amount || 0) });
    amt.className = "form-control";
    amt.addEventListener("change", () => onUpdateAmount(k, Number(amt.value)));
    tdAmount.appendChild(amt);

    // unit (text input)
    const tdUnit = document.createElement("td");
    const unit = document.createElement("input");
    Object.assign(unit, { type: "text", placeholder: "Unit", value: item.unit || "" });
    unit.className = "form-control";
    unit.addEventListener("change", () => onUpdateUnit(k, unit.value));
    tdUnit.appendChild(unit);

    // baseline (admin only)
    const tdBase = document.createElement("td"); tdBase.className = "text-end";
    const base = document.createElement("input");
    Object.assign(base, { type: "number", min: "0", step: "1", value: Number(item.baseline || 0) });
    base.className = "form-control";
    base.disabled = !state.isAdmin;
    base.addEventListener("change", () => state.isAdmin && onUpdateBaseline(k, Number(base.value)));
    tdBase.appendChild(base);

    // actions
    const tdAct = document.createElement("td");
    const mkBtn = (txt, klass, cb) => {
      const b = document.createElement("button"); b.className = klass; b.textContent = txt; b.addEventListener("click", cb); return b;
    };
    tdAct.append(
      mkBtn("–", "btn btn-outline-secondary me-1", () => onNudge(k, -1)),
      mkBtn("+", "btn btn-outline-secondary me-1", () => onNudge(k, +1)),
    );
    if (state.isAdmin) tdAct.append(mkBtn("Remove", "btn btn-outline-danger", () => onRemoveItem(k)));

    tr.append(tdName, tdAmount, tdUnit, tdBase, tdAct);
    tbody.appendChild(tr);
  });

  renderGrocery();
}

function renderGrocery() {
  const list = $("#groceryList");
  if (!list) return;
  list.innerHTML = "";

  const items = groceryFrom(pantry());
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "grocery-item";
    li.innerHTML = `<span></span><div>You're all stocked!</div><span></span>`;
    list.appendChild(li);
    return;
  }

  items.forEach(({ key, name, need, unit }) => {
    const li = document.createElement("li"); li.className = "grocery-item";
    const cb = document.createElement("input"); cb.type = "checkbox"; // UI-only
    const label = document.createElement("div");
    label.innerHTML = `${name} <span class="qty">${need}${unit ? " " + unit : ""}</span>`;
    const dismiss = document.createElement("button");
    dismiss.className = "btn btn-outline-secondary";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => {
      const it = pantry()[key]; if (!it) return;
      const nextAmt = Math.max(+it.amount || 0, +it.baseline || 0);
      upsertItem(key, { ...it, amount: nextAmt }).then(renderPantry);
    });

    li.append(cb, label, dismiss);
    list.appendChild(li);
  });
}

/* =========================================================
   Pantry actions
   ========================================================= */
async function onAddItem(e) {
  e.preventDefault();
  const name = $("#addItemName").value.trim();
  const amount = Number($("#addItemAmount").value);
  const unit = ($("#addItemUnit").value || "").trim();
  if (!name || !Number.isFinite(amount) || amount < 0) return;

  const key = safeKey(name);
  const existing = pantry()[key];
  const next = existing
    ? { ...existing, name, unit, amount: Math.max(0, Math.floor((existing.amount || 0) + amount)) }
    : { name, unit, amount: Math.floor(amount), baseline: 0 };
  await upsertItem(key, next);

  $("#addItemName").value = "";
  $("#addItemAmount").value = "";
  $("#addItemUnit").value = "";
  renderPantry();
}
async function onUpdateAmount(key, newAmount) {
  const it = pantry()[key]; if (!it) return alert("This item was removed by an admin.");
  await upsertItem(key, { ...it, amount: Math.max(0, Number.isFinite(newAmount) ? Math.floor(newAmount) : 0) });
  renderPantry();
}
async function onNudge(key, delta) {
  const it = pantry()[key]; if (!it) return alert("This item was removed by an admin.");
  await upsertItem(key, { ...it, amount: Math.max(0, Math.floor((it.amount || 0) + delta)) });
  renderPantry();
}
async function onUpdateUnit(key, unit) {
  const it = pantry()[key]; if (!it) return alert("This item was removed by an admin.");
  await upsertItem(key, { ...it, unit: unit || "" });
  renderPantry();
}
async function onUpdateBaseline(key, baseline) {
  if (!state.isAdmin) return alert("Only the owner can change baselines.");
  const it = pantry()[key]; if (!it) return;
  await upsertItem(key, { ...it, baseline: Math.max(0, Number.isFinite(baseline) ? Math.floor(baseline) : 0) });
  renderPantry();
}
async function onRemoveItem(key) {
  if (!state.isAdmin) return alert("Only the group owner can remove items.");
  if (!confirm("Remove this item from the pantry?")) return;
  await deleteItem(key);
  renderPantry();
}

/* =========================================================
   Admin actions (rename, join key, member removal)
   ========================================================= */
async function onRenameDisplayName() {
  if (!state.isAdmin) return alert("Only the owner can rename this group.");
  const newName = ($("#renameInput")?.value || "").trim();
  if (!newName) return alert("Please enter a group name.");

  try { await updateDoc(groupRef(), { name: newName }); state.groupDoc.name = newName; renderHeader(); alert("Group name updated."); }
  catch (e) { console.error(e); alert("Failed to rename group."); }
}

async function onSaveJoinKey() {
  if (!state.isAdmin) return alert("Only the owner can change the join name.");
  const raw = ($("#joinKeyInput")?.value || "").trim();
  const newKey = slug(raw);
  if (!newKey) return alert("Join name is required (letters/numbers and dashes).");
  if (newKey === (state.groupDoc.joinKey || state.groupId)) return alert("Join name is unchanged.");

  try {
    const q = query(collection(db, "groups"), where("joinKey", "==", newKey), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty && snap.docs[0].id !== state.groupId) return alert("That join name is already taken. Try another.");
    await updateDoc(groupRef(), { joinKey: newKey }); state.groupDoc.joinKey = newKey; renderHeader(); alert("Join name updated.");
  } catch (e) { console.error(e); alert("Failed to update join name."); }
}

async function onRemoveMember(uid, displayName) {
  if (!state.isAdmin) return alert("Only the owner can remove members.");
  if (!uid || !confirm(`Remove ${displayName || "this user"} from the group?`)) return;
  try {
    const next = (Array.isArray(state.groupDoc.users) ? state.groupDoc.users : []).filter(u => u.uid !== uid);
    await updateDoc(groupRef(), { users: next });
    state.groupDoc.users = next;
    renderMembers();
    alert("Member removed.");
  } catch (e) { console.error(e); alert("Failed to remove member."); }
}

/* =========================================================
   Wiring & init
   ========================================================= */
function wire() {
  $("#openChatBtn")?.addEventListener("click", () => {
    // Might remove this feature if it is unfeasable to implement chat in time.
    alert("Group chat is not implemented in this template.");
    //window.location.href = `/src/groupChat.html?docID=${encodeURIComponent(state.groupId)}`;
  });
  $("#leaveGroupBtn")?.addEventListener("click", () => alert("Leaving a group is not implemented in this template."));
  $("#saveRenameBtn")?.addEventListener("click", onRenameDisplayName);
  $("#saveJoinKeyBtn")?.addEventListener("click", onSaveJoinKey);

  $("#addPantryForm")?.addEventListener("submit", onAddItem);
  $("#clearCheckedBtn")?.addEventListener("click", () =>
    document.querySelectorAll("#groceryList input[type=checkbox]").forEach(cb => (cb.checked = false)));
}

async function start(user) {
  state.currentUser = user || null;
  state.groupId = new URL(location.href).searchParams.get("docID");
  if (!state.groupId) return setTxt("#groupName", "Group not found");

  try {
    await loadGroup();
    renderHeader();
    renderMembers();
    await ensurePantryDefaults();

    // Live updates (handles admin deletes/edits immediately)
    onSnapshot(groupRef(), (snap) => {
      if (!snap.exists()) return;
      state.groupDoc = { id: snap.id, ref: groupRef(), ...snap.data() };
      computeIsAdmin();
      renderPantry();
    });

    renderPantry();
  } catch (e) {
    console.error(e);
    setTxt("#groupName", "Error loading group.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  wire();
  onAuthStateChanged(getAuth(), (user) => { start(user); });
});
