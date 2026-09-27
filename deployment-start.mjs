const password = process.env.ADMIN_PASSWORD || "";
if (password.length < 16 || password === "change-me") {
  throw new Error("Set ADMIN_PASSWORD to a unique password of at least 16 characters before deployment.");
}
for (const key of ["OPERATOR_EMAIL", "RETENTION_PERIOD"]) {
  if (!process.env[key] || process.env[key].includes("[")) {
    throw new Error(`Set ${key} before deployment.`);
  }
}
await import("./server.js");
