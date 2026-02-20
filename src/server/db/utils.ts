import { customAlphabet } from "nanoid";

// ---- ID GENERATION UTILITIES ---------------------------------------
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
const generateId = customAlphabet(alphabet, 16);

export const createId = (prefix: string) => `${prefix}_${generateId()}`;

// Convenience functions for specific prefixes
export const idGenerators = {
  user: () => createId("usr"),
  organization: () => createId("org"),
  post: () => createId("pst"),
  attachment: () => createId("att"),
  member: () => createId("mbr"),
  invitation: () => createId("inv"),
  team: () => createId("team"),
} as const;
