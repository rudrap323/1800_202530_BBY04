// -------------------------------------------------------------
// src/groups.js
// -------------------------------------------------------------
// Firestore helpers to create groups and let users join them.
// Groups store BOTH a snapshot of member info (users[]) for fast render
// and a parallel uid list (userUids[]) so we can query by membership.
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
  return (name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Create a new group document if it doesn't already exist.
 * Schema:
 * {
 *   name: string,
 *   password: string, // plaintext per your requirement
 *   createdAt: Timestamp,
 *   ownerUid: string|null,
 *   users: [ { uid, username, displayName, photoURL, email, joinedAt } ],
 *   userUids: [uid, uid, ...] // for array-contains queries
 * }
 *
 * Returns the group doc id.
 */
export async function createGroup(name, password) {
  if (!name || !password) {
    throw new Error("Group name and password are required.");
  }

  const gid = groupIdFromName(name);
  const ref = doc(db, "groups", gid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    throw new Error("A group with that name already exists.");
  }

  const uid = auth.currentUser?.uid || null;

  let userEntry = null;
  if (uid) {
    const uref = doc(db, "users", uid);
    const usnap = await getDoc(uref);
    const udoc = usnap.exists() ? usnap.data() : {};

    const username =
      udoc.username ||
      auth.currentUser.displayName ||
      (auth.currentUser.email ? auth.currentUser.email.split("@")[0] : "user");

    userEntry = {
      uid,
      username,
      displayName: udoc.displayName || auth.currentUser.displayName || username,
      photoURL: udoc.photoURL || auth.currentUser.photoURL || null,
      email: auth.currentUser.email || udoc.email || null,
      joinedAt: new Date(),
    };
  }

  const data = {
    name: name.trim(),
    password,
    createdAt: serverTimestamp(),
    ownerUid: uid,
    users: userEntry ? [userEntry] : [],
    userUids: uid ? [uid] : [],
  };

  await setDoc(ref, data);
  return gid;
}

/**
 * Join an existing group by name + password.
 * Adds the current user to users[]/userUids[] if not already present.
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

  if (!snap.exists()) throw new Error("Group not found.");

  const group = snap.data();
  if (group.deletedAt) throw new Error("This group has been deleted.");
  if (group.password !== password) throw new Error("Incorrect group password.");

  const alreadyMember =
    Array.isArray(group.users) && group.users.some((u) => u?.uid === uid);

  if (!alreadyMember) {
    const uref = doc(db, "users", uid);
    const usnap = await getDoc(uref);
    const udoc = usnap.exists() ? usnap.data() : {};

    const username =
      udoc.username ||
      auth.currentUser.displayName ||
      (auth.currentUser.email ? auth.currentUser.email.split("@")[0] : "user");

    await updateDoc(ref, {
      users: arrayUnion({
        uid,
        username,
        displayName:
          udoc.displayName || auth.currentUser.displayName || username,
        photoURL: udoc.photoURL || auth.currentUser.photoURL || null,
        email: auth.currentUser.email || udoc.email || null,
        joinedAt: new Date(),
      }),
      userUids: arrayUnion(uid),
      updatedAt: serverTimestamp(),
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
  if (group.deletedAt) return false;

  return (
    Array.isArray(group.users) &&
    group.users.some((u) => u?.uid === auth.currentUser.uid)
  );
}
