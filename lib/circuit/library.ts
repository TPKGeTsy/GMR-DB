import type { CategoryId, ComponentDef, Pin, PinKind, PinSide } from "./types";

// ---------------------------------------------------------------------------
// Small builders so every part is a short list.
// ---------------------------------------------------------------------------

type Extra = Partial<Omit<Pin, "id" | "name" | "side" | "kind">>;

const pin = (side: PinSide, kind: PinKind, id: string, name: string, extra: Extra = {}): Pin => ({ id, name, side, kind, ...extra });

const power = (side: PinSide, id: string, name: string, voltage?: number, extra: Extra = {}) => pin(side, "power", id, name, { voltage, ...extra });
const gnd = (side: PinSide, id = "GND", name = "GND", extra: Extra = {}) => pin(side, "ground", id, name, extra);

/** A digital pin at a logic level (V), tolerating `maxIn`. */
const io = (side: PinSide, id: string, name: string, level: number, maxIn: number, extra: Extra = {}) =>
  pin(side, "io", id, name, { voltage: level, maxIn, ...extra });

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// ---------------------------------------------------------------------------
// Arduino (5 V logic)
// ---------------------------------------------------------------------------

const AVR = { level: 5, maxIn: 5.5 };

function avrDigital(side: PinSide, n: number, functions: string[] = [], extra: Extra = {}): Pin {
  return io(side, `D${n}`, `D${n}`, AVR.level, AVR.maxIn, { functions: functions.length ? functions : undefined, ...extra });
}

function avrAnalog(side: PinSide, n: number, functions: string[] = []): Pin {
  return pin(side, "analog", `A${n}`, `A${n}`, { voltage: AVR.level, maxIn: AVR.maxIn, functions: ["ADC", ...functions] });
}

const arduinoUno: ComponentDef = {
  id: "arduino-uno-r3",
  name: "Arduino Uno R3",
  maker: "Arduino",
  category: "mcu",
  description: "ATmega328P · ลอจิก 5 V · D0-D13, A0-A5",
  verified: true,
  pins: [
    pin("left", "control", "RESET", "RESET"),
    power("left", "3V3", "3V3", 3.3),
    power("left", "5V", "5V", 5),
    gnd("left", "GND", "GND"),
    gnd("left", "GND_2", "GND"),
    power("left", "VIN", "VIN", undefined, { functions: ["7-12 V in"] }),
    avrAnalog("left", 0),
    avrAnalog("left", 1),
    avrAnalog("left", 2),
    avrAnalog("left", 3),
    avrAnalog("left", 4, ["I2C SDA"]),
    avrAnalog("left", 5, ["I2C SCL"]),
    avrDigital("right", 13, ["SPI SCK", "LED"]),
    avrDigital("right", 12, ["SPI MISO"]),
    avrDigital("right", 11, ["PWM", "SPI MOSI"]),
    avrDigital("right", 10, ["PWM", "SPI SS"]),
    avrDigital("right", 9, ["PWM"]),
    avrDigital("right", 8),
    avrDigital("right", 7),
    avrDigital("right", 6, ["PWM"]),
    avrDigital("right", 5, ["PWM"]),
    avrDigital("right", 4),
    avrDigital("right", 3, ["PWM", "INT1"]),
    avrDigital("right", 2, ["INT0"]),
    avrDigital("right", 1, ["UART TX"], { avoid: "ใช้ร่วมกับ USB serial (TX)" }),
    avrDigital("right", 0, ["UART RX"], { avoid: "ใช้ร่วมกับ USB serial (RX)" }),
    pin("right", "control", "AREF", "AREF"),
    gnd("right", "GND_3", "GND"),
  ],
};

const arduinoNano: ComponentDef = {
  id: "arduino-nano",
  name: "Arduino Nano",
  maker: "Arduino",
  category: "mcu",
  description: "ATmega328P · ลอจิก 5 V · D2-D13, A0-A7",
  verified: true,
  pins: [
    power("left", "VIN", "VIN", undefined, { functions: ["7-12 V in"] }),
    gnd("left", "GND", "GND"),
    pin("left", "control", "RESET", "RESET"),
    power("left", "5V", "5V", 5),
    ...range(0, 7).map((n) =>
      pin("left", "analog", `A${n}`, `A${n}`, {
        voltage: AVR.level,
        maxIn: AVR.maxIn,
        functions: n === 4 ? ["ADC", "I2C SDA"] : n === 5 ? ["ADC", "I2C SCL"] : n >= 6 ? ["ADC (อินพุตเท่านั้น)"] : ["ADC"],
      })
    ),
    pin("left", "control", "AREF", "AREF"),
    power("left", "3V3", "3V3", 3.3),
    avrDigital("right", 13, ["SPI SCK", "LED"]),
    avrDigital("right", 12, ["SPI MISO"]),
    avrDigital("right", 11, ["PWM", "SPI MOSI"]),
    avrDigital("right", 10, ["PWM", "SPI SS"]),
    avrDigital("right", 9, ["PWM"]),
    avrDigital("right", 8),
    avrDigital("right", 7),
    avrDigital("right", 6, ["PWM"]),
    avrDigital("right", 5, ["PWM"]),
    avrDigital("right", 4),
    avrDigital("right", 3, ["PWM", "INT1"]),
    avrDigital("right", 2, ["INT0"]),
    gnd("right", "GND_2", "GND"),
    avrDigital("right", 1, ["UART TX"], { avoid: "ใช้ร่วมกับ USB serial (TX)" }),
    avrDigital("right", 0, ["UART RX"], { avoid: "ใช้ร่วมกับ USB serial (RX)" }),
  ],
};

