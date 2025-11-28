import { db } from "./firebaseConfig.js";
import {
  collection, doc, getDoc, addDoc, serverTimestamp,
  query, orderBy, onSnapshot
} from "firebase/firestore";

import { getAuth, onAuthStateChanged } from "firebase/auth";

/* ----------------------------------------------------
   Helper shortcuts
---------------------------------------------------- */
const $ = (sel) => document.querySelector(sel);

/* ----------------------------------------------------
   Get groupId from URL
---------------------------------------------------- */
const url = new URL(location.href);
const groupId = url.searchParams.get("docID");

if (!groupId) {
  document.body.innerHTML = "<h2>Invalid group.</h2>";
  throw new Error("Missing docID in URL");
}

/* ----------------------------------------------------
   Load profile pic for current user
---------------------------------------------------- */
let currentUserPic = "/images/default_user.png";

async function loadUserProfilePic(uid){
  try {
   const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const data = snap.data();

      if (data.photoURL) {
        currentUserPic = data.photoURL;   // << REAL PROFILE PIC
      }
    }
  } catch (err) {
    console.error("Error loading user profile pic:", err);
  }
  
} 

/* ----------------------------------------------------
   Build chat UI
---------------------------------------------------- */
function buildChatUI(username) {
  document.body.innerHTML = `
    <div id="title_container">
      <div id="title_inner_container">
        <h1 id="title">Group Chat</h1>
      </div>
    </div>

    <div id="chat_container">
      <div id="chat_inner_container">
        <div id="chat_content_container"></div>

        <div id="chat_input_container">
          <input id="chat_input" maxlength="500" placeholder="${username}, say something…">
          <button id="chat_input_send" disabled>Send</button>
        </div>

        <div id="chat_logout_container">
          <button id="backBtn">← Back to group</button>
        </div>
      </div>
    </div>
  `;
}

/* ----------------------------------------------------
   Render messages (bubble UI)
---------------------------------------------------- */
function renderMessages(msgList, currentUid) {
  const box = $("#chat_content_container");
  if (!box) return;
  box.innerHTML = "";

  msgList.forEach((m) => {
   const isYou = m.uid === currentUid;

    // Outer row (matches .msg-row + .msg-row.you)
    const row = document.createElement("div");
    row.className = `msg-row ${isYou ? "you" : "other"}`;

    // Profile picture
    const img = document.createElement("img");
    img.className = "msg-pfp";
    img.src = m.photoURL || "default_user.png";

    // Wrapper for: username (optional), bubble, time
    const wrapper = document.createElement("div");
    wrapper.className = `msg-wrapper ${isYou ? "you" : "other"}`;

    // Username (only show for other users)
    if (!isYou) {
        const nameEl = document.createElement("div");
        nameEl.className = "msg-username";
        nameEl.textContent = m.user || "Unknown";
        wrapper.appendChild(nameEl);
    }

    // Bubble
    const bubble = document.createElement("div");
    bubble.className = `message ${isYou ? "you" : "other"}`;
    bubble.textContent = m.text;
    wrapper.appendChild(bubble);

    // Timestamp
    const timeEl = document.createElement("div");
    timeEl.className = "msg-time";
    if (m.timestamp?.toDate) {
        timeEl.textContent = m.timestamp
            .toDate()
            .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    wrapper.appendChild(timeEl);

    // Combine depending on sender
    if (isYou) {
        row.appendChild(img);      // right side
        row.appendChild(wrapper);
    } else {
        row.appendChild(img);      // left side
        row.appendChild(wrapper);
    }

    box.appendChild(row);
  });

  box.scrollTop = box.scrollHeight;
}

/* ----------------------------------------------------
   Main logic
---------------------------------------------------- */
onAuthStateChanged(getAuth(), async (user) => {
  if (!user) {
    document.body.innerHTML = "<h2>Sign in required.</h2>";
    return;
  }

  const username = user.displayName || "User";

  /* ----------------------------------------------------
   Load current user's profile picture
  ---------------------------------------------------- */
  await loadUserProfilePic(user.uid);

  // 1️⃣ Build UI FIRST
  buildChatUI(username);

  console.log("Chat UI Built:", $("#chat_content_container"));

  // Back button
  $("#backBtn").addEventListener("click", () => {
    window.location.href = `/myGroup.html?docID=${groupId}`;
  });

  // 2️⃣ Firestore references
  const chatRef = collection(db, "groups", groupId, "chat");
  const q = query(chatRef, orderBy("timestamp", "asc"));
  const currentUid = user.uid;  // store UID ONCE

  // 3️⃣ Live updates AFTER UI is built
  onSnapshot(q, (snap) => {
    const msgs = [];
    snap.forEach((d) => msgs.push(d.data()));

    console.log("Snapshot fired, messages:", msgs); // Debug output

    renderMessages(msgs, currentUid);
  });

  // 4️⃣ Sending messages
  const input = $("#chat_input");
  const sendBtn = $("#chat_input_send");

  input.addEventListener("input", () => {
    sendBtn.disabled = input.value.trim().length === 0;
    sendBtn.classList.toggle("enabled", !sendBtn.disabled);
  });

  sendBtn.addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text) return;

    await addDoc(chatRef, {
      user: username,
      uid: user.uid,
      text,
      //include profilePic in message
      photoURL: currentUserPic,
      timestamp: serverTimestamp()
    }).catch(err => console.error("Send error:", err));

    input.value = "";
    sendBtn.disabled = true;
    sendBtn.classList.remove("enabled");
  });
});
