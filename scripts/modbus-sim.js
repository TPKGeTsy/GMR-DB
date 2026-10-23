// Tiny fake Modbus TCP device for developing without the real hardware.
// 16 coils, all start OFF; answers Unit ID 1 only (so the probe's unit scan
// has something to find).
//
// Usage:
//   node scripts/modbus-sim.js [port]      (default 5020)

const ModbusRTU = require("modbus-serial");

const port = Number(process.argv[2] || 5020);
const UNIT = 1;
const coils = new Array(16).fill(false);

const check = (unitID) => {
  if (unitID !== UNIT) {
    const err = new Error("Gateway path unavailable");
    err.modbusErrorCode = 0x0a;
    throw err;
  }
};

const vector = {
  getCoil: (addr, unitID) => {
    check(unitID);
    return coils[addr] ?? false;
  },
  setCoil: (addr, value, unitID) => {
    check(unitID);
    coils[addr] = value;
    console.log(`coil ${addr} <- ${value ? "ON" : "OFF"}  [${coils.map(Number).join("")}]`);
  },
  getDiscreteInput: (addr, unitID) => {
    check(unitID);
    return false;
  },
  getHoldingRegister: (addr, unitID) => {
    check(unitID);
    return 0;
  },
  getInputRegister: (addr, unitID) => {
    check(unitID);
    return 0;
  },
};

new ModbusRTU.ServerTCP(vector, { host: "127.0.0.1", port, unitID: 255 });
console.log(`Simulator listening on 127.0.0.1:${port} (Unit ID ${UNIT}, 16 coils)`);