const megaFunctions: Record<number, string[]> = {
  0: ["UART0 RX"], 1: ["UART0 TX"], 2: ["PWM", "INT4"], 3: ["PWM", "INT5"], 4: ["PWM"], 5: ["PWM"], 6: ["PWM"], 7: ["PWM"], 8: ["PWM"], 9: ["PWM"],
  10: ["PWM"], 11: ["PWM"], 12: ["PWM"], 13: ["PWM", "LED"], 14: ["UART3 TX"], 15: ["UART3 RX"], 16: ["UART2 TX"], 17: ["UART2 RX"],
  18: ["UART1 TX", "INT3"], 19: ["UART1 RX", "INT2"], 20: ["I2C SDA", "INT1"], 21: ["I2C SCL", "INT0"], 44: ["PWM"], 45: ["PWM"], 46: ["PWM"],
  50: ["SPI MISO"], 51: ["SPI MOSI"], 52: ["SPI SCK"], 53: ["SPI SS"],
};

const arduinoMega: ComponentDef = {
  id: "arduino-mega-2560",
  name: "Arduino Mega 2560",
  maker: "Arduino",
  category: "mcu",
  description: "ATmega2560 · ลอจิก 5 V · D0-D53, A0-A15, UART 4 ชุด",
  verified: true,
  pins: [
    pin("left", "control", "RESET", "RESET"),
    power("left", "3V3", "3V3", 3.3),
    power("left", "5V", "5V", 5),
    gnd("left", "GND", "GND"),
    gnd("left", "GND_2", "GND"),
    power("left", "VIN", "VIN", undefined, { functions: ["7-12 V in"] }),
    ...range(0, 15).map((n) => avrAnalog("left", n)),
    ...range(22, 37).map((n) => avrDigital("left", n)),
    ...range(0, 21).map((n) => avrDigital("right", n, megaFunctions[n] ?? [], n <= 1 ? { avoid: "ใช้ร่วมกับ USB serial" } : {})),
    ...range(38, 53).map((n) => avrDigital("right", n, megaFunctions[n] ?? [])),
    pin("right", "control", "AREF", "AREF"),
    gnd("right", "GND_3", "GND"),
  ],
};

// ---------------------------------------------------------------------------
// ESP32 / ESP8266 (3.3 V logic, not 5 V tolerant)
// ---------------------------------------------------------------------------

const ESP = { level: 3.3, maxIn: 3.6 };

function gpio(side: PinSide, n: number, alias: string | undefined, functions: string[] = [], extra: Extra = {}): Pin {
  return io(side, `GPIO${n}`, `GPIO${n}`, ESP.level, ESP.maxIn, {
    number: alias,
    functions: functions.length ? functions : undefined,
    ...extra,
  });
}

const STRAP = "ขาบูต (strapping) ระดับตอนเปิดเครื่องมีผลกับการบูต";
const INPUT_ONLY = "อินพุตเท่านั้น (ไม่มี pull-up ภายใน)";

