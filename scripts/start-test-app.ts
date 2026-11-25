import { spawn } from "node:child_process";
import { loadTestDatabaseEnvironment } from "./test-db-safety.ts";

loadTestDatabaseEnvironment();
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-p", "3001"],
  {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" },
  },
);

child.on("error", (error) => {
  console.error("Could not start the test application.", error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
