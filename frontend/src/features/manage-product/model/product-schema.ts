import { z } from 'zod';
import type { ProductType, SellerProduct } from '@/shared/api';
import { MONEY_PATTERN, toMajor, toMinor } from '@/shared/lib';

const MIN_AUCTION_MS = 5 * 60 * 1000;
const MAX_AUCTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PRICE_MINOR = 1_000_000_000;

function moneyError(value: string, label: string): string | null {
  if (!MONEY_PATTERN.test(value.trim())) return `${label}: enter an amount like 1250.00`;
  const minor = toMinor(value.trim());
  if (minor < 1) return `${label} must be positive`;
  if (minor > MAX_PRICE_MINOR) return `${label} is too large`;
  return null;
}

const urls = z
  .string()
  .transform((value) =>
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  )
  .refine((list) => list.length <= 10, 'At most 10 images')
  .refine(
    (list) => list.every((url) => /^https?:\/\/\S+$/.test(url)),
    'Each line must be an http(s) URL',
  );

const base = {
  title: z.string().trim().min(3, 'At least 3 characters').max(200, 'At most 200 characters'),
  description: z
    .string()
    .trim()
    .min(1, 'Describe the product')
    .max(5000, 'At most 5000 characters'),
  categoryId: z.string().min(1, 'Pick a category'),
  imageUrls: urls,
};

export const createProductSchema = z
  .object({
    ...base,
    type: z.enum(['FIXED_PRICE', 'AUCTION']),
    price: z.string(),
    stock: z.string(),
    startPrice: z.string(),
    bidStep: z.string(),
    endsAt: z.string(),
  })
  .superRefine((values, ctx) => {
    const fail = (path: string, message: string | null) => {
      if (message) ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (values.type === 'FIXED_PRICE') {
      fail('price', moneyError(values.price, 'Price'));
      const stock = values.stock.trim();
      fail('stock', /^\d+$/.test(stock) ? null : 'Whole number of units');
      fail('stock', Number(stock) > 1_000_000 ? 'At most 1,000,000 units' : null);
      return;
    }
    fail('startPrice', moneyError(values.startPrice, 'Start price'));
    fail('bidStep', moneyError(values.bidStep, 'Bid step'));
    const duration = new Date(values.endsAt).getTime() - Date.now();
    fail(
      'endsAt',
      Number.isNaN(duration) || duration < MIN_AUCTION_MS || duration > MAX_AUCTION_MS
        ? 'The auction must last between 5 minutes and 30 days'
        : null,
    );
  });

export const editProductSchema = z
  .object({ ...base, price: z.string() })
  .superRefine((values, ctx) => {
    if (values.price === '') return;
    const message = moneyError(values.price, 'Price');
    if (message) ctx.addIssue({ code: 'custom', path: ['price'], message });
  });

export type CreateProductInput = z.input<typeof createProductSchema>;
export type CreateProductValues = z.output<typeof createProductSchema>;
export type EditProductInput = z.input<typeof editProductSchema>;
export type EditProductValues = z.output<typeof editProductSchema>;

export interface ProductPayload {
  title: string;
  description: string;
  categoryId: string;
  type: ProductType;
  imageUrls: string[];
  priceMinor?: number;
  stock?: number;
  auction?: { startPriceMinor: number; bidStepMinor: number; endsAt: string };
}

export type ProductPatch = Partial<
  Pick<ProductPayload, 'title' | 'description' | 'categoryId' | 'imageUrls' | 'priceMinor'>
>;

export function toCreatePayload(values: CreateProductValues): ProductPayload {
  const common = {
    title: values.title,
    description: values.description,
    categoryId: values.categoryId,
    imageUrls: values.imageUrls,
  };
  if (values.type === 'FIXED_PRICE') {
    return {
      ...common,
      type: 'FIXED_PRICE',
      priceMinor: toMinor(values.price.trim()),
      stock: Number(values.stock.trim()),
    };
  }
  return {
    ...common,
    type: 'AUCTION',
    auction: {
      startPriceMinor: toMinor(values.startPrice.trim()),
      bidStepMinor: toMinor(values.bidStep.trim()),
      endsAt: new Date(values.endsAt).toISOString(),
    },
  };
}

export function toPatch(product: SellerProduct, values: EditProductValues): ProductPatch {
  const patch: ProductPatch = {};
  if (values.title !== product.title) patch.title = values.title;
  if (values.description !== product.description) patch.description = values.description;
  if (values.categoryId !== product.category.id) patch.categoryId = values.categoryId;
  if (values.imageUrls.join('\n') !== product.imageUrls.join('\n')) {
    patch.imageUrls = values.imageUrls;
  }
  if (product.type === 'FIXED_PRICE' && values.price !== '') {
    const priceMinor = toMinor(values.price.trim());
    if (priceMinor !== product.priceMinor) patch.priceMinor = priceMinor;
  }
  return patch;
}

export const editDefaults = (product: SellerProduct): EditProductInput => ({
  title: product.title,
  description: product.description,
  categoryId: product.category.id,
  imageUrls: product.imageUrls.join('\n'),
  price: product.type === 'FIXED_PRICE' ? toMajor(product.priceMinor) : '',
});

export function localDateTime(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export const createDefaults = (): CreateProductInput => ({
  title: '',
  description: '',
  categoryId: '',
  imageUrls: '',
  type: 'FIXED_PRICE',
  price: '',
  stock: '1',
  startPrice: '',
  bidStep: '',
  endsAt: localDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000)),
});
