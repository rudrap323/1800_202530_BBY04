// -------------------------------------------------------------
// src/groups.js
// -------------------------------------------------------------
// Firestore helpers to create groups and let users join them.
// Patterned after signupUser in src/authentication.js
// (uses setDoc on a deterministic document id and stores metadata).
// -------------------------------------------------------------

import { auth, db } from "/src/firebaseConfig.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";

/**
 * Build a stable doc id from a group name (so names are unique).
 * Example: "Team Alpha" -> "team-alpha"
 */
function groupIdFromName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Create a new group document if it doesn't already exist.
 * Schema:
 * {
 *   name: string,
 *   password: string,        // NOTE: plaintext per your requirement
 *   createdAt: Timestamp,
 *   ownerUid: string|null,
 *   users: [ { uid, displayName, email, joinedAt } ]
 * }
 *
 * Returns the group doc id.
 */
export async function createGroup(name, password) {
  if (!name || !password) {
    throw new Error("Group name and password are required.");
  }
  const uid = auth.currentUser?.uid || null;

  const gid = groupIdFromName(name);
  const ref = doc(db, "groups", gid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    throw new Error("A group with that name already exists.");
  }

  const userEntry = uid ? {
    uid,
    displayName: auth.currentUser.displayName || null,
    email: auth.currentUser.email || null,
    joinedAt: new Date(),          // ✅ client timestamp (allowed in arrays)
  } : null;

  const data = {
    name: name.trim(),
    password,
    createdAt: serverTimestamp(),  // ✅ allowed at the root
    ownerUid: uid,
    users: userEntry ? [userEntry] : [],
  };

  await setDoc(ref, data);
  return gid;
}

/**
 * Join an existing group by name + password.
 * Adds the current user to users[] if not already present.
 * Returns the group doc id.
 */
export async function joinGroup(name, password) {
  if (!name || !password) {
    throw new Error("Group name and password are required.");
  }
  if (!auth.currentUser) {
    throw new Error("Must be logged in to join a group.");
  }
  const uid = auth.currentUser.uid;
  const gid = groupIdFromName(name);
  const ref = doc(db, "groups", gid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("Group not found.");
  }

  const group = snap.data();
  if (group.password !== password) {
    throw new Error("Incorrect group password.");
  }

  const alreadyMember =
    Array.isArray(group.users) && group.users.some(u => u?.uid === uid);

  if (!alreadyMember) {
    await updateDoc(ref, {
    users: arrayUnion({
      uid,
      displayName: auth.currentUser.displayName || null,
      email: auth.currentUser.email || null,
      joinedAt: new Date(),        // ✅ client timestamp here too
    }),
  });
  }

  return gid;
}

/** Optional helper */
export async function isMemberOfGroup(name) {
  if (!auth.currentUser) return false;
  const gid = groupIdFromName(name);
  const ref = doc(db, "groups", gid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const group = snap.data();
  return Array.isArray(group.users) && group.users.some(u => u?.uid === auth.currentUser.uid);
}
