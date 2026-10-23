// Read-only probe for a Modbus TCP device. NEVER writes — safe to point at
// real equipment. Use it to find the Unit ID and see which coil / register
// ranges the device answers.
//
// Usage:
//   node scripts/modbus-probe.js [host] [port] [count]
//   node scripts/modbus-probe.js 192.168.10.12 502 16
//
// Against the local simulator (node scripts/modbus-sim.js):
//   node scripts/modbus-probe.js 127.0.0.1 5020

const ModbusRTU = require("modbus-serial");

const host = process.argv[2] || "192.168.10.12";
const port = Number(process.argv[3] || 502);
const count = Number(process.argv[4] || 16);

// Unit ID is unknown, so try the usual suspects. Plain Modbus TCP devices
// often ignore it (any value works); gateways to RTU slaves care about it.
const UNIT_IDS = [1, 0, 255, 2, 3];

const READS = [
  ["FC01 coils", (c) => c.readCoils(0, count), (r) => r.data.slice(0, count).map(Number).join("")],
  ["FC02 discrete inputs", (c) => c.readDiscreteInputs(0, count), (r) => r.data.slice(0, count).map(Number).join("")],
  ["FC03 holding regs", (c) => c.readHoldingRegisters(0, Math.min(count, 10)), (r) => r.data.join(",")],
  ["FC04 input regs", (c) => c.readInputRegisters(0, Math.min(count, 10)), (r) => r.data.join(",")],
];

async function main() {
  const client = new ModbusRTU();
  client.setTimeout(2000);
  console.log(`Connecting to ${host}:${port} ...`);
  await client.connectTCP(host, { port });
  console.log("TCP connected.\n");

  for (const id of UNIT_IDS) {
    client.setID(id);
    console.log(`--- Unit ID ${id} ---`);
    for (const [label, read, fmt] of READS) {
      try {
        const res = await read(client);
        console.log(`  ${label.padEnd(22)} OK   ${fmt(res)}`);
      } catch (e) {
        console.log(`  ${label.padEnd(22)} FAIL ${e.modbusCode ? `exception ${e.modbusCode}` : e.message}`);
      }
    }
  }
  client.close(() => {});
}

main().catch((e) => {
  console.error("Could not connect:", e.message);
  process.exit(1);
});