const esp32: ComponentDef = {
  id: "esp32-devkit-v1",
  name: "ESP32 DevKit V1 (30 ขา)",
  maker: "Espressif / DOIT",
  category: "mcu",
  description: "ESP-WROOM-32 · ลอจิก 3.3 V (ไม่ทน 5 V) · Wi-Fi + Bluetooth",
  verified: true,
  pins: [
    pin("left", "control", "EN", "EN", { functions: ["รีเซ็ต"] }),
    pin("left", "analog", "GPIO36", "GPIO36", { number: "VP", voltage: 3.3, maxIn: 3.6, functions: ["ADC1", INPUT_ONLY] }),
    pin("left", "analog", "GPIO39", "GPIO39", { number: "VN", voltage: 3.3, maxIn: 3.6, functions: ["ADC1", INPUT_ONLY] }),
    pin("left", "analog", "GPIO34", "GPIO34", { number: "D34", voltage: 3.3, maxIn: 3.6, functions: ["ADC1", INPUT_ONLY] }),
    pin("left", "analog", "GPIO35", "GPIO35", { number: "D35", voltage: 3.3, maxIn: 3.6, functions: ["ADC1", INPUT_ONLY] }),
    gpio("left", 32, "D32", ["ADC1", "Touch9"]),
    gpio("left", 33, "D33", ["ADC1", "Touch8"]),
    gpio("left", 25, "D25", ["DAC1", "ADC2"]),
    gpio("left", 26, "D26", ["DAC2", "ADC2"]),
    gpio("left", 27, "D27", ["ADC2", "Touch7"]),
    gpio("left", 14, "D14", ["ADC2", "Touch6", "HSPI CLK"]),
    gpio("left", 12, "D12", ["ADC2", "Touch5", "HSPI MISO"], { avoid: `GPIO12: ${STRAP} (ต้องเป็น LOW ตอนบูต)` }),
    gpio("left", 13, "D13", ["ADC2", "Touch4", "HSPI MOSI"]),
    gnd("left", "GND", "GND"),
    power("left", "VIN", "VIN", 5, { functions: ["5 V จาก USB / ไฟเลี้ยงเข้า"] }),
    gpio("right", 23, "D23", ["VSPI MOSI"]),
    gpio("right", 22, "D22", ["I2C SCL"]),
    gpio("right", 1, "TX0", ["UART0 TX"], { avoid: "ใช้ร่วมกับ USB serial (TX0)" }),
    gpio("right", 3, "RX0", ["UART0 RX"], { avoid: "ใช้ร่วมกับ USB serial (RX0)" }),
    gpio("right", 21, "D21", ["I2C SDA"]),
    gpio("right", 19, "D19", ["VSPI MISO"]),
    gpio("right", 18, "D18", ["VSPI SCK"]),
    gpio("right", 5, "D5", ["VSPI SS"], { avoid: `GPIO5: ${STRAP}` }),
    gpio("right", 17, "TX2", ["UART2 TX"]),
    gpio("right", 16, "RX2", ["UART2 RX"]),
    gpio("right", 4, "D4", ["ADC2", "Touch0"]),
    gpio("right", 2, "D2", ["ADC2", "Touch2", "LED"], { avoid: `GPIO2: ${STRAP}` }),
    gpio("right", 15, "D15", ["ADC2", "Touch3"], { avoid: `GPIO15: ${STRAP}` }),
    gnd("right", "GND_2", "GND"),
    power("right", "3V3", "3V3", 3.3),
  ],
};

const nodemcu: ComponentDef = {
  id: "nodemcu-esp8266",
  name: "NodeMCU ESP8266 (ESP-12E)",
  maker: "Espressif / NodeMCU",
  category: "mcu",
  description: "ESP8266 · ลอจิก 3.3 V (ไม่ทน 5 V) · อนาล็อก A0 ตัวเดียว",
  verified: true,
  pins: [
    pin("left", "analog", "A0", "A0", { voltage: 3.3, maxIn: 3.3, functions: ["ADC 0-3.3 V"] }),
    pin("left", "control", "EN", "EN"),
    pin("left", "control", "RST", "RST", { functions: ["รีเซ็ต"] }),
    gnd("left", "GND", "GND"),
    power("left", "3V3", "3V3", 3.3),
    power("left", "VIN", "VIN", 5, { functions: ["5 V จาก USB / ไฟเลี้ยงเข้า"] }),
    gpio("right", 16, "D0", ["WAKE"]),
    gpio("right", 5, "D1", ["I2C SCL"]),
    gpio("right", 4, "D2", ["I2C SDA"]),
    gpio("right", 0, "D3", ["FLASH"], { avoid: "GPIO0: ต้องเป็น HIGH ตอนบูต (ปุ่ม FLASH)" }),
    gpio("right", 2, "D4", ["LED"], { avoid: "GPIO2: ต้องเป็น HIGH ตอนบูต" }),
    gpio("right", 14, "D5", ["SPI SCK"]),
    gpio("right", 12, "D6", ["SPI MISO"]),
    gpio("right", 13, "D7", ["SPI MOSI"]),
    gpio("right", 15, "D8", ["SPI SS"], { avoid: "GPIO15: ต้องเป็น LOW ตอนบูต" }),
    gpio("right", 3, "RX", ["UART RX"], { avoid: "ใช้ร่วมกับ USB serial" }),
    gpio("right", 1, "TX", ["UART TX"], { avoid: "ใช้ร่วมกับ USB serial" }),
    gnd("right", "GND_2", "GND"),
  ],
};

// ---------------------------------------------------------------------------
// Raspberry Pi (3.3 V logic, not 5 V tolerant)
// ---------------------------------------------------------------------------

