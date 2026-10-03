import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultAlertConfig } from "../src/desk/alerts.js";
import { startOperatorDesk } from "../src/desk/server.js";
import { renderDeskPage } from "../src/desk/render.js";
import { buildOperatorSnapshot } from "../src/desk/snapshot.js";
import {
  approveUser,
  createFirstUser,
  defaultLocalLoginPath,
  LocalLoginRefused,
  readLocalLogin,
  requestAccess,
  signIn
} from "../src/desk/local-login.js";

function emptyFolders(root: string) {
  return (["servicetitan", "probooks", "trades-app"] as const).map((preferClass) => ({
    dir: join(root, preferClass),
    preferClass
  }));
}

describe("local desk login", () => {
  it("lets the first user enter, refuses the next user until a higher role approves, then lets that user enter", () => {
    const first = createFirstUser(
      { ...blank(), users: [], sessions: [] },
      { name: "Ada", password: "local-pass-1", role: "management", at: "2026-10-03T00:00:00Z" }
    );
    expect(first.user.approved).toBe(true);
    expect(first.user.firstUser).toBe(true);
    expect(first.user.approvedByUserId).toBeNull();
    expect(first.user.role).toBe("management");
    const entered = signIn(first.store, { name: "Ada", password: "local-pass-1", at: "2026-10-03T00:00:01Z" });
    expect(entered.user.userId).toBe(first.user.userId);

    const requested = requestAccess(entered.store, {
      name: "Bea",
      password: "local-pass-2",
      role: "field",
      at: "2026-10-03T00:00:02Z"
    });
    expect(requested.user.approved).toBe(false);
    expect(() => signIn(requested.store, { name: "Bea", password: "local-pass-2", at: "2026-10-03T00:00:03Z" })).toThrow(LocalLoginRefused);

    expect(() =>
      approveUser(requested.store, { sessionToken: null, userId: requested.user.userId, at: "2026-10-03T00:00:04Z" })
    ).toThrow(/Sign in/);

    const fieldFirst = createFirstUser(blank(), { name: "Cara", password: "local-pass-1", role: "field", at: "2026-10-03T00:00:00Z" });
    const managerRequest = requestAccess(fieldFirst.store, {
      name: "Dee",
      password: "local-pass-2",
      role: "management",
      at: "2026-10-03T00:00:05Z"
    });
    expect(() =>
      approveUser(managerRequest.store, {
        sessionToken: fieldFirst.sessionToken,
        userId: managerRequest.user.userId,
        at: "2026-10-03T00:00:06Z"
      })
    ).toThrow(/higher role/);

    const approved = approveUser(requested.store, {
      sessionToken: first.sessionToken,
      userId: requested.user.userId,
      at: "2026-10-03T00:00:07Z"
    });
    expect(approved.user.approved).toBe(true);
    expect(approved.user.approvedByUserId).toBe(first.user.userId);
    const second = signIn(approved.store, { name: "Bea", password: "local-pass-2", at: "2026-10-03T00:00:08Z" });
    expect(second.user.role).toBe("field");
    expect(second.note).toMatch(/this machine/);
    expect(JSON.stringify(approved.store)).not.toContain("local-pass-2");
    expect(approved.store.pilot_started).toBe(false);
    expect(approved.store.live_backends).toBe(false);
    expect(approved.store.field_claim).toBe(false);
    expect(approved.store.servicetitanWrite).toBe(false);
    expect(approved.store.hostedIdentityProvider).toBe(false);
  });

  it("serves the same local approval path on the desk", async () => {
    const root = mkdtempSync(join(tmpdir(), "tr-login-"));
    const desk = await startOperatorDesk({
      cwd: root,
      port: 0,
      folders: emptyFolders(root),
      alertConfig: defaultAlertConfig(),
      persistAlertState: false,
      persistLocalReports: false
    });
    try {
      const page = await (await fetch(`${desk.url}`)).text();
      expect(page).toContain("Trying is not a commit");
      expect(page).toContain("The first local user is already okayed");
      expect(page).not.toContain("Field Softwares 1.0");
      expect(page).not.toContain("Office Softwares 1.0 is live");

      const created = await fetch(`${desk.url}api/local-login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create-first", name: "Ada", password: "local-pass-1", role: "management" })
      });
      expect(created.status).toBe(200);
      const createdBody = (await created.json()) as {
        entered: boolean;
        signedIn: { role: string; approved: boolean; firstUser: boolean } | null;
        hostedIdentityProvider: boolean;
        pilot_started: boolean;
        live_backends: boolean;
        field_claim: boolean;
        servicetitanWrite: boolean;
      };
      expect(createdBody.entered).toBe(true);
      expect(createdBody.signedIn?.approved).toBe(true);
      expect(createdBody.signedIn?.firstUser).toBe(true);
      expect(createdBody.signedIn?.role).toBe("management");
      expect(createdBody.hostedIdentityProvider).toBe(false);
      expect(createdBody.pilot_started).toBe(false);
      expect(createdBody.live_backends).toBe(false);
      expect(createdBody.field_claim).toBe(false);
      expect(createdBody.servicetitanWrite).toBe(false);
      const cookie = (created.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
      expect(cookie).toContain("trades-local-session=");

      const requested = await fetch(`${desk.url}api/local-login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "request-access", name: "Bea", password: "local-pass-2", role: "office" })
      });
      expect(requested.status).toBe(200);
      const requestedBody = (await requested.json()) as { users: { name: string; userId: string; approved: boolean; role: string }[] };
      const bea = requestedBody.users.find((user) => user.name === "Bea");
      expect(bea?.approved).toBe(false);
      expect(bea?.role).toBe("office");

      const refused = await fetch(`${desk.url}api/local-login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sign-in", name: "Bea", password: "local-pass-2" })
      });
      expect(refused.status).toBe(403);
      const refusedBody = (await refused.json()) as { error: string; entered: boolean; pilot_started: boolean; field_claim: boolean };
      expect(refusedBody.entered).toBe(false);
      expect(refusedBody.error).toMatch(/Refused until a higher role approves/);
      expect(refusedBody.pilot_started).toBe(false);
      expect(refusedBody.field_claim).toBe(false);

      const approved = await fetch(`${desk.url}api/local-login`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ action: "approve", userId: bea?.userId })
      });
      expect(approved.status).toBe(200);

      const entered = await fetch(`${desk.url}api/local-login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sign-in", name: "Bea", password: "local-pass-2" })
      });
      expect(entered.status).toBe(200);
      const enteredBody = (await entered.json()) as {
        entered: boolean;
        signedIn: { name: string; role: string; approved: boolean } | null;
        pilot_started: boolean;
        live_backends: boolean;
        field_claim: boolean;
        servicetitanWrite: boolean;
      };
      expect(enteredBody.entered).toBe(true);
      expect(enteredBody.signedIn?.name).toBe("Bea");
      expect(enteredBody.signedIn?.role).toBe("office");
      expect(enteredBody.signedIn?.approved).toBe(true);
      expect(enteredBody.pilot_started).toBe(false);
      expect(enteredBody.live_backends).toBe(false);
      expect(enteredBody.field_claim).toBe(false);
      expect(enteredBody.servicetitanWrite).toBe(false);

      const stored = readFileSync(join(root, defaultLocalLoginPath("local")), "utf8");
      expect(stored).not.toContain("local-pass-1");
      expect(stored).not.toContain("local-pass-2");
      expect(stored).toContain('"pilot_started": false');
      expect(stored).toContain('"live_backends": false');
      expect(stored).toContain('"field_claim": false');
      expect(stored).toContain('"hostedIdentityProvider": false');

      const snapshot = buildOperatorSnapshot({
        cwd: root,
        now: "2026-10-03T00:00:00Z",
        folders: emptyFolders(root),
        alertConfig: defaultAlertConfig(),
        persistAlertState: false,
        persistLocalReports: false
      });
      expect(snapshot.pilot_started).toBe(false);
      expect(snapshot.fieldShell.field_claim).toBe(false);
      expect(snapshot.localLogin.users.some((user) => user.name === "Bea" && user.approved)).toBe(true);
      const html = renderDeskPage(snapshot);
      expect(html).toContain("Trying is not a commit");
      expect(html).toContain("Bea");
      expect(html).toContain("Not a hosted identity provider");
    } finally {
      await desk.close();
    }
  });
});

function blank() {
  return readLocalLogin(join(mkdtempSync(join(tmpdir(), "tr-login-blank-")), "missing-users.json"));
}
