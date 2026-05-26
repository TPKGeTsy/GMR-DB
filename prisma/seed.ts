import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const username = "admin";
  const password = "password123";
  // bcryptjs.hash is async
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { username },
    update: {
      password: hashedPassword,
    },
    create: {
      username,
      password: hashedPassword,
    },
  });

  console.info("Seed finished: Admin user created/updated.");
  console.info({ id: user.id, username: user.username });
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
