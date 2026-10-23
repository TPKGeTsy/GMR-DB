// Floor-plan zones for the /modbus page. Pure data — no server imports — so
// both the client map component and the tests can use it.
//
// Coordinates are traced from the hand-drawn plans (map 1: R1-R3 / F1-F3
// building; map 2: Store 1-3 and the Hibay bays), in each map's own viewBox
// units.
//
// Zone -> output assignment is a choice made in software, NOT read from the
// real wiring: if a zone lights the wrong area, change its `channel` here
// (0-based global channel, i.e. channel number minus 1) — nothing else needs
// to change. There are two 16-channel modules: channels 0-15 are module 1,
// 16-31 are module 2 (see lib/relayState.ts). A zone with `channel: null` is
// drawn greyed out and can't be switched.

export interface Zone {
  id: string;
  label: string;
  /** 0-based global channel (channel number - 1); null = no channel yet. */
  channel: number | null;
  /** Drawn as a person pictogram instead of the name (e.g. the restrooms). */
  icon?: "male" | "female";
}

export const ZONES: Zone[] = [
  // map 1 — CH1-CH6
  { id: "R1", label: "R1", channel: 0 },
  { id: "R2", label: "R2", channel: 1 },
  { id: "R3", label: "R3", channel: 2 },
  { id: "F1", label: "F1", channel: 3 },
  { id: "F2", label: "F2", channel: 4 },
  { id: "F3", label: "F3", channel: 5 },
  // map 2 — CH7-CH16 (Stores keep CH10-CH12, which already have saved states)
  { id: "HIBAY_1_1", label: "Hibay 1-1", channel: 6 },
  { id: "HIBAY_1_2", label: "Hibay 1-2", channel: 7 },
  { id: "HIBAY_2_1", label: "Hibay 2-1", channel: 8 },
  { id: "STORE1", label: "Store 1", channel: 9 },
  { id: "STORE2", label: "Store 2", channel: 10 },
  { id: "STORE3", label: "Store 3", channel: 11 },
  { id: "HIBAY_2_2", label: "Hibay 2-2", channel: 12 },
  { id: "HIBAY_2_3", label: "Hibay 2-3", channel: 13 },
  { id: "HIBAY_3_1", label: "Hibay 3-1", channel: 14 },
  { id: "HIBAY_3_2", label: "Hibay 3-2", channel: 15 },
  // module 2 (CH17-CH32) — the 17th zone is its first channel
  { id: "HIBAY_3_3", label: "Hibay 3-3", channel: 16 },
  // the restrooms (top-right rooms of map 2) — CH18 / CH19, also module 2
  { id: "WC_MALE", label: "ห้องน้ำชาย", channel: 17, icon: "male" },
  { id: "WC_FEMALE", label: "ห้องน้ำหญิง", channel: 18, icon: "female" },
];

export const ZONE_BY_ID: Record<string, Zone> = Object.fromEntries(ZONES.map((z) => [z.id, z]));

export interface ZoneShape {
  zoneId: string;
  /** SVG polygon `points`. */
  points: string;
  /** Where the zone name is drawn. */
  labelAt: [number, number];
  /** Font size of the zone name (default 26). */
  labelSize?: number;
  /** Centre and scale of the pictogram for zones that have an `icon`. */
  iconAt?: [number, number];
  iconScale?: number;
}

export interface FloorMap {
  id: string;
  title: string;
  viewBox: string;
  shapes: ZoneShape[];
  /** Wall paths (thick stroke, not clickable). */
  walls: string[];
  /** Thin-stroke fixtures such as door swings. */
  thin?: string[];
  /** Plain text on the plan that isn't a zone (e.g. room names). */
  texts?: { text: string; at: [number, number]; size?: number }[];
  /** Staircase block, drawn as a hatched rectangle: [x, y, w, h]. */
  stairs?: [number, number, number, number];
}

