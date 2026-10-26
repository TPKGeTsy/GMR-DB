// How the web app reaches the I/O modules.
//
//   direct - this server opens the Modbus connection itself, so it has to sit
//            on the modules' LAN (the company server, when it is in that LAN).
//   agent  - the web app only writes the wanted state to the database; a
//            Raspberry Pi on the modules' LAN (the agent) does the talking.
//
// MODBUS_MODE=agent selects the second. On Vercel the second is the ONLY thing
// that can work (a serverless function can't reach a LAN, nor hold a Modbus
// connection open), so it is forced there: a missing or mistyped MODBUS_MODE
// must not leave the site showing "can't reach the module" while the Pi is
// healthy. Pure function of its inputs so it is easy to test.

export function isAgentModeFor(env: Record<string, string | undefined>): boolean {
  if (env.VERCEL) return true;
  return (env.MODBUS_MODE ?? "direct").trim().toLowerCase() === "agent";
}

export const isAgentMode = (): boolean => isAgentModeFor(process.env);
