# GMR Modbus agent (Raspberry Pi)

โปรแกรมเล็กๆ ที่รันบน Raspberry Pi **ในออฟฟิศ** (วง LAN เดียวกับโมดูล ETH-Modbus-IO16T)
ทำหน้าที่คุยกับโมดูลแทนเว็บที่อยู่บน cloud — รองรับ **2 โมดูล (32 ช่อง)**:
ช่อง 1–16 อยู่โมดูล 1 (`MODBUS_HOST`), ช่อง 17–32 อยู่โมดูล 2 (`MODBUS_HOST_2`)

```
ผู้ใช้ ──HTTPS──▶ เว็บบน cloud ──(ฐานข้อมูล)──▶ /api/modbus-agent/desired ──▶ Pi ──Modbus TCP :502──▶ โมดูล
                       ◀──(ฐานข้อมูล)── /api/modbus-agent/report  ◀── Pi ◀────────────────────── โมดูล
```

ทำไมต้องมี Pi: โมดูลมี watchdog ~2 วินาที ถ้าไม่มีคำสั่ง Modbus เข้ามาเอาต์พุตจะดับเอง
จึงต้องมีโปรเซสที่รันตลอดเวลาในวง LAN เดียวกัน ส่งคำสั่งอ่านทุก 0.5 วินาทีขณะมีช่องเปิดอยู่
(เว็บบน cloud / serverless ทำแบบนี้ไม่ได้)

Pi **ต่อออกไปหาเว็บเท่านั้น** (HTTPS ขาออก) ไม่ต้องเปิดพอร์ตขาเข้า และ **ไม่ต้องเก็บรหัสผ่านฐานข้อมูล**
ใช้แค่ `MODBUS_AGENT_TOKEN`

## 1) ฝั่งเว็บ (cloud)

ใส่ env เหล่านี้ที่เซิร์ฟเวอร์เว็บ แล้ว deploy ใหม่:

```
MODBUS_MODE=agent
MODBUS_AGENT_TOKEN=<สุ่มยาวๆ>
```

สร้างโทเคน:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

ต้องรัน migration ให้มีตาราง `modbus_agent_status` ก่อน (`npm run build` รัน `prisma migrate deploy` ให้เอง)

ถ้าเว็บรันบน Vercel: Pi ถามเว็บทุก 2 วินาที (~43,000 ครั้ง/วัน) ถ้าติดโควตา ให้ตั้ง `AGENT_POLL_MS=5000`
ที่ Pi (ปุ่มบนเว็บจะตอบช้าลงเล็กน้อย)

## 2) ฝั่ง Pi

ต้องการ Node.js 20 ขึ้นไป

```bash
# ติดตั้ง Node 20 (ครั้งแรก)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# เอาโค้ดมา
git clone https://github.com/TPKGeTsy/GMR-DB.git
cd GMR-DB/agent
npm install

# ตั้งค่า
cp env.example .env
nano .env        # ใส่ CLOUD_URL, MODBUS_AGENT_TOKEN, MODBUS_HOST
```

ลองรันก่อน (กด Ctrl+C เพื่อหยุด):

```bash
NODE_PATH=$PWD/node_modules npm start
```

ควรเห็น `agent started: module ...` และเมื่อกดเปิดจากเว็บ จะเห็น `applied saved state to channel(s) ...`

ติดตั้งเป็นบริการให้เปิดเองตอนบูต (แก้ `User` / path ในไฟล์ถ้าไม่ใช่ `pi` และ `/home/pi/GMR-DB`):

```bash
sudo cp gmr-modbus-agent.service /etc/systemd/system/
sudo nano /etc/systemd/system/gmr-modbus-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now gmr-modbus-agent
journalctl -u gmr-modbus-agent -f      # ดู log สด
```

อัปเดตโค้ดภายหลัง: `git pull && cd agent && npm install && sudo systemctl restart gmr-modbus-agent`

## 3) ตั้ง IP ของโมดูล (รวมโมดูลที่ 2, ช่อง 17–32)

ตั้งได้ **จากหน้าเว็บ `/modbus` → "ตั้งค่าโมดูล (IP)"** (เฉพาะ ADMIN / OPERATOR) ใส่ IP / พอร์ต / Unit ID ของโมดูลแต่ละตัวแล้วกดบันทึก
Pi จะดึงค่านี้จากเว็บเองภายในไม่กี่วินาที (และจำไว้ใน `agent/desired.json` เผื่อรีบูตตอนเน็ตหลุด) **ไม่ต้องแก้ `.env` บน Pi**

ลำดับความสำคัญ: ค่าที่ตั้งจากหน้าเว็บ > `.env` บน Pi (`MODBUS_HOST`, `MODBUS_HOST_2`) > ค่าเริ่มต้น
(โมดูล 1 เริ่มต้นที่ 192.168.1.12, โมดูล 2 ไม่มีค่าเริ่มต้น = ยังไม่ติดตั้ง)

