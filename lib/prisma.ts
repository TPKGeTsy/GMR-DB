import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => {
  // บังคับส่ง connection string เข้าไปใน constructor ตรงๆ สำหรับ Prisma 7
  return new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
};

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;