const PI = { level: 3.3, maxIn: 3.6 };

/** The 40-pin header, physical pins 1-40 (odd = left column, even = right column like the real header). */
const piHeader: [string, PinKind, string[]?][] = [
  ["3V3", "power"], ["5V", "power"],
  ["GPIO2", "bus", ["I2C1 SDA"]], ["5V", "power"],
  ["GPIO3", "bus", ["I2C1 SCL"]], ["GND", "ground"],
  ["GPIO4", "io", ["GPCLK0", "1-Wire"]], ["GPIO14", "bus", ["UART TX"]],
  ["GND", "ground"], ["GPIO15", "bus", ["UART RX"]],
  ["GPIO17", "io"], ["GPIO18", "io", ["PWM0", "PCM CLK"]],
  ["GPIO27", "io"], ["GND", "ground"],
  ["GPIO22", "io"], ["GPIO23", "io"],
  ["3V3", "power"], ["GPIO24", "io"],
  ["GPIO10", "bus", ["SPI0 MOSI"]], ["GND", "ground"],
  ["GPIO9", "bus", ["SPI0 MISO"]], ["GPIO25", "io"],
  ["GPIO11", "bus", ["SPI0 SCLK"]], ["GPIO8", "bus", ["SPI0 CE0"]],
  ["GND", "ground"], ["GPIO7", "bus", ["SPI0 CE1"]],
  ["GPIO0", "io", ["ID_SD (EEPROM HAT)"]], ["GPIO1", "io", ["ID_SC (EEPROM HAT)"]],
  ["GPIO5", "io"], ["GND", "ground"],
  ["GPIO6", "io"], ["GPIO12", "io", ["PWM0"]],
  ["GPIO13", "io", ["PWM1"]], ["GND", "ground"],
  ["GPIO19", "bus", ["SPI1 MISO", "PCM FS"]], ["GPIO16", "io"],
  ["GPIO26", "io"], ["GPIO20", "bus", ["SPI1 MOSI", "PCM DIN"]],
  ["GND", "ground"], ["GPIO21", "bus", ["SPI1 SCLK", "PCM DOUT"]],
];

const raspberryPi: ComponentDef = {
  id: "raspberry-pi-40",
  name: "Raspberry Pi (หัว GPIO 40 ขา)",
  maker: "Raspberry Pi",
  category: "sbc",
  description: "Pi 3 / 4 / 5 / Zero · ลอจิก 3.3 V (ไม่ทน 5 V) · เลขขาตามหัวจริง",
  verified: true,
  pins: piHeader.map(([name, kind, functions], i) => {
    const number = i + 1;
    const side: PinSide = number % 2 === 1 ? "left" : "right";
    const id = `P${number}`;
    if (kind === "power") return power(side, id, name, name === "5V" ? 5 : 3.3, { number: String(number) });
    if (kind === "ground") return gnd(side, id, "GND", { number: String(number) });
    return pin(side, kind, id, name, { number: String(number), voltage: PI.level, maxIn: PI.maxIn, functions });
  }),
};

/** Raspberry Pi Pico: 40 pins, 1-20 down the left, 21-40 up the right. */
const picoLeft: [string, PinKind, string[]?][] = [
  ["GP0", "io", ["UART0 TX", "I2C0 SDA"]], ["GP1", "io", ["UART0 RX", "I2C0 SCL"]], ["GND", "ground"],
  ["GP2", "io", ["I2C1 SDA", "SPI0 SCK"]], ["GP3", "io", ["I2C1 SCL", "SPI0 TX"]],
  ["GP4", "io", ["UART1 TX", "I2C0 SDA", "SPI0 RX"]], ["GP5", "io", ["UART1 RX", "I2C0 SCL"]], ["GND", "ground"],
  ["GP6", "io", ["I2C1 SDA"]], ["GP7", "io", ["I2C1 SCL"]], ["GP8", "io", ["UART1 TX", "I2C0 SDA"]], ["GP9", "io", ["UART1 RX", "I2C0 SCL"]],
  ["GND", "ground"], ["GP10", "io", ["I2C1 SDA", "SPI1 SCK"]], ["GP11", "io", ["I2C1 SCL", "SPI1 TX"]],
  ["GP12", "io", ["UART0 TX", "SPI1 RX"]], ["GP13", "io", ["UART0 RX"]], ["GND", "ground"], ["GP14", "io", ["I2C1 SDA"]], ["GP15", "io", ["I2C1 SCL"]],
];
const picoRight: [string, PinKind, string[]?][] = [
  ["GP16", "io", ["SPI0 RX"]], ["GP17", "io", ["SPI0 CSn"]], ["GND", "ground"], ["GP18", "io", ["SPI0 SCK"]], ["GP19", "io", ["SPI0 TX"]],
  ["GP20", "io", ["I2C0 SDA"]], ["GP21", "io", ["I2C0 SCL"]], ["GND", "ground"], ["GP22", "io"], ["RUN", "control", ["รีเซ็ต"]],
  ["GP26", "analog", ["ADC0"]], ["GP27", "analog", ["ADC1"]], ["AGND", "ground"], ["GP28", "analog", ["ADC2"]], ["ADC_VREF", "power"],
  ["3V3", "power"], ["3V3_EN", "control"], ["GND", "ground"], ["VSYS", "power"], ["VBUS", "power"],
];

