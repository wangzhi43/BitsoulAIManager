// 初始化数据：管理员账号 + 三个被管理项目。幂等，可重复执行。
// 用法：ADMIN_PASSWORD=xxx npm run seed

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error("Set ADMIN_PASSWORD env var (initial admin password)");
    process.exit(1);
  }

  const admin = await prisma.adminUser.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      displayName: "管理员",
      passwordHash: await bcrypt.hash(adminPassword, 10),
    },
  });
  console.log(`admin user ready: ${admin.username}`);

  const projects = [
    {
      name: "BitSoulClaw",
      repoUrl: "git@github.com:wangzhi43/BitSoulClaw.git",
      description: "Electron 桌面 AI 客户端（OpenClaw 网关）",
    },
    {
      name: "bitsoulofficial",
      repoUrl: "git@github.com:wangzhi43/bitsoulofficial.git",
      description: "BitSoul 官网（Python 后端 + 前端）",
    },
    {
      name: "BitsoulAIManager",
      repoUrl: "git@github.com:wangzhi43/BitsoulAIManager.git",
      description: "BitSoul AI Manager 平台自身（自举管理）",
    },
  ];
  for (const p of projects) {
    await prisma.project.upsert({
      where: { name: p.name },
      update: {},
      create: { ...p, active: false }, // 初始 inactive，仓库 remote 就绪后在设置页启用
    });
    console.log(`project ready: ${p.name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
