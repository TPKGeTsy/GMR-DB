import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ServerTCP } from "modbus-serial";

// Two throwaway Modbus TCP servers stand in for the two modules, so the
// gateway is exercised end to end (real sockets, real function codes) without
// touching real hardware. Each fake module has the real one's ~2 s watchdog
// (scaled down): it clears every output if no request arrives for a while.
const PORT_1 = 15020;
const PORT_2 = 15021;
const WATCHDOG_MS = 250;

interface FakeModule {
  coils: boolean[];
  lastRequestAt: number;
  coil0Reads: number;
  server: ServerTCP;
}

const fake: FakeModule[] = [];
let watchdog: ReturnType<typeof setInterval>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const allOff = (n = 32) => new Array<boolean>(n).fill(false);

async function startFake(port: number): Promise<FakeModule> {
  const coils = new Array<boolean>(16).fill(false);
  const mod = { coils, lastRequestAt: Date.now(), coil0Reads: 0 } as FakeModule;
  const vector = {
    getCoil: (addr: number) => {
      mod.lastRequestAt = Date.now();
      if (addr === 0) mod.coil0Reads++;
      return coils[addr] ?? false;
    },
    setCoil: (addr: number, value: boolean) => {
      mod.lastRequestAt = Date.now();
      coils[addr] = value;
    },
  };
  mod.server = new ServerTCP(vector, { host: "127.0.0.1", port, unitID: 1 });
  await new Promise((r) => mod.server.on("initialized", () => r(null)));
  return mod;
}

function configure(opts: { module2?: "up" | "unset" | "down" } = {}) {
  process.env.MODBUS_HOST = "127.0.0.1";
  process.env.MODBUS_PORT = String(PORT_1);
  process.env.MODBUS_UNIT_ID = "1";
  process.env.MODBUS_TIMEOUT_MS = "1000";
  process.env.MODBUS_KEEPALIVE_MS = "50";
  const mode = opts.module2 ?? "up";
  if (mode === "unset") delete process.env.MODBUS_HOST_2;
  else process.env.MODBUS_HOST_2 = "127.0.0.1";
  process.env.MODBUS_PORT_2 = String(mode === "down" ? 15099 : PORT_2); // nothing listens on 15099
}

beforeAll(async () => {
  fake.push(await startFake(PORT_1), await startFake(PORT_2));
  watchdog = setInterval(() => {
    for (const mod of fake) if (Date.now() - mod.lastRequestAt > WATCHDOG_MS) mod.coils.fill(false);
  }, 20);
});

beforeEach(async () => {
  const { closeModbus, setChannelMap } = await import("./modbus");
  closeModbus(); // fresh sockets + no keep-alive left over from the previous test
  setChannelMap(null); // default wiring unless a test rewires
  configure();
  for (const mod of fake) mod.coils.fill(false);
});

afterAll(async () => {
  clearInterval(watchdog);
  const { closeModbus } = await import("./modbus");
  closeModbus();
  await Promise.all(fake.map((mod) => new Promise<void>((r) => mod.server.close(() => r()))));
});

