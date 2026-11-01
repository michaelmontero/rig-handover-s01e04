export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job for a night. Times keep the log's offset string as-is.
export type DigestRow = {
  job: string;
  owner: string | null; // null is kept; views show it as `—`
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null; // most recent error seen that night, null if none
  firstAt: string;
  lastAt: string;
};

// `found: false` = no file for that night (404). An empty file is found with no rows.
export type Night =
  | { found: false; night: string }
  | { found: true; night: string; rows: DigestRow[]; badLines: number };

// Rows sorted by job. Bad lines are counted, never thrown.
export type ReadNight = (runsDir: string, night: string) => Night;
