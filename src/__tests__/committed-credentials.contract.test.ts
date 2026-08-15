/**
 * Committed-credential lock.
 *
 * A migration once seeded three audit accounts and wrote their passwords into
 * the file:
 *
 *   crypt('Ab3LrATRUifanaipa3hRrX', gen_salt('bf'))
 *
 * One of them held `super_admin`, and it authenticated against the live
 * backend. The passwords were readable by anyone with repo access.
 *
 * The rule this locks in is narrow and absolute: **a credential that
 * authenticates may not live in a committed file, and no committed file may
 * grant a privileged role to an account whose password is also committed.**
 *
 * It is deliberately not a secret scanner. It asks two questions a scanner
 * cannot: does this file create a login, and does the same file — or any
 * other — hand that login a privileged role.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

const SQL_DIRS = ["supabase/migrations", "supabase/sql/applied", "src/db/migrations"];

function sqlFiles(): string[] {
  const out: string[] = [];
  for (const dir of SQL_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (f.endsWith(".sql")) out.push(path.join(abs, f));
    }
  }
  return out.sort();
}

const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, "/");

/** `crypt('secret', gen_salt(...))` — a password being set in committed SQL. */
const CRYPT_LITERAL = /\bcrypt\s*\(\s*'([^']+)'\s*,\s*gen_salt/gi;

/** A password column assigned a bare string. */
const PASSWORD_LITERAL = /\b(encrypted_password|password)\s*(?:=|,)\s*'([^']{6,})'/gi;

/**
 * Roles that can act on other people's money or data. Granting one of these to
 * an account whose password is committed is the failure this test exists for.
 */
const PRIVILEGED_GRANT =
  /INSERT\s+INTO\s+public\.(internal_user_roles|user_roles)\b[\s\S]{0,400}?('(super_admin|admin|finance|support|ops)')/gi;

describe("committed credentials", () => {
  const files = sqlFiles().map((f) => ({ file: f, src: fs.readFileSync(f, "utf8") }));

  it("no committed SQL sets a password anyone can read", () => {
    const offenders: string[] = [];
    for (const { file, src } of files) {
      // The revocation migration necessarily names the pattern it is undoing,
      // and only inside comments. Strip comments before looking.
      const code = src.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of code.matchAll(CRYPT_LITERAL)) {
        offenders.push(`${rel(file)} — crypt('${m[1].slice(0, 4)}…') sets a readable password`);
      }
      for (const m of code.matchAll(PASSWORD_LITERAL)) {
        if (/null/i.test(m[2])) continue;
        offenders.push(`${rel(file)} — ${m[1]} assigned a literal`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("no privileged role is granted to an account whose password is committed", () => {
    // Every account that gets a password in committed SQL.
    const exposed = new Set<string>();
    for (const { src } of files) {
      const code = src.replace(/--[^\n]*/g, "");
      if (!CRYPT_LITERAL.test(code) && !PASSWORD_LITERAL.test(code)) continue;
      CRYPT_LITERAL.lastIndex = 0;
      PASSWORD_LITERAL.lastIndex = 0;
      for (const m of code.matchAll(/'([0-9a-f-]{36})'/gi)) exposed.add(m[1].toLowerCase());
      for (const m of code.matchAll(/'([^']+@[^']+)'/g)) exposed.add(m[1].toLowerCase());
    }

    const offenders: string[] = [];
    for (const { file, src } of files) {
      const code = src.replace(/--[^\n]*/g, "");
      for (const m of code.matchAll(PRIVILEGED_GRANT)) {
        const block = m[0].toLowerCase();
        for (const id of exposed) {
          if (block.includes(id)) {
            offenders.push(`${rel(file)} — grants ${m[3]} to an account with a committed password`);
            break;
          }
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("keeps .env out of version control", () => {
    const ignore = fs.existsSync(path.join(ROOT, ".gitignore"))
      ? fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8")
      : "";
    // The file may legitimately exist locally; it must never be tracked, and
    // the ignore rule is what guarantees the next secret added is not committed.
    expect(/^\.env$/m.test(ignore) || /^\.env\*?$/m.test(ignore), ".gitignore must ignore .env").toBe(true);
  });
});
