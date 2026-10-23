// Runs once when the Next.js server starts (see the Next.js instrumentation
// docs). Used to start the Modbus supervisor, so lights that were ON before a
// restart are switched back on without anyone opening the /modbus page.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startRelaySupervisor } = await import("./lib/relayRuntime");
    startRelaySupervisor();
  } catch (error) {
    // Never block server start-up because of the I/O module.
    console.error("Failed to start the Modbus supervisor:", error);
  }
}
