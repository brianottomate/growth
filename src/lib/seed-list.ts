/**
 * Reading a customer file into seed-list members. Meta's own template and the
 * exports people hand us name the columns differently ("email", "Email
 * Address", "phone_number"), so matching is by header, and only email and
 * phone are kept: those are the two identifiers the Zernio upload accepts.
 */

export type SeedMember = { email?: string; phone?: string };

export type SeedListParse = {
  members: SeedMember[];
  rows: number;
  emailColumn: string | null;
  phoneColumn: string | null;
  withEmail: number;
  withPhone: number;
};

const EMAIL_HEADERS = ["email", "e-mail", "email address", "email_address"];
const PHONE_HEADERS = [
  "phone",
  "phone number",
  "phone_number",
  "mobile",
  "mobile phone",
];
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** RFC 4180: quoted fields may hold commas, newlines and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function findColumn(headers: string[], names: string[]) {
  const normalized = headers.map((header) =>
    header.replace(/^﻿/, "").trim().toLowerCase(),
  );
  // Meta's template repeats "email" for extra addresses; the first one wins.
  for (const name of names) {
    const index = normalized.indexOf(name);
    if (index !== -1) return index;
  }
  return -1;
}

export function parseSeedList(text: string): SeedListParse {
  const [headers = [], ...body] = parseCsv(text);
  const emailIndex = findColumn(headers, EMAIL_HEADERS);
  const phoneIndex = findColumn(headers, PHONE_HEADERS);
  const seen = new Set<string>();
  const members: SeedMember[] = [];
  let withEmail = 0;
  let withPhone = 0;
  for (const cells of body) {
    const rawEmail = emailIndex >= 0 ? cells[emailIndex]?.trim() : "";
    const email =
      rawEmail && EMAIL_SHAPE.test(rawEmail) ? rawEmail.toLowerCase() : "";
    const phone = phoneIndex >= 0 ? (cells[phoneIndex]?.trim() ?? "") : "";
    // A phone needs enough digits to be one; "n/a" and "-" are not.
    const hasPhone = phone.replace(/\D/g, "").length >= 7;
    if (!email && !hasPhone) continue;
    const key = `${email}|${hasPhone ? phone : ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (email) withEmail++;
    if (hasPhone) withPhone++;
    members.push({
      ...(email ? { email } : {}),
      ...(hasPhone ? { phone } : {}),
    });
  }
  return {
    members,
    rows: body.length,
    emailColumn: emailIndex >= 0 ? headers[emailIndex]!.trim() : null,
    phoneColumn: phoneIndex >= 0 ? headers[phoneIndex]!.trim() : null,
    withEmail,
    withPhone,
  };
}