function picoPins(list: [string, PinKind, string[]?][], side: PinSide, first: number): Pin[] {
  return list.map(([name, kind, functions], i) => {
    const number = first + i;
    const id = `P${number}`;
    if (kind === "ground") return gnd(side, id, name, { number: String(number) });
    if (kind === "power")
      return power(side, id, name, name === "3V3" || name === "ADC_VREF" ? 3.3 : name === "VBUS" ? 5 : undefined, {
        number: String(number),
        functions: name === "VSYS" ? ["1.8-5.5 V in"] : name === "VBUS" ? ["5 V จาก USB"] : undefined,
      });
    if (kind === "control") return pin(side, "control", id, name, { number: String(number), functions });
    return pin(side, kind, id, name, { number: String(number), voltage: 3.3, maxIn: 3.6, functions });
  });
}

const pico: ComponentDef = {
  id: "raspberry-pi-pico",
  name: "Raspberry Pi Pico",
  maker: "Raspberry Pi",
  category: "mcu",
  description: "RP2040 · ลอจิก 3.3 V (ไม่ทน 5 V) · GP0-GP28 · เลขขาตามบอร์ดจริง",
  verified: true,
  pins: [...picoPins(picoLeft, "left", 1), ...picoPins(picoRight, "right", 21)],
};

// ---------------------------------------------------------------------------
// Relay modules
// ---------------------------------------------------------------------------

function relayModule(channels: number): ComponentDef {
  return {
    id: `relay-module-${channels}ch`,
    name: `Relay module ${channels} ช่อง`,
    maker: "ทั่วไป (ออปโต้ ใช้ไฟ 5 V)",
    category: "relay",
    description: `รีเลย์ ${channels} ช่อง · อินพุต IN รับลอจิก 3.3–5 V · หน้าสัมผัส COM / NO / NC`,
    verified: true,
    pins: [
      power("left", "VCC", "VCC", 5, { functions: ["ไฟขดลวดรีเลย์"] }),
      gnd("left", "GND", "GND"),
      ...range(1, channels).map((n) => pin("left", "io", `IN${n}`, `IN${n}`, { voltage: 5, maxIn: 5.5, functions: ["สั่งรีเลย์ (ส่วนใหญ่ Active LOW)"] })),
      ...range(1, channels).flatMap((n) => [
        pin("right", "relay", `CH${n}_COM`, `CH${n} COM`, { functions: ["หน้าสัมผัสร่วม"] }),
        pin("right", "relay", `CH${n}_NO`, `CH${n} NO`, { functions: ["ปกติเปิด"] }),
        pin("right", "relay", `CH${n}_NC`, `CH${n} NC`, { functions: ["ปกติปิด"] }),
      ]),
    ],
  };
}

// ---------------------------------------------------------------------------
// Motor drivers
// ---------------------------------------------------------------------------

const l298n: ComponentDef = {
  id: "l298n-module",
  name: "L298N Dual H-Bridge",
  maker: "ทั่วไป (โมดูล)",
  category: "driver",
  description: "ไดรเวอร์มอเตอร์ DC 2 ช่อง · 5–35 V · สูงสุด ~2 A ต่อช่อง",
  verified: true,
  pins: [
    power("left", "VS", "+12V (VS)", undefined, { functions: ["ไฟมอเตอร์ 5–35 V"] }),
    gnd("left", "GND", "GND"),
    power("left", "V5", "+5V", 5, { functions: ["ไฟลอจิก (ออก/เข้า ตามจัมเปอร์ 5V-EN)"] }),
    pin("left", "control", "ENA", "ENA", { voltage: 5, maxIn: 5.5, functions: ["PWM ความเร็ว ช่อง A"] }),
    io("left", "IN1", "IN1", 5, 5.5),
    io("left", "IN2", "IN2", 5, 5.5),
    io("left", "IN3", "IN3", 5, 5.5),
    io("left", "IN4", "IN4", 5, 5.5),
    pin("left", "control", "ENB", "ENB", { voltage: 5, maxIn: 5.5, functions: ["PWM ความเร็ว ช่อง B"] }),
    pin("right", "motor", "OUT1", "OUT1", { functions: ["มอเตอร์ A"] }),
    pin("right", "motor", "OUT2", "OUT2", { functions: ["มอเตอร์ A"] }),
    pin("right", "motor", "OUT3", "OUT3", { functions: ["มอเตอร์ B"] }),
    pin("right", "motor", "OUT4", "OUT4", { functions: ["มอเตอร์ B"] }),
  ],
};