- โมดูล 2 ที่ยังไม่ได้ใส่ IP: เว็บแสดงโซนของโมดูล 2 เป็นสีเทา "โมดูล 2 ยังไม่ตั้งค่า" กดไม่ได้ และโมดูล 1 ทำงานปกติ
- IP ที่ตั้งจากหน้าเว็บ **ไม่ได้เปลี่ยนค่าในตัวโมดูล** ถ้าจะย้ายโมดูลไปวงอื่น ต้องตั้ง IP ในหน้าตั้งค่าของโมดูลเองก่อน
  (กด 保存并重启) แล้วค่อยมาใส่ IP ใหม่ที่หน้าเว็บ
- รับเฉพาะ IP ภายในองค์กร (10.x, 172.16–31.x, 192.168.x) เพื่อไม่ให้ชี้ไปที่อินเทอร์เน็ตได้
- เลขสถานี (本机站号) ของโมดูลใส่ในช่อง Unit ID (ปกติ 1)
- โมดูลแต่ละตัวเป็นอิสระต่อกัน: ถอดสายโมดูลใดโมดูลหนึ่ง อีกตัวไม่กระทบ และเว็บบอกว่าตัวไหนไม่ตอบ

ต้องรัน migration `modbus_agent_modules` และ `modbus_module_config` ที่เว็บด้วย
(`npm run build` รัน `prisma migrate deploy` ให้เอง)

## 4) เครือข่าย

- Pi ใช้ IP คงที่ (หรือ DHCP reservation) ต่อสาย LAN เข้า router/switch เดียวกับโมดูล
- โมดูลตั้ง IP/Subnet/Gateway ให้อยู่วงเดียวกับ Pi (หน้าตั้งค่าของโมดูล แล้วกด 保存并重启) แล้วใส่ IP นั้นใน `MODBUS_HOST`
- Pi ต้อง (1) ติดต่อโมดูลที่พอร์ต 502 ได้ (2) ออกอินเทอร์เน็ตผ่าน HTTPS (พอร์ต 443) ได้
- **ห้ามเปิดพอร์ต 502 ออกอินเทอร์เน็ต** — Modbus ไม่มีรหัสผ่าน ใครถึงพอร์ตนี้ได้ก็สั่งไฟได้
  ควรให้แค่ Pi คุยกับโมดูล

## 5) พฤติกรรมที่ควรรู้

| เหตุการณ์ | ผล |
|---|---|
| อินเทอร์เน็ตออฟฟิศหลุด | **ไฟที่เปิดอยู่ยังติดต่อ** Pi ใช้สถานะล่าสุดที่จำไว้ (`agent/desired.json`) ปุ่มบนเว็บใช้ไม่ได้ชั่วคราว |
| Pi รีบูต (เน็ตยังหลุดอยู่ก็ตาม) | ไฟดับช่วงสั้นๆ (~2 วินาที เพราะ watchdog ของโมดูล) แล้ว Pi คืนให้จากไฟล์ที่จำไว้ |
| **Pi ดับ/ถอดปลั๊ก** | **ไฟดับภายใน ~2 วินาที** (ออกแบบของโมดูล) เว็บขึ้นแถบเหลือง "ไม่ได้รับสถานะจาก Raspberry Pi" ควรใช้ปลั๊ก/ไฟที่เสถียร หรือ UPS |
| โมดูลต่อไม่ได้ | Pi ไม่ส่ง heartbeat เว็บขึ้นแถบเหลืองเหมือนกัน และพยายามต่อใหม่เองทุกวินาที |
| กดจากเว็บ | เว็บเขียนสถานะที่ต้องการลง DB แล้วรอ Pi ยืนยัน (ปกติ 1–3 วินาที, รอสูงสุด 7 วินาที ถ้าไม่ยืนยันจะยกเลิกคำสั่งและแจ้ง error) |
| ปิดอัตโนมัติ (`MODBUS_AUTO_OFF_*`) | cron บนเว็บเปลี่ยนสถานะเป็น OFF แล้ว Pi สั่งปิดให้ |

## 6) แก้ปัญหา

- `journalctl -u gmr-modbus-agent -f` ดู log
- `HTTP 401` — `MODBUS_AGENT_TOKEN` ที่ Pi ไม่ตรงกับที่เว็บ (หรือเว็บยังไม่ได้ตั้งค่า)
- `HTTP 404` / `500` — เว็บยังไม่ได้ deploy เวอร์ชันที่มี `/api/modbus-agent/*` หรือยังไม่ได้รัน migration
- `TCP Connection Timed Out` — Pi ต่อโมดูลไม่ได้: ตรวจ IP โมดูล สาย LAN และว่าอยู่วงเดียวกับ Pi (`ping <MODBUS_HOST>`)
- ไฟกะพริบ/ดับเอง — มีใครต่อเข้าโมดูลตรงๆ อีกตัวหรือเปล่า? ไม่ควรมีโปรเซสอื่นคุยกับโมดูลพร้อมกับ Pi
  (เช่น dev server บนเครื่องคุณที่ตั้ง `MODBUS_MODE=direct` — ให้ตั้ง `MODBUS_AUTO_RESTORE=off` หรือ `MODBUS_MODE=agent` ที่เครื่อง dev)