describe("modbus gateway (2 modules)", () => {
  // --- wiring: which module/coil each channel drives (set on the /modbus page) ---
  it("follows a rewired channel to the other module and coil", async () => {
    const { setCoil, setChannelMap, getChannelMap } = await import("./modbus");
    const { defaultChannelMap, swapIntoLocation } = await import("./relayState");
    setChannelMap(swapIntoLocation(defaultChannelMap(), 0, 1, 3).map); // CH1 -> module 2, coil 3
    expect(getChannelMap()[0]).toEqual({ module: 1, address: 3 });

    const snap = await setCoil(0, true);
    expect(fake[1].coils[3]).toBe(true); // the physical output moved
    expect(fake[0].coils.some(Boolean)).toBe(false); // and the old one did not
    expect(snap.states[0]).toBe(true); // read back as channel 0 again
    expect(snap.states.filter(Boolean)).toHaveLength(1); // the channel that took its place stays off
    await setCoil(0, false);
  });

  it("writes and reads every channel through the wiring", async () => {
    const { writeAllCoils, readAllCoils, setChannelMap } = await import("./modbus");
    const { defaultChannelMap, swapIntoLocation } = await import("./relayState");
    let map = swapIntoLocation(defaultChannelMap(), 2, 0, 9).map; // CH3 <-> CH10 trade outputs
    map = swapIntoLocation(map, 20, 0, 1).map; // CH21 <-> CH2 trade outputs
    setChannelMap(map);

    const pattern = allOff();
    pattern[2] = true; // CH3
    pattern[20] = true; // CH21
    const snap = await writeAllCoils(pattern);
    expect(snap.states).toEqual(pattern); // global view is unchanged
    expect(fake[0].coils[9]).toBe(true); // CH3 now drives module 1 coil 9
    expect(fake[0].coils[2]).toBe(false);
    expect(fake[0].coils[1]).toBe(true); // CH21 now drives module 1 coil 1
    expect(fake[1].coils[4]).toBe(false);
    expect((await readAllCoils()).states).toEqual(pattern);
    await writeAllCoils(allOff());
  });

  it("reconcile fixes the right output when a channel is rewired and reports global channels", async () => {
    const { reconcileCoils, setChannelMap } = await import("./modbus");
    const { defaultChannelMap, swapIntoLocation } = await import("./relayState");
    setChannelMap(swapIntoLocation(defaultChannelMap(), 4, 1, 6).map); // CH5 -> module 2, coil 6
    const saved = Array.from({ length: 32 }, (_, i) => (i === 4 ? true : null));

    const result = await reconcileCoils(() => saved);
    expect(result.restored).toEqual([4]);
    expect(fake[1].coils[6]).toBe(true);
    expect(fake[0].coils[4]).toBe(false);
    expect((await reconcileCoils(() => saved)).restored).toEqual([]);
  });

  it("ignores a conflicting wiring and keeps the default", async () => {
    const { setCoil, setChannelMap } = await import("./modbus");
    const { defaultChannelMap } = await import("./relayState");
    const bad = defaultChannelMap();
    bad[1] = { ...bad[0] }; // two channels on one output
    setChannelMap(bad);
    await setCoil(1, true);
    expect(fake[0].coils[1]).toBe(true); // default wiring: CH2 = module 1 coil 1
    await setCoil(1, false);
  });

  it("reads all 32 channels from both modules, initially OFF", async () => {
    const { readAllCoils } = await import("./modbus");
    const snap = await readAllCoils();
    expect(snap.states).toHaveLength(32);
    expect(snap.states.every((c) => c === false)).toBe(true);
    expect(snap.modules).toEqual([
      { configured: true, online: true },
      { configured: true, online: true },
    ]);
  });

  it("switches one channel on module 1 and returns the read-back state", async () => {
    const { setCoil } = await import("./modbus");
    const on = (await setCoil(3, true)).states;
    expect(on[3]).toBe(true);
    expect(on.filter(Boolean)).toHaveLength(1);
    expect(fake[0].coils[3]).toBe(true);

    expect((await setCoil(3, false)).states[3]).toBe(false);
  });

  it("routes channels 17-32 to module 2 (coil = channel - 16)", async () => {
    const { setCoil } = await import("./modbus");
    const snap = await setCoil(17, true); // global index 17 = CH18 = module 2, coil 1
    expect(fake[1].coils[1]).toBe(true);
    expect(fake[0].coils.some(Boolean)).toBe(false);
    expect(snap.states[17]).toBe(true);
    await setCoil(17, false);
  });

  it("keeps concurrent calls on both modules from clobbering each other", async () => {
    const { setCoil, readAllCoils } = await import("./modbus");
    await Promise.all([setCoil(0, true), setCoil(5, true), setCoil(16, true), setCoil(31, true)]);
    const { states } = await readAllCoils();
    expect([states[0], states[5], states[16], states[31]]).toEqual([true, true, true, true]);
    await Promise.all([setCoil(0, false), setCoil(5, false), setCoil(16, false), setCoil(31, false)]);
  });

  it("keeps an output ON past the module watchdog by polling while its module has anything ON", async () => {
    const { setCoil, readAllCoils, isKeepAliveRunning } = await import("./modbus");
    await setCoil(20, true);
    expect(isKeepAliveRunning(1)).toBe(true);
    expect(isKeepAliveRunning(0)).toBe(false); // module 1 is all OFF: no polling needed

    await sleep(WATCHDOG_MS * 3); // would have been wiped ~2 times over without keep-alive
    expect((await readAllCoils()).states[20]).toBe(true);
    expect(fake[1].coils[4]).toBe(true);

    await setCoil(20, false);
  });

  it("stops polling a module once it is all OFF", async () => {
    const { setCoil, isKeepAliveRunning } = await import("./modbus");
    await setCoil(7, true);
    expect(isKeepAliveRunning(0)).toBe(true);
    await setCoil(7, false);
    expect(isKeepAliveRunning(0)).toBe(false);

    await sleep(100); // let any in-flight poll finish
    const before = fake[0].coil0Reads;
    await sleep(250);
    expect(fake[0].coil0Reads).toBe(before);
  });

  it("drops the output without the keep-alive (what the watchdog does)", async () => {
    const { setCoil } = await import("./modbus");
    process.env.MODBUS_KEEPALIVE_MS = "0";
    await setCoil(9, true);
    await sleep(WATCHDOG_MS * 2);
    expect(fake[0].coils[9]).toBe(false);
  });

  it("writes every channel of both modules in one go", async () => {
    const { writeAllCoils } = await import("./modbus");
    const pattern = Array.from({ length: 32 }, (_, i) => i % 3 === 0);
    expect((await writeAllCoils(pattern)).states).toEqual(pattern);
    expect((await writeAllCoils(allOff())).states).toEqual(allOff());
    await expect(writeAllCoils([true])).rejects.toThrow(RangeError);
  });

  it("reconcile re-applies the saved state per module after the modules lose it", async () => {
    const { reconcileCoils, setCoil } = await import("./modbus");
    const saved = Array.from({ length: 32 }, (_, i) => (i === 2 || i === 18 ? true : i === 5 ? false : null));

    await setCoil(2, true);
    await setCoil(18, true);
    for (const mod of fake) mod.coils.fill(false); // both modules power-cycled

    const result = await reconcileCoils(() => saved);
    expect(result.restored).toEqual([2, 18]);
    expect(result.states[2]).toBe(true);
    expect(result.states[18]).toBe(true);
    expect(fake[0].coils[2]).toBe(true);
    expect(fake[1].coils[2]).toBe(true);

    // already in line with the saved state -> nothing to do
    expect((await reconcileCoils(() => saved)).restored).toEqual([]);
  });

  it("rejects out-of-range channel indexes without touching a module", async () => {
    const { setCoil } = await import("./modbus");
    await expect(setCoil(32, true)).rejects.toThrow(RangeError);
    await expect(setCoil(-1, true)).rejects.toThrow(RangeError);
    await expect(setCoil(1.5, true)).rejects.toThrow(RangeError);
  });

  it("treats module 2 as not installed until its address is set", async () => {
    configure({ module2: "unset" });
    const { readAllCoils, setCoil, reconcileCoils } = await import("./modbus");

    const snap = await readAllCoils();
    expect(snap.modules).toEqual([
      { configured: true, online: true },
      { configured: false, online: false },
    ]);
    expect(snap.states).toHaveLength(32);

    await expect(setCoil(16, true)).rejects.toThrow(/not configured/);
    expect((await setCoil(1, true)).states[1]).toBe(true); // module 1 unaffected
    expect((await reconcileCoils(() => new Array(32).fill(null))).restored).toEqual([]);
  });

  it("keeps working on module 1 when module 2 is unreachable", async () => {
    configure({ module2: "down" });
    const { readAllCoils, setCoil } = await import("./modbus");

    const snap = await readAllCoils();
    expect(snap.modules).toEqual([
      { configured: true, online: true },
      { configured: true, online: false },
    ]);
    expect(snap.errors[0]).toBeNull();
    expect(snap.errors[1]).toBeInstanceOf(Error);

    expect((await setCoil(4, true)).states[4]).toBe(true);
    await expect(setCoil(20, true)).rejects.toThrow();
  });

  it("uses an address set from the web page instead of the env, and follows a change", async () => {
    configure({ module2: "unset" }); // env says: module 2 not installed
    const { readAllCoils, setCoil, setModuleOverrides, effectiveModuleAddress } = await import("./modbus");
    try {
      expect(effectiveModuleAddress(1)).toMatchObject({ host: null, source: "none" });

      setModuleOverrides([null, { host: "127.0.0.1", port: PORT_2, unitId: 1 }]);
      expect(effectiveModuleAddress(1)).toMatchObject({ host: "127.0.0.1", port: PORT_2, source: "page" });
      const snap = await readAllCoils();
      expect(snap.modules[1]).toEqual({ configured: true, online: true });
      await setCoil(16, true); // CH17 -> module 2 coil 0, via the page-configured address
      expect(fake[1].coils[0]).toBe(true);

      // pointing it at a dead port drops the old connection and reports offline
      setModuleOverrides([null, { host: "127.0.0.1", port: 15099, unitId: 1 }]);
      expect((await readAllCoils()).modules[1]).toEqual({ configured: true, online: false });

      // clearing it falls back to the env (not installed)
      setModuleOverrides([null, null]);
      expect((await readAllCoils()).modules[1]).toEqual({ configured: false, online: false });
    } finally {
      setModuleOverrides([null, null]);
    }
  });

  it("reconnects after the connection is dropped", async () => {
    const { readAllCoils, closeModbus } = await import("./modbus");
    await readAllCoils();
    closeModbus();
    expect((await readAllCoils()).states).toHaveLength(32);
  });
});