const bts7960: ComponentDef = {
  id: "bts7960-43a",
  name: "BTS7960 43A H-Bridge",
  maker: "ทั่วไป (โมดูล)",
  category: "driver",
  description: "ไดรเวอร์มอเตอร์ DC 1 ช่อง · 6–27 V · ~43 A · RPWM/LPWM",
  verified: true,
  pins: [
    power("left", "VCC", "VCC", 5, { functions: ["ไฟลอจิก 5 V"] }),
    gnd("left", "GND", "GND"),
    pin("left", "control", "RPWM", "RPWM", { voltage: 5, maxIn: 5.5, functions: ["PWM เดินหน้า"] }),
    pin("left", "control", "LPWM", "LPWM", { voltage: 5, maxIn: 5.5, functions: ["PWM ถอยหลัง"] }),
    pin("left", "control", "R_EN", "R_EN", { voltage: 5, maxIn: 5.5, functions: ["Enable ด้านขวา"] }),
    pin("left", "control", "L_EN", "L_EN", { voltage: 5, maxIn: 5.5, functions: ["Enable ด้านซ้าย"] }),
    pin("left", "analog", "R_IS", "R_IS", { voltage: 5, functions: ["สัญญาณกระแสขวา"] }),
    pin("left", "analog", "L_IS", "L_IS", { voltage: 5, functions: ["สัญญาณกระแสซ้าย"] }),
    power("right", "BPLUS", "B+", undefined, { functions: ["ไฟมอเตอร์ 6–27 V"] }),
    gnd("right", "BMINUS", "B−"),
    pin("right", "motor", "MPLUS", "M+", { functions: ["ขั้วมอเตอร์"] }),
    pin("right", "motor", "MMINUS", "M−", { functions: ["ขั้วมอเตอร์"] }),
  ],
};

/** A generic dual hub-motor (BLDC) driver for AGV / AMR - labels are generic, NOT one maker's terminals. */
const hubMotorDriver: ComponentDef = {
  id: "agv-dual-hub-driver-generic",
  name: "AGV/AMR dual hub-motor driver (แบบทั่วไป)",
  maker: "แม่แบบ — ตรวจกับคู่มือรุ่นจริง",
  category: "driver",
  description: "แม่แบบไดรเวอร์ BLDC ฮับมอเตอร์ 2 ล้อ: ไฟ DC, CAN, RS485, เฟส U/V/W และฮอลล์ ต่อฝั่ง — ชื่อขั้วเป็นแบบกลาง",
  verified: false,
  pins: [
    power("left", "DC_POS", "DC+", undefined, { functions: ["ไฟเมน (เช่น 24–48 V)"] }),
    gnd("left", "DC_NEG", "DC−"),
    pin("left", "bus", "CAN_H", "CAN_H", { functions: ["CAN"] }),
    pin("left", "bus", "CAN_L", "CAN_L", { functions: ["CAN"] }),
    pin("left", "bus", "RS485_A", "RS485 A", { functions: ["RS485 / Modbus"] }),
    pin("left", "bus", "RS485_B", "RS485 B", { functions: ["RS485 / Modbus"] }),
    gnd("left", "SIG_GND", "GND สัญญาณ"),
    ...[1, 2].flatMap((m) => [
      pin("right", "motor", `M${m}_U`, `M${m} U`, { functions: [`เฟส U มอเตอร์ ${m}`] }),
      pin("right", "motor", `M${m}_V`, `M${m} V`, { functions: [`เฟส V มอเตอร์ ${m}`] }),
      pin("right", "motor", `M${m}_W`, `M${m} W`, { functions: [`เฟส W มอเตอร์ ${m}`] }),
      power("right", `M${m}_HALL_VCC`, `M${m} Hall +5V`, 5),
      pin("right", "io", `M${m}_HALL_A`, `M${m} Hall A`, { voltage: 5, maxIn: 5.5 }),
      pin("right", "io", `M${m}_HALL_B`, `M${m} Hall B`, { voltage: 5, maxIn: 5.5 }),
      pin("right", "io", `M${m}_HALL_C`, `M${m} Hall C`, { voltage: 5, maxIn: 5.5 }),
      gnd("right", `M${m}_HALL_GND`, `M${m} Hall GND`),
    ]),
  ],
};

// ---------------------------------------------------------------------------
// Sensors, displays, inputs, power
// ---------------------------------------------------------------------------

