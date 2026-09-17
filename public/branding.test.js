import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const favicon = readFileSync(new URL("./favicon.svg", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");

describe("player-facing branding", () => {
  it("uses Quest Keeper AI in the page chrome", () => {
    expect(page).toContain("Quest Keeper AI — Play now in your browser");
    expect(page).toContain("Quest Keeper AI home");
    expect(page).toContain("QUEST KEEPER <em>/</em> AI <small>LIVE</small>");
    expect(page).not.toContain("Lantern Table");
  });

  it("leads with the two entry paths instead of tagline copy", () => {
    expect(page).toContain('data-action="play-now"');
    expect(page).toContain('data-action="create-character"');
    expect(page).toContain("Create a custom character");
    expect(page).not.toContain("Your next campaign starts");
    expect(page).not.toContain("Start free. Stay for the story.");
  });

  it("uses Quest Keeper AI in the favicon accessibility label", () => {
    expect(favicon).toContain('aria-label="Quest Keeper AI"');
    expect(favicon).not.toContain("Lantern Table");
  });

  it("keeps the compact mobile header from colliding with the brand", () => {
    expect(styles).toContain("@media (max-width: 480px)");
    expect(styles).toContain(".site-header .top-nav .button { display: none; }");
  });

  it("keeps one warm candlelit theme and keeps the cyberpunk skin off the page", () => {
    expect(styles).toContain("--amber: #e6ac63");
    expect(styles).toContain("--mint: #a3c9ad");
    expect(styles).toContain("font-family: Inter, ui-sans-serif");
    for (const cyberpunk of ["#00ffff", "#00ff88", "#00ff00", "#ff006e", "Share Tech Mono", "IBM Plex Mono", "play-scanline"]) {
      expect(styles).not.toContain(cyberpunk);
    }
  });

  it("keeps the desktop dossier natural while preserving mobile scrolling", () => {
    expect(styles).toContain("height: auto;");
    expect(styles).toContain("min-height: 620px;");
    expect(styles).toContain("max-height: min(78vh, 820px);");
    expect(styles).toContain(".play-app .game-log.is-opening");
    expect(styles).toContain("min-height: 340px;");
    expect(styles).toContain(".play-app .player-panel");
    expect(styles).toContain("overflow: visible;");
    expect(styles).toContain("overscroll-behavior: contain;");
    expect(styles).toContain("scrollbar-gutter: stable;");
    expect(styles).toContain("max-height: min(58vh, 520px);");
    expect(styles).toContain("max-height: min(46vh, 360px);");
    expect(styles).toContain(".play-app .chat-input-row");
    expect(styles).toContain("grid-template-columns: 1fr;");
  });

  it("completes Clerk OAuth callbacks before returning to the play surface", () => {
    expect(app).toContain('window.location.hash === "#/sso-callback"');
    expect(app).toContain("handleRedirectCallback");
    expect(app).toContain("signInFallbackRedirectUrl");
    expect(app).not.toContain("continueSignUpUrl");
  });

  it("reflects an active Player Pass instead of offering checkout again", () => {
    expect(page).toContain('<details id="membership"');
    expect(page).toContain('id="membership-status"');
    expect(page).toContain('id="membership-checkout"');
    expect(page).toContain('id="membership-portal"');
    expect(app).toContain("PLAYER PASS ACTIVE");
    expect(app).toContain("checkoutSync");
  });

  it("retries a pending checkout return instead of waiting for an unrelated refresh", () => {
    expect(app).toContain('checkoutSync === "pending"');
    expect(app).toContain("requestSessionWithCheckoutSync");
    expect(app).toContain('checkoutSync === "synced") clearCheckoutReturn()');
  });

  it("keeps billing management available for any bound Stripe customer", () => {
    expect(app).toContain("portalButton.hidden = !hasStripeCustomer;");
    expect(app).toContain("checkoutButton.hidden = active || unresolvedCheckout;");
  });

  it("retires first-session acquisition chrome after a campaign exists", () => {
    expect(page).toContain('id="first-session-cta"');
    expect(page).toContain('id="table-entry-cta"');
    expect(app).toContain('firstSessionCta.hidden = hasCampaign');
    expect(app).toContain('document.body.classList.toggle("has-campaign", hasCampaign)');
    expect(app).toContain('hasCampaign ? "Return to campaign" : "Play now"');
    expect(styles).toContain(".play-app.has-campaign .hero { display: none; }");
    expect(styles).toContain(".play-app.has-campaign .play-section { order: -1;");
  });

  it("shows opening presence and keeps table receipts inside the DM turn", () => {
    expect(app).toContain("renderOpeningPresence(session, snapshot");
    expect(app).toContain("pairToolDisclosureWithNarration(entries)");
    expect(app).toContain('gameLog.classList.toggle("is-opening", openingPending || openingFailed)');
    expect(app).not.toContain('<span class="log-icon">TOOLS</span>');
  });

  it("settles the composer after a resumed or retried opening succeeds", () => {
    expect(app).toMatch(/renderSession\(result\.data\);\s*setStatus\("Your story is open", "ready"\);\s*return true;/);
  });

  it("does not expose unsupported higher-level character creation", () => {
    expect(page).toContain("New characters start at level 1.");
    expect(page).not.toContain('value="2">Level 2');
    expect(app).toContain("higher-level progression is being reviewed");
  });
});
