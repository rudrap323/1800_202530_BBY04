class SiteFooter extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <!-- Footer: single source of truth -->
            <footer class="footer">
                <div class="wrap small">
                    <p>© <span id="y"></span> Pantry Tracker</p>
                    <p>
                    <a href="#privacy">Privacy</a> · <a href="#terms">Terms</a> ·
                    <a href="#contact">Contact</a>
                    </p>
                </div>
            </footer>
        `;
    }
}

customElements.define('site-footer', SiteFooter);