// Import specific functions from the Firebase Auth SDK
import {
   onAuthReady
} from "../authentication.js";

import {
   onAuthStateChanged
} from "firebase/auth";

import {
   auth
} from "/src/firebaseConfig.js";
import {
   logoutUser
} from "/src/authentication.js";
class SiteNavbar extends HTMLElement {
   constructor() {
      super();
      this.renderNavbar();
      this.renderAuthControls();
   }

   renderNavbar() {
      onAuthReady((user) => {
         if (!user) {
            // If user is not signed in, homebutotn on navbar rediects to index.html not indexloggedin.html.
            this.innerHTML = `
            <header class="topbar">
              <div class="wrap">
                <div class="brand">
                  <img src="/public/images/logowhite.png" alt="Pantry Tracker Logo" class="logo-image"/>
                </div>

                <nav class="nav">
                  <a href="index.html" class="active">Home</a>
                  <a href="#features">Features</a>
                  <a href="#learn-more">Learn More</a>
                </nav>
                <div id="authControls" class="auth-controls d-flex align-items-center gap-2 my-2 my-lg-0"></div>
              </div>
            </header>
        `;
         }
      });
      this.innerHTML = `
            <header class="topbar">
              <div class="wrap">
                <div class="brand">
                  <img src="/public/images/logowhite.png" alt="Pantry Tracker Logo" class="logo-image"/>
                </div>

                <nav class="nav">
                  <a href="indexloggedin.html" class="active">Home</a>
                  <a href="main.html" class="active">Your Groups</a>
                  <a href="profile.html" class="active">Profile</a>
                  <a href="#features">Features</a>
                  <a href="#learn-more">Learn More</a>
                </nav>
                <div id="authControls" class="auth-controls d-flex align-items-center gap-2 my-2 my-lg-0"></div>
              </div>
            </header>
        `;

   };
   renderAuthControls() {
      const authControls = this.querySelector("#authControls");

      // Initialize with invisible placeholder to maintain layout space
      authControls.innerHTML = `<div class="btn btn-outline-light" style="visibility: hidden; min-width: 80px;">Log out</div>`;

      onAuthStateChanged(auth, (user) => {
         let updatedAuthControl;
         if (user) {
            updatedAuthControl = `<button class="btn btn-outline-light" id="signOutBtn" type="button" style="min-width: 80px;">Log out</button>`;
            authControls.innerHTML = updatedAuthControl;
            const signOutBtn = authControls.querySelector("#signOutBtn");
            signOutBtn?.addEventListener("click", logoutUser);
         } else {
            updatedAuthControl = `<a class="btn btn-outline-light" id="loginBtn" href="/login.html" style="min-width: 80px;">Log in</a>`;
            authControls.innerHTML = updatedAuthControl;
         }
      });
   }
}

customElements.define("site-navbar", SiteNavbar);