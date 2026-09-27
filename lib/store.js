import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const emptyDb = () => ({
  visitors: {},
  events: [],
  applications: [],
});

export const applicationDefaults = () => ({
  matchGroupId: null,
  matchStatus: "unmatched",
  chatLink: null,
  feeAmount: null,
  matchedAt: null,
  paymentRequestedAt: null,
  paidAt: null,
  operatorNote: "",
});

export function createStore(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
  let db = emptyDb();
  if (existsSync(filePath)) {
    try {
      db = { ...emptyDb(), ...JSON.parse(readFileSync(filePath, "utf8")) };
      db.applications = db.applications.map((a) => ({ ...applicationDefaults(), ...a }));
    } catch {
      db = emptyDb();
    }
  }

  let queue = Promise.resolve();

  function persist() {
    writeFileSync(filePath, JSON.stringify(db, null, 2), "utf8");
  }

  function mutate(fn) {
    const operation = queue.then(() => {
      const result = fn(db);
      persist();
      return result;
    });
    queue = operation.catch(() => {});
    return operation;
  }

  function read(fn) {
    return fn(db);
  }

  return { mutate, read };
}