export const FLOOR_MAPS: FloorMap[] = [
  {
    id: "main",
    title: "อาคารหลัก (R / F)",
    viewBox: "670 490 770 600",
    shapes: [
      { zoneId: "R1", points: "1270,517 1403,517 1403,785 1270,785", labelAt: [1336, 660] },
      { zoneId: "R2", points: "1032,517 1270,517 1270,785 1032,785", labelAt: [1151, 700] },
      { zoneId: "R3", points: "903,517 1032,517 1032,785 903,785", labelAt: [967, 640] },
      { zoneId: "F1", points: "1270,785 1403,785 1403,1053 1270,1053", labelAt: [1336, 925] },
      { zoneId: "F2", points: "1032,785 1270,785 1270,1053 1032,1053", labelAt: [1151, 925] },
      { zoneId: "F3", points: "797,785 1032,785 1032,1053 815,1053", labelAt: [868, 925] },
    ],
    walls: [
      // outer shell: top, right, bottom (door gap at x 1305-1368), slanted left
      "M715 517 H1403 V1053 H1368",
      "M1305 1053 H815 L797 785 H903 V765",
      // two small rooms, top-left
      "M903 517 V703 H715 V517",
      "M800 517 V703",
      // R1 room wall and the closet notch inside R2
      "M1270 517 V785 H1403",
      "M1102 517 V650 H1240",
    ],
    stairs: [936, 802, 66, 184],
  },
  {
    id: "hibay",
    title: "Hibay / Store",
    viewBox: "340 410 1060 800",
    shapes: [
      // top row (y 440-625)
      { zoneId: "STORE3", points: "372,440 561,440 561,625 372,625", labelAt: [466, 545] },
      { zoneId: "HIBAY_3_3", points: "561,440 711,440 711,625 561,625", labelAt: [636, 545], labelSize: 22 },
      { zoneId: "HIBAY_2_3", points: "711,440 879,440 879,625 711,625", labelAt: [795, 545], labelSize: 22 },
      // middle row (y 625-811)
      { zoneId: "STORE2", points: "372,625 561,625 561,811 372,811", labelAt: [466, 725] },
      { zoneId: "HIBAY_3_2", points: "561,625 711,625 711,811 561,811", labelAt: [636, 725], labelSize: 22 },
      { zoneId: "HIBAY_2_2", points: "711,625 879,625 879,811 711,811", labelAt: [795, 725], labelSize: 22 },
      { zoneId: "HIBAY_1_1", points: "879,625 1245,625 1245,811 879,811", labelAt: [1010, 725] },
      // bottom row (y 811-1005)
      { zoneId: "STORE1", points: "372,811 561,811 561,998 372,998", labelAt: [466, 910] },
      { zoneId: "HIBAY_3_1", points: "561,811 711,811 711,1005 561,1005", labelAt: [636, 910], labelSize: 22 },
      { zoneId: "HIBAY_2_1", points: "711,811 879,811 879,1005 711,1005", labelAt: [795, 910], labelSize: 22 },
      { zoneId: "HIBAY_1_2", points: "879,811 1050,811 1054,1005 879,1005", labelAt: [965, 915], labelSize: 22 },
      // the two small rooms, top-right: men's (left) and women's (right)
      { zoneId: "WC_MALE", points: "998,440 1122,440 1122,623 998,623", labelAt: [1082, 590], iconAt: [1060, 508], iconScale: 1.4 },
      { zoneId: "WC_FEMALE", points: "1122,440 1241,440 1241,623 1122,623", labelAt: [1197, 590], iconAt: [1181, 508], iconScale: 1.4 },
    ],
    walls: [
      // top wall, right end wall and the bottom of the right-hand room
      "M372 440 H1241 V623 H1155",
      // left wall, bottom-left wall and its diagonal
      "M372 440 V998 H558 L746 1187",
      // wall between the stores and the Hibay bays
      "M561 440 V820",
      // the two small rooms (restrooms)
      "M998 440 V585 M1122 440 V623 M993 623 H1125",
      // big right-hand wall with its slanted return
      "M1050 811 H1252 M1050 811 L1073 1187",
    ],
    thin: [
      // double door on the right
      "M1248 634 H1345 Q1345 700 1248 718",
      "M1248 722 Q1340 740 1342 798 H1248",
      // door swings of the two small rooms
      "M998 585 Q1040 590 1040 615",
      "M1128 585 Q1155 590 1155 623",
    ],
  },
];

export interface ChannelAssignment {
  /** 0-based coil address. */
  channel: number;
  /** The zone wired to this channel, or null when it is a spare. */
  zone: Zone | null;
  /** Display name: the zone label, or "Spare". */
  name: string;
}

/** One entry per channel, in channel order. Unassigned ones are Spare. */
export function channelAssignments(channelCount: number): ChannelAssignment[] {
  return Array.from({ length: channelCount }, (_, channel) => {
    const zone = ZONES.find((z) => z.channel === channel) ?? null;
    return { channel, zone, name: zone ? zone.label : "Spare" };
  });
}

/** Every zone referenced by a map must exist; used by the tests. */
export function zoneIdsInMaps(): string[] {
  return FLOOR_MAPS.flatMap((m) => m.shapes.map((s) => s.zoneId));
}
