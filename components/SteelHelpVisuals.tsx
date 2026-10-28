/** Pictures for the Steel Cutting "?" dialog: people look at these instead of
 *  reading, so each one carries its own short Thai labels. */
export default function SteelHelpVisuals() {
  return (
    <div className="space-y-4">
      <figure className="rounded-lg border border-gray-200 bg-white p-3">
        <figcaption className="mb-2 text-sm font-semibold text-gray-900">1. อ่านตารางในแบบ แล้วระบบเอาไปใส่ช่องไหน</figcaption>
        <svg viewBox="0 0 640 200" className="h-auto w-full" role="img" aria-label="ตัวอย่างแถวในตาราง BOM และช่องที่ระบบใช้">
          <g fontSize="13" textAnchor="middle" fill="#374151">
            <rect x="10" y="10" width="620" height="30" fill="#f3f4f6" stroke="#9ca3af" />
            <text x="55" y="30">ITEM NO.</text>
            <text x="140" y="30">QTY.</text>
            <text x="330" y="30">DESCRIPTION</text>
            <text x="560" y="30">LENGTH</text>
            <rect x="10" y="40" width="620" height="34" fill="#fff" stroke="#9ca3af" />
            <text x="55" y="63">1</text>
            <rect x="106" y="46" width="68" height="22" rx="4" fill="#dbeafe" stroke="#3b82f6" />
            <text x="140" y="62" fontWeight="700">16</text>
            <text x="238" y="63">ST</text>
            <rect x="262" y="46" width="34" height="22" rx="4" fill="#fee2e2" stroke="#ef4444" />
            <text x="279" y="62" fontWeight="700">75</text>
            <text x="308" y="63">x</text>
            <rect x="320" y="46" width="34" height="22" rx="4" fill="#dcfce7" stroke="#22c55e" />
            <text x="337" y="62" fontWeight="700">75</text>
            <text x="366" y="63">x</text>
            <rect x="378" y="46" width="38" height="22" rx="4" fill="#fef9c3" stroke="#eab308" />
            <text x="397" y="62" fontWeight="700">2.3</text>
            <rect x="522" y="46" width="76" height="22" rx="4" fill="#ffedd5" stroke="#f97316" />
            <text x="560" y="62" fontWeight="700">1742</text>
          </g>
          <g fontSize="13" textAnchor="middle" fontWeight="700">
            <line x1="140" y1="74" x2="140" y2="112" stroke="#3b82f6" />
            <text x="140" y="130" fill="#1d4ed8">QTY</text>
            <text x="140" y="146" fontSize="11" fontWeight="400" fill="#4b5563">กี่ชิ้น</text>
            <line x1="279" y1="74" x2="279" y2="112" stroke="#ef4444" />
            <text x="279" y="130" fill="#b91c1c">x</text>
            <text x="279" y="146" fontSize="11" fontWeight="400" fill="#4b5563">กว้าง</text>
            <line x1="337" y1="74" x2="337" y2="112" stroke="#22c55e" />
            <text x="337" y="130" fill="#15803d">y</text>
            <text x="337" y="146" fontSize="11" fontWeight="400" fill="#4b5563">ยาว</text>
            <line x1="397" y1="74" x2="397" y2="112" stroke="#eab308" />
            <text x="397" y="130" fill="#a16207">t</text>
            <text x="397" y="146" fontSize="11" fontWeight="400" fill="#4b5563">หนา</text>
            <line x1="560" y1="74" x2="560" y2="112" stroke="#f97316" />
            <text x="560" y="130" fill="#c2410c">z</text>
            <text x="560" y="146" fontSize="11" fontWeight="400" fill="#4b5563">ความยาวที่ตัด / ชิ้น</text>
            <text x="238" y="130" fill="#374151">ST / RT</text>
            <text x="238" y="146" fontSize="11" fontWeight="400" fill="#4b5563">ชนิดเหล็ก</text>
            <line x1="238" y1="74" x2="238" y2="112" stroke="#6b7280" />
          </g>
          <text x="320" y="185" fontSize="12" textAnchor="middle" fill="#6b7280">
            แถวที่ x, y, z หรือ QTY ไม่ครบ (เช่น Sheet) ระบบข้ามให้
          </text>
        </svg>
      </figure>

      <figure className="rounded-lg border border-gray-200 bg-white p-3">
        <figcaption className="mb-2 text-sm font-semibold text-gray-900">2. ST กับ RT ต่างกันยังไง</figcaption>
        <svg viewBox="0 0 640 190" className="h-auto w-full" role="img" aria-label="หน้าตัดเหล็กกล่องจัตุรัส ST และสี่เหลี่ยมผืนผ้า RT">
          <g fontSize="13" textAnchor="middle" fill="#374151">
            <rect x="70" y="30" width="100" height="100" fill="#9ca3af" stroke="#4b5563" strokeWidth="2" />
            <rect x="82" y="42" width="76" height="76" fill="#fff" stroke="#4b5563" />
            <text x="120" y="156" fontWeight="700">ST (จัตุรัส)</text>
            <text x="120" y="174" fontSize="11" fill="#6b7280">กว้าง = ยาว เช่น 50 x 50</text>
            <text x="120" y="22" fill="#b91c1c" fontWeight="700">x</text>
            <text x="56" y="84" fill="#15803d" fontWeight="700">y</text>
            <line x1="170" y1="42" x2="158" y2="42" stroke="#a16207" strokeWidth="2" />
            <text x="190" y="46" fill="#a16207" fontWeight="700">t หนา</text>

            <rect x="340" y="50" width="150" height="80" fill="#9ca3af" stroke="#4b5563" strokeWidth="2" />
            <rect x="352" y="62" width="126" height="56" fill="#fff" stroke="#4b5563" />
            <text x="415" y="156" fontWeight="700">RT (ผืนผ้า)</text>
            <text x="415" y="174" fontSize="11" fill="#6b7280">กว้าง ≠ ยาว เช่น 75 x 38</text>
            <text x="415" y="42" fill="#b91c1c" fontWeight="700">x</text>
            <text x="324" y="94" fill="#15803d" fontWeight="700">y</text>
            <text x="560" y="94" fill="#6b7280" fontSize="12">ความยาวเหล็ก = z</text>
          </g>
        </svg>
      </figure>

      <figure className="rounded-lg border border-gray-200 bg-white p-3">
        <figcaption className="mb-2 text-sm font-semibold text-gray-900">3. เหล็ก 1 เส้น ตัดได้กี่ชิ้น</figcaption>
        <svg viewBox="0 0 640 170" className="h-auto w-full" role="img" aria-label="เหล็กยาว 6000 มม. ตัดเป็นชิ้นและเศษ">
          <g fontSize="13" textAnchor="middle" fill="#374151">
            <rect x="20" y="40" width="600" height="36" fill="#f3f4f6" stroke="#4b5563" strokeWidth="2" />
            <rect x="20" y="40" width="174" height="36" fill="#fdba74" stroke="#fff" strokeWidth="2" />
            <rect x="194" y="40" width="174" height="36" fill="#fdba74" stroke="#fff" strokeWidth="2" />
            <rect x="368" y="40" width="174" height="36" fill="#fdba74" stroke="#fff" strokeWidth="2" />
            <text x="107" y="63" fontWeight="700">1742</text>
            <text x="281" y="63" fontWeight="700">1742</text>
            <text x="455" y="63" fontWeight="700">1742</text>
            <text x="581" y="63" fill="#6b7280">เศษ</text>
            <text x="320" y="24" fontWeight="700">เหล็กมาตรฐาน 6,000 มม. 1 เส้น</text>
            <text x="320" y="98" fill="#6b7280" fontSize="12">ตัด 3 ชิ้น เหลือเศษ (หักความหนาใบเลื่อยแล้ว)</text>
          </g>
          <g fontSize="13" fill="#374151">
            <rect x="20" y="116" width="14" height="14" fill="#fff" stroke="#4b5563" />
            <path d="M22 123 l4 4 l7 -9" stroke="#16a34a" strokeWidth="2" fill="none" />
            <text x="42" y="128">ติ๊ก = ใช้เหล็กยาวมาตรฐาน 6,000</text>
            <rect x="330" y="116" width="14" height="14" fill="#fff" stroke="#4b5563" />
            <text x="352" y="128">ไม่ติ๊ก = กรอกความยาวเอง</text>
            <text x="20" y="156" fontSize="11" fill="#6b7280">ติ๊กได้แยกตามชนิดเหล็กในแต่ละกลุ่ม</text>
          </g>
        </svg>
      </figure>
    </div>
  );
}
