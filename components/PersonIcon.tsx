// Standard restroom pictogram — blue man in trousers, pink woman in a dress —
// drawn around (0, 0) in a box about 40 wide and 70 tall. `PersonGlyph` is the
// bare <g> for use inside an existing <svg> (the floor plan); `PersonIcon` is a
// small standalone <svg> for use in ordinary HTML (the channel cards).

export type PersonKind = "male" | "female";

export function PersonGlyph({ kind }: { kind: PersonKind }) {
  const fill = kind === "male" ? "#2563eb" : "#ec4899";
  return (
    <g fill={fill}>
      <circle cx={0} cy={-27} r={8} />
      {kind === "male" ? (
        <>
          {/* torso with arms, then two legs */}
          <rect x={-13} y={-16} width={26} height={26} rx={5} />
          <rect x={-10} y={8} width={8} height={25} rx={3} />
          <rect x={2} y={8} width={8} height={25} rx={3} />
        </>
      ) : (
        <>
          {/* dress, then two legs */}
          <path d="M-4 -16 H4 L15 14 H-15 Z" strokeLinejoin="round" stroke={fill} strokeWidth={3} />
          <rect x={-8} y={14} width={6} height={19} rx={2.5} />
          <rect x={2} y={14} width={6} height={19} rx={2.5} />
        </>
      )}
    </g>
  );
}

export default function PersonIcon({ kind, className }: { kind: PersonKind; className?: string }) {
  return (
    <svg viewBox="-20 -38 40 74" className={className} aria-hidden="true">
      <PersonGlyph kind={kind} />
    </svg>
  );
}