const dht = (id: string, name: string): ComponentDef => ({
  id,
  name,
  maker: "Aosong",
  category: "sensor",
  description: "อุณหภูมิ + ความชื้น · ไฟ 3.3–5 V · สัญญาณดิจิทัลเส้นเดียว",
  verified: true,
  pins: [
    power("left", "VCC", "VCC", undefined, { functions: ["3.3–5 V"] }),
    pin("right", "io", "DATA", "DATA", { voltage: 3.3, maxIn: 5.5, functions: ["1-wire ต้องมีตัวต้านทาน pull-up"] }),
    gnd("left", "GND", "GND"),
  ],
});

const hcsr04: ComponentDef = {
  id: "hc-sr04",
  name: "HC-SR04 Ultrasonic",
  maker: "ทั่วไป",
  category: "sensor",
  description: "วัดระยะอัลตราโซนิก 2–400 ซม. · ไฟ 5 V · ECHO ออก 5 V",
  verified: true,
  pins: [
    power("left", "VCC", "VCC", 5),
    pin("left", "io", "TRIG", "TRIG", { voltage: 5, maxIn: 5.5, functions: ["พัลส์ 10 µs"] }),
    pin("right", "io", "ECHO", "ECHO", { voltage: 5, maxIn: 5.5, functions: ["ออก 5 V — ลดแรงดันก่อนเข้าบอร์ด 3.3 V"] }),
    gnd("left", "GND", "GND"),
  ],
};

const mpu6050: ComponentDef = {
  id: "mpu6050-gy521",
  name: "MPU-6050 (GY-521)",
  maker: "InvenSense",
  category: "sensor",
  description: "ไจโร + แอคเซเลอโรมิเตอร์ 6 แกน · I2C · ไฟ 3.3–5 V",
  verified: true,
  pins: [
    power("left", "VCC", "VCC", undefined, { functions: ["3.3–5 V (มีรีกูเลเตอร์บนบอร์ด)"] }),
    gnd("left", "GND", "GND"),
    pin("left", "bus", "SCL", "SCL", { voltage: 3.3, maxIn: 5.5, functions: ["I2C"] }),
    pin("left", "bus", "SDA", "SDA", { voltage: 3.3, maxIn: 5.5, functions: ["I2C"] }),
    pin("right", "bus", "XDA", "XDA", { functions: ["I2C เสริม"] }),
    pin("right", "bus", "XCL", "XCL", { functions: ["I2C เสริม"] }),
    pin("right", "control", "AD0", "AD0", { functions: ["เลือกแอดเดรส"] }),
    pin("right", "io", "INT", "INT", { voltage: 3.3, maxIn: 3.6, functions: ["ขัดจังหวะ"] }),
  ],
};

const ds18b20: ComponentDef = {
  id: "ds18b20",
  name: "DS18B20 อุณหภูมิ",
  maker: "Maxim",
  category: "sensor",
  description: "เซนเซอร์อุณหภูมิ 1-Wire · ไฟ 3–5.5 V · ต้องมี pull-up 4.7 kΩ ที่ DQ",
  verified: true,
  pins: [
    gnd("left", "GND", "GND"),
    power("left", "VDD", "VDD", undefined, { functions: ["3–5.5 V"] }),
    pin("right", "io", "DQ", "DQ", { voltage: 3.3, maxIn: 5.5, functions: ["1-Wire"] }),
  ],
};

const ssd1306: ComponentDef = {
  id: "oled-ssd1306-i2c",
  name: "OLED 0.96\" SSD1306 (I2C)",
  maker: "ทั่วไป",
  category: "display",
  description: "จอ OLED 128×64 · I2C แอดเดรส 0x3C · ไฟ 3.3–5 V",
  verified: true,
  pins: [
    gnd("left", "GND", "GND"),
    power("left", "VCC", "VCC", undefined, { functions: ["3.3–5 V"] }),
    pin("right", "bus", "SCL", "SCL", { voltage: 3.3, maxIn: 5.5, functions: ["I2C"] }),
    pin("right", "bus", "SDA", "SDA", { voltage: 3.3, maxIn: 5.5, functions: ["I2C"] }),
  ],
};

const servoSg90: ComponentDef = {
  id: "servo-sg90",
  name: "Servo SG90 / MG90S",
  maker: "ทั่วไป",
  category: "display",
  description: "RC servo · ไฟ 4.8–6 V · สัญญาณ PWM 50 Hz",
  verified: true,
  pins: [
    gnd("left", "GND", "GND (น้ำตาล)"),
    power("left", "VPLUS", "V+ (แดง)", 5, { functions: ["4.8–6 V — แยกจากไฟบอร์ดถ้าใช้หลายตัว"] }),
    pin("right", "io", "SIGNAL", "สัญญาณ (ส้ม)", { voltage: 3.3, maxIn: 5.5, functions: ["PWM 50 Hz"] }),
  ],
};

