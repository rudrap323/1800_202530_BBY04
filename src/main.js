import {
    onAuthReady
} from "./authentication.js"
import { db } from "./firebaseConfig.js";
import { doc, onSnapshot } from "firebase/firestore";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import '/src/styles/style.css';

function showDashboard() {
      const nameElement = document.getElementById("name-goes-here");
      onAuthReady((user) => {
          if (!user) {
              location.href = "index.html";
              return;
          }
          const name = user.displayName || user.email;

          if (nameElement) {
              nameElement.textContent = `${name}!`;
          }
      });
}

showDashboard();