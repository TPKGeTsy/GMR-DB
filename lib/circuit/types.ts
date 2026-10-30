// A data-driven library of boards and parts for the Circuit page. Each part is a list of pins with
// what each pin is (supply, ground, signal ...), its voltage / logic level and what it can do, so the
// symbol can be drawn the same way for every part and the wiring can be checked.

export type PinKind =
  | "power" // a supply pin (5V, 3V3, VIN, B+ ...)
  | "ground"
  | "io" // digital signal pin (GPIO, D13, IN1 ...)
  | "analog" // analog input
  | "bus" // I2C / SPI / UART / RS485 / CAN lines - may be shared by several devices
  | "control" // enable / reset / PWM request lines
  | "relay" // relay contact (COM / NO / NC) - switches a load, never a logic pin
  | "motor" // motor / load output terminal
  | "passive"; // button, LED, potentiometer ... no electrical rules applied

export type PinSide = "left" | "right";

export interface Pin {
  /** Stable id (used by saved wires - never rename). */
  id: string;
  /** What is printed next to the pin. */
  name: string;
  /** Header / physical pin number, shown small (e.g. "21" or "P3"). */
  number?: string;
  side: PinSide;
  kind: PinKind;
  /** Supply pins: its voltage. Signal pins: the logic level (V). */
  voltage?: number;
  /** The highest voltage the pin can safely take as an input. */
  maxIn?: number;
  /** What the pin can do: ["PWM", "I2C SDA", ...]. */
  functions?: string[];
  /** Why the pin should be avoided (e.g. connected to the flash chip). */
  avoid?: string;
}

export type CategoryId = "mcu" | "sbc" | "driver" | "relay" | "sensor" | "display" | "power" | "general";

export interface ComponentDef {
  id: string;
  name: string;
  maker?: string;
  category: CategoryId;
  description: string;
  /** false = a template whose pins still have to be checked against the datasheet. */
  verified: boolean;
  pins: Pin[];
}

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "mcu", label: "ไมโครคอนโทรลเลอร์" },
  { id: "sbc", label: "คอมพิวเตอร์บอร์ดเดียว" },
  { id: "driver", label: "ไดรเวอร์มอเตอร์ (AGV / AMR)" },
  { id: "relay", label: "รีเลย์ / Modbus / PLC" },
  { id: "sensor", label: "เซนเซอร์" },
  { id: "display", label: "จอ / อินพุต / เอาต์พุต" },
  { id: "power", label: "แหล่งจ่ายไฟ" },
  { id: "general", label: "ทั่วไป" },
];

/** Colour of a pin by its kind (symbol, legend and the wire table use the same). */
export const KIND_COLORS: Record<PinKind, string> = {
  power: "#dc2626",
  ground: "#475569",
  io: "#16a34a",
  analog: "#2563eb",
  bus: "#7c3aed",
  control: "#d97706",
  relay: "#0891b2",
  motor: "#be185d",
  passive: "#94a3b8",
};

export const KIND_LABELS: Record<PinKind, string> = {
  power: "ไฟเลี้ยง",
  ground: "กราวด์ (GND)",
  io: "สัญญาณดิจิทัล",
  analog: "อนาล็อก",
  bus: "บัส (I2C / SPI / UART / RS485 / CAN)",
  control: "ควบคุม (EN / RESET / PWM)",
  relay: "หน้าสัมผัสรีเลย์",
  motor: "ขั้วมอเตอร์ / โหลด",
  passive: "อุปกรณ์ทั่วไป",
};
