import { db } from "./firebaseConfig.js";
import {
  collection, addDoc, serverTimestamp,
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
    try {
      const wrapper = document.createElement("div");
      const isYou = m.uid && currentUid && m.uid === currentUid;

      if (!isYou) {
        const name = document.createElement("div");
        name.className = "msg-username";
        name.textContent = m.user || "Unknown";
        wrapper.appendChild(name);
      }

      const bubble = document.createElement("div");
      bubble.className = `message ${isYou ? "you" : "other"}`;
      bubble.textContent = m.text || "";
      wrapper.appendChild(bubble);

      if (m.timestamp) {
        let tsText = "";
        try {
          if (m.timestamp.toDate) {
            tsText = m.timestamp
              .toDate()
              .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          }
        } catch (_) {}

        if (tsText) {
          const timeEl = document.createElement("div");
          timeEl.className = "msg-time";
          timeEl.textContent = tsText;
          wrapper.appendChild(timeEl);
        }
      }

      box.appendChild(wrapper);
    } catch (err) {
      console.error("Render message error:", err, m);
    }
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
      timestamp: serverTimestamp()
    }).catch(err => console.error("Send error:", err));

    input.value = "";
    sendBtn.disabled = true;
    sendBtn.classList.remove("enabled");
  });
});
