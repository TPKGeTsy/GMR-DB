// Turns each coil ON for a few seconds, then OFF, one at a time, so you can
// watch which physical output reacts. WRITES to the device — only run with
// the outputs safe and someone at the equipment.
//
// Usage:
//   node scripts/modbus-coil-test.js [host] [port] [unit] [first] [last] [seconds]
//   node scripts/modbus-coil-test.js 192.168.1.12 502 1 0 15 2
//
// Every exit path (error, Ctrl+C) tries to switch all tested coils OFF.

const ModbusRTU = require("modbus-serial");

const host = process.argv[2] || "192.168.1.12";
const port = Number(process.argv[3] || 502);
const unit = Number(process.argv[4] || 1);
const first = Number(process.argv[5] || 0);
const last = Number(process.argv[6] || 15);
const seconds = Number(process.argv[7] || 2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const client = new ModbusRTU();

async function allOff() {
  for (let addr = first; addr <= last; addr++) {
    try {
      await client.writeCoil(addr, false);
    } catch {
      /* best effort */
    }
  }
}

let stopping = false;
process.on("SIGINT", async () => {
  if (stopping) return;
  stopping = true;
  console.log("\nInterrupted — switching all coils OFF");
  await allOff();
  process.exit(130);
});

async function main() {
  client.setTimeout(2000);
  await client.connectTCP(host, { port });
  client.setID(unit);
  console.log(`Connected ${host}:${port} unit ${unit}. Testing coils ${first}-${last}, ${seconds}s each.\n`);

  try {
    for (let addr = first; addr <= last && !stopping; addr++) {
      await client.writeCoil(addr, true);
      const on = (await client.readCoils(addr, 1)).data[0];
      console.log(`coil ${String(addr).padStart(2)}: ON  (read back ${on ? "ON" : "OFF"}) ...`);
      await sleep(seconds * 1000);
      await client.writeCoil(addr, false);
      const off = (await client.readCoils(addr, 1)).data[0];
      console.log(`coil ${String(addr).padStart(2)}: OFF (read back ${off ? "ON" : "OFF"})`);
      await sleep(500);
    }
  } finally {
    await allOff();
    const final = await client.readCoils(first, last - first + 1).catch(() => null);
    console.log(`\nFinal state: ${final ? final.data.slice(0, last - first + 1).map(Number).join("") : "unknown"}`);
    client.close(() => {});
  }
}

main().catch(async (e) => {
  console.error("Error:", e.message);
  await allOff();
  process.exit(1);
});
