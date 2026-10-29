import { openLittleDB } from "./schema";

// The database as pages see it: one instance per page, read through
// repositories and live queries (0012, Reads). Writes go through `send`.
export const littleDB = openLittleDB();
