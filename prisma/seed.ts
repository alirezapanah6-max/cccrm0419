import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;

const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

/**
 * Default 3-level category hierarchy for the call center.
 * Structure: { name, children: [{ name, children: [{ name }] }] }
 */
const defaultCategories: Array<{
  name: string;
  children?: Array<{
    name: string;
    children?: Array<{ name: string }>;
  }>;
}> = [
  {
    name: "پشتیبانی فنی",
    children: [
      {
        name: "مشکل اپلیکیشن",
        children: [
          { name: "کرش اپلیکیشن" },
          { name: "ارور لاگین" },
          { name: "کندی بارگذاری" },
        ],
      },
      {
        name: "مشکل وب‌سایت",
        children: [
          { name: "عدم نمایش آگهی" },
          { name: "ارور جستجو" },
          { name: "مشکل آپلود تصویر" },
        ],
      },
      {
        name: "مشکل پرداخت",
        children: [
          { name: "ارور درگاه" },
          { name: "کسر مبلغ بدون ثبت" },
          { name: "عدم اعمال تخفیف" },
        ],
      },
    ],
  },
  {
    name: "مالی",
    children: [
      {
        name: "صورتحساب",
        children: [
          { name: "درخواست فاکتور" },
          { name: "مغایرت مبلغ" },
          { name: "عدم دریافت رسید" },
        ],
      },
      {
        name: "بازگشت وجه",
        children: [
          { name: "لغو آگهی ویژه" },
          { name: "خطای پرداخت" },
          { name: "عدم ارائه خدمات" },
        ],
      },
      {
        name: "تخفیف",
        children: [
          { name: "کد تخفیف" },
          { name: "تخفیف گروهی" },
          { name: "پیشنهاد ویژه" },
        ],
      },
    ],
  },
  {
    name: "فروش",
    children: [
      {
        name: "آگهی ویژه",
        children: [
          { name: "قیمت‌گذاری" },
          { name: "نحوه فعال‌سازی" },
          { name: "مدت زمان نمایش" },
        ],
      },
      {
        name: "اشتراک",
        children: [
          { name: "اشتراک ماهانه" },
          { name: "اشتراک سالانه" },
          { name: "ارتقاء اشتراک" },
        ],
      },
      {
        name: "تبلیغات",
        children: [
          { name: "بنر تبلیغاتی" },
          { name: "تبلیغات هدفمند" },
          { name: "گزارش عملکرد تبلیغ" },
        ],
      },
    ],
  },
  {
    name: "شکایات",
    children: [
      {
        name: "کیفیت خدمات",
        children: [
          { name: "عدم رضایت از پشتیبانی" },
          { name: "کیفیت پایین آگهی" },
          { name: "اسپم و تبلیغات مزاحم" },
        ],
      },
      {
        name: "تأخیر",
        children: [
          { name: "تأخیر در بررسی آگهی" },
          { name: "تأخیر در بازگشت وجه" },
          { name: "تأخیر در فعال‌سازی" },
        ],
      },
      {
        name: "عدم پاسخگویی",
        children: [
          { name: "عدم پاسخ تلفنی" },
          { name: "عدم پاسخ چت" },
          { name: "عدم پیگیری قبلی" },
        ],
      },
    ],
  },
  {
    name: "پیشنهادات",
    children: [
      {
        name: "بهبود اپلیکیشن",
        children: [
          { name: "قابلیت جدید" },
          { name: "بهبود رابط کاربری" },
          { name: "بهبود عملکرد" },
        ],
      },
      {
        name: "بهبود خدمات",
        children: [
          { name: "خدمات جدید" },
          { name: "بهبود فرآیند" },
          { name: "بهبود ارتباطات" },
        ],
      },
    ],
  },
  {
    name: "سایر",
    children: [
      {
        name: "استعلام",
        children: [
          { name: "استعلام قیمت" },
          { name: "استعلام وضعیت آگهی" },
          { name: "استعلام حساب کاربری" },
        ],
      },
      {
        name: "راهنمایی",
        children: [
          { name: "نحوه ثبت آگهی" },
          { name: "نحوه ارتقاء آگهی" },
          { name: "نحوه حذف آگهی" },
        ],
      },
    ],
  },
];

/**
 * Seeds the default category hierarchy into the database.
 * Uses upsert-like logic: skips if categories already exist.
 */
async function seedCategories() {
  const existingCount = await prisma.category.count();
  if (existingCount > 0) {
    console.log(
      `⏭️  دسته‌بندی‌ها از قبل وجود دارند (${existingCount} مورد). از seed رد شد.`
    );
    return;
  }

  console.log("🌱 در حال ایجاد دسته‌بندی‌های پیش‌فرض...");

  let totalCreated = 0;

  for (let i = 0; i < defaultCategories.length; i++) {
    const level1 = defaultCategories[i];

    const createdLevel1 = await prisma.category.create({
      data: {
        name: level1.name,
        level: 1,
        sortOrder: i + 1,
      },
    });
    totalCreated++;

    if (level1.children) {
      for (let j = 0; j < level1.children.length; j++) {
        const level2 = level1.children[j];

        const createdLevel2 = await prisma.category.create({
          data: {
            name: level2.name,
            parentId: createdLevel1.id,
            level: 2,
            sortOrder: j + 1,
          },
        });
        totalCreated++;

        if (level2.children) {
          for (let k = 0; k < level2.children.length; k++) {
            const level3 = level2.children[k];

            await prisma.category.create({
              data: {
                name: level3.name,
                parentId: createdLevel2.id,
                level: 3,
                sortOrder: k + 1,
              },
            });
            totalCreated++;
          }
        }
      }
    }
  }

  console.log(`✅ ${totalCreated} دسته‌بندی با موفقیت ایجاد شد.`);
}

/**
 * Bootstrap detection: checks if the system has any users.
 * If no users exist, the system is in bootstrap mode and the first
 * user to register will become an Admin.
 */
async function checkBootstrap() {
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    console.log(
      "🚀 هیچ کاربری یافت نشد. سیستم در حالت bootstrap است — اولین کاربر به‌عنوان مدیر ایجاد خواهد شد."
    );
  } else {
    console.log(`👥 ${userCount} کاربر در سیستم موجود است.`);
  }
}

async function main() {
  console.log("🔧 شروع seed دیتابیس Micro CRM...\n");

  await checkBootstrap();
  await seedCategories();

  console.log("\n🎉 عملیات seed با موفقیت به پایان رسید.");
}

main()
  .catch((e) => {
    console.error("❌ خطا در اجرای seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
