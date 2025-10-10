import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap";

function sayHello() {}
// basic mobile menu
const btn = document.querySelector(".menu-btn");
const nav = document.querySelector(".nav");
btn.addEventListener("click", () => {
  nav.classList.toggle("open");
  const open = nav.classList.contains("open");
  btn.setAttribute("aria-expanded", open ? "true" : "false");
});
// year
document.getElementById("y").textContent = new Date().getFullYear();
document.addEventListener("DOMContentLoaded", sayHello);
