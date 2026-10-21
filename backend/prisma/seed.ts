import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  ProductStatus,
  ProductType,
  Role,
  SellerApplicationStatus,
} from '../src/generated/prisma/client.js';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SEED_PASSWORD = 'Password123!';
const HOUR = 60 * 60 * 1000;

async function main() {
  if (await prisma.user.findUnique({ where: { email: 'admin@mvm.local' } })) {
    console.log('Seed data already present, skipping');
    return;
  }

  const passwordHash = await argon2.hash(SEED_PASSWORD);

  const admin = await prisma.user.create({
    data: { email: 'admin@mvm.local', name: 'Admin', role: Role.ADMIN, passwordHash },
  });

  const createSeller = async (email: string, name: string, storeName: string) => {
    const user = await prisma.user.create({
      data: { email, name, role: Role.SELLER, passwordHash },
    });
    await prisma.sellerApplication.create({
      data: {
        userId: user.id,
        storeName,
        status: SellerApplicationStatus.APPROVED,
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    });
    return prisma.seller.create({ data: { userId: user.id, storeName } });
  };

  const techStore = await createSeller('seller1@mvm.local', 'Olena Tech', 'Tech Store');
  const bookCorner = await createSeller('seller2@mvm.local', 'Ivan Books', 'Book Corner');

  await prisma.user.create({
    data: { email: 'customer@mvm.local', name: 'Customer', passwordHash },
  });

  const applicant = await prisma.user.create({
    data: { email: 'applicant@mvm.local', name: 'Future Seller', passwordHash },
  });
  await prisma.sellerApplication.create({
    data: {
      userId: applicant.id,
      storeName: 'Home Goods',
      description: 'Kitchen and home accessories',
    },
  });

  const electronics = await prisma.category.create({
    data: { name: 'Electronics', slug: 'electronics' },
  });
  const phones = await prisma.category.create({
    data: { name: 'Phones', slug: 'phones', parentId: electronics.id },
  });
  const laptops = await prisma.category.create({
    data: { name: 'Laptops', slug: 'laptops', parentId: electronics.id },
  });
  const books = await prisma.category.create({ data: { name: 'Books', slug: 'books' } });
  await prisma.category.create({ data: { name: 'Home', slug: 'home' } });

  const images = (seed: string) => [
    `https://picsum.photos/seed/${seed}/800/800`,
    `https://picsum.photos/seed/${seed}-2/800/800`,
  ];

  await prisma.product.createMany({
    data: [
      {
        sellerId: techStore.id,
        categoryId: phones.id,
        title: 'Smartphone X12 128GB',
        imageUrls: images('smartphone-x12-128gb'),
        description: '6.1" OLED display, dual camera',
        priceMinor: 1_899_900,
        stock: 5,
        status: ProductStatus.ACTIVE,
      },
      {
        sellerId: techStore.id,
        categoryId: laptops.id,
        title: 'Ultrabook Air 14',
        imageUrls: images('ultrabook-air-14'),
        description: '14" laptop, 16GB RAM, 512GB SSD',
        priceMinor: 4_299_900,
        stock: 2,
        status: ProductStatus.ACTIVE,
      },
      {
        sellerId: techStore.id,
        categoryId: phones.id,
        title: 'Phone case X12',
        imageUrls: images('phone-case-x12'),
        description: 'Silicone case',
        priceMinor: 39_900,
        stock: 50,
        status: ProductStatus.PENDING_MODERATION,
      },
      {
        sellerId: bookCorner.id,
        categoryId: books.id,
        title: 'Designing Data-Intensive Applications',
        imageUrls: images('designing-data-intensive-applications'),
        description: 'Martin Kleppmann',
        priceMinor: 159_900,
        stock: 10,
        status: ProductStatus.ACTIVE,
      },
      {
        sellerId: bookCorner.id,
        categoryId: books.id,
        title: 'Clean Architecture',
        imageUrls: images('clean-architecture'),
        description: 'Robert C. Martin',
        priceMinor: 99_900,
        stock: 1,
        status: ProductStatus.ACTIVE,
      },
    ],
  });

  const createAuctionLot = async (
    sellerId: string,
    categoryId: string,
    title: string,
    startPriceMinor: number,
    bidStepMinor: number,
    durationHours: number,
  ) => {
    const product = await prisma.product.create({
      data: {
        sellerId,
        categoryId,
        title,
        description: `Auction lot: ${title}`,
        imageUrls: images(title.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
        type: ProductType.AUCTION,
        priceMinor: startPriceMinor,
        stock: 1,
        status: ProductStatus.ACTIVE,
      },
    });
    await prisma.auction.create({
      data: {
        productId: product.id,
        startPriceMinor,
        bidStepMinor,
        endsAt: new Date(Date.now() + durationHours * HOUR),
      },
    });
  };

  await createAuctionLot(techStore.id, electronics.id, 'Vintage Walkman', 200_000, 10_000, 24);
  await createAuctionLot(bookCorner.id, books.id, 'First edition, signed', 500_000, 25_000, 48);

  console.log(`Seed done. All users share password: ${SEED_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