const pushButton: ComponentDef = {
  id: "push-button",
  name: "ปุ่มกด (Push button)",
  maker: "ทั่วไป",
  category: "display",
  description: "สวิตช์ 2 ขั้ว · ต่อกับพินที่เปิด pull-up ภายใน หรือต้านทาน pull-up/pull-down",
  verified: true,
  pins: [pin("left", "passive", "T1", "ขั้ว 1"), pin("right", "passive", "T2", "ขั้ว 2")],
};

const eStop: ComponentDef = {
  id: "emergency-stop",
  name: "E-Stop (ปุ่มฉุกเฉิน NC)",
  maker: "ทั่วไป",
  category: "display",
  description: "ปุ่มหยุดฉุกเฉินหน้าสัมผัส NC · ต่ออนุกรมในวงจรไฟควบคุม",
  verified: true,
  pins: [pin("left", "passive", "NC1", "NC 1"), pin("right", "passive", "NC2", "NC 2")],
};

const led: ComponentDef = {
  id: "led",
  name: "LED",
  maker: "ทั่วไป",
  category: "display",
  description: "ไดโอดเปล่งแสง · ต้องมีตัวต้านทานจำกัดกระแสอนุกรม (≈220 Ω ที่ 5 V)",
  verified: true,
  pins: [pin("left", "passive", "ANODE", "A (+)"), pin("right", "passive", "CATHODE", "K (−)")],
};

const dcSupply = (id: string, volts: number): ComponentDef => ({
  id,
  name: `แหล่งจ่ายไฟ DC ${volts} V`,
  maker: "ทั่วไป",
  category: "power",
  description: `แหล่งจ่าย / แบตเตอรี่ ${volts} V DC`,
  verified: true,
  pins: [power("right", "POS", "+", volts), gnd("right", "NEG", "−")],
});

const buck: ComponentDef = {
  id: "buck-converter",
  name: "Buck converter (ลดแรงดัน DC)",
  maker: "ทั่วไป (LM2596 / XL4015)",
  category: "power",
  description: "แปลงไฟ DC ลงเป็นแรงดันที่ตั้งไว้ · แรงดันขาออกปรับได้ (ไม่ได้ตรวจแรงดันให้)",
  verified: true,
  pins: [power("left", "IN_POS", "IN+"), gnd("left", "IN_NEG", "IN−"), power("right", "OUT_POS", "OUT+"), gnd("right", "OUT_NEG", "OUT−")],
};

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

export const COMPONENTS: ComponentDef[] = [
  arduinoUno,
  arduinoNano,
  arduinoMega,
  esp32,
  nodemcu,
  pico,
  raspberryPi,
  l298n,
  bts7960,
  hubMotorDriver,
  relayModule(1),
  relayModule(2),
  relayModule(4),
  relayModule(8),
  relayModule(16),
  dht("dht11", "DHT11"),
  dht("dht22", "DHT22 (AM2302)"),
  ds18b20,
  hcsr04,
  mpu6050,
  ssd1306,
  servoSg90,
  pushButton,
  eStop,
  led,
  dcSupply("dc-supply-5v", 5),
  dcSupply("dc-supply-12v", 12),
  dcSupply("dc-supply-24v", 24),
  buck,
];

const BY_ID = new Map(COMPONENTS.map((c) => [c.id, c]));

export function getComponent(id: unknown): ComponentDef | undefined {
  return typeof id === "string" ? BY_ID.get(id) : undefined;
}

export function getPin(def: ComponentDef, pinId: string | null | undefined): Pin | undefined {
  return pinId ? def.pins.find((p) => p.id === pinId) : undefined;
}

export function componentsByCategory(): { id: CategoryId; components: ComponentDef[] }[] {
  const order: CategoryId[] = ["mcu", "sbc", "driver", "relay", "sensor", "display", "power", "general"];
  return order
    .map((id) => ({ id, components: COMPONENTS.filter((c) => c.category === id) }))
    .filter((g) => g.components.length > 0);
}

/** Rows a symbol needs: the taller of its two sides. */
export function symbolRows(def: ComponentDef): number {
  const left = def.pins.filter((p) => p.side === "left").length;
  const right = def.pins.filter((p) => p.side === "right").length;
  return Math.max(left, right, 1);
}

/** Search by name, maker, description or any pin name / function. */
export function searchComponents(query: string): ComponentDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return COMPONENTS;
  return COMPONENTS.filter((c) =>
    [c.name, c.maker ?? "", c.description, ...c.pins.flatMap((p) => [p.name, ...(p.functions ?? [])])].some((t) => t.toLowerCase().includes(q))
  );
}
