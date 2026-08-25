import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const favicon = readFileSync(new URL("./favicon.svg", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");

describe("player-facing branding", () => {
  it("uses Quest Keeper AI in the page chrome", () => {
    expect(page).toContain("Quest Keeper AI — Your next campaign starts here");
    expect(page).toContain("Quest Keeper AI home");
    expect(page).toContain("QUEST KEEPER <em>/</em> AI <small>LIVE</small>");
    expect(page).not.toContain("Lantern Table");
  });

  it("uses Quest Keeper AI in the favicon accessibility label", () => {
    expect(favicon).toContain('aria-label="Quest Keeper AI"');
    expect(favicon).not.toContain("Lantern Table");
  });

  it("keeps the compact mobile header from colliding with the brand", () => {
    expect(styles).toContain("@media (max-width: 480px)");
    expect(styles).toContain(".site-header .top-nav .button { display: none; }");
  });

  it("uses the public style guide tokens on the play surface", () => {
    expect(styles).toContain("--amber: #00ffff");
    expect(styles).toContain("--mint: #00ff88");
    expect(styles).toContain('font-family: "Share Tech Mono"');
    expect(styles).toContain(".play-app::before");
    expect(styles).toContain(".play-app::after");
  });

  it("keeps the dossier natural while the campaign log remains readable and scrollable", () => {
    expect(styles).toContain("height: auto;");
    expect(styles).toContain("min-height: 620px;");
    expect(styles).toContain(".play-app .player-panel");
    expect(styles).toContain("overflow: visible;");
    expect(styles).toContain("overscroll-behavior: contain;");
    expect(styles).toContain("scrollbar-gutter: stable;");
    expect(styles).toContain("max-height: min(64vh, 500px);");
    expect(styles).toContain(".play-app .chat-input-row");
    expect(styles).toContain("grid-template-columns: 1fr;");
  });

  it("completes Clerk OAuth callbacks before returning to the play surface", () => {
    expect(app).toContain('window.location.hash === "#/sso-callback"');
    expect(app).toContain("handleRedirectCallback");
    expect(app).toContain("signInFallbackRedirectUrl");
    expect(app).not.toContain("continueSignUpUrl");
  });
});
