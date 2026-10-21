import { z } from 'zod';
import { toMajor, toMinor } from '@/shared/lib';

export const bidSchema = (minimumMinor: number) =>
  z.object({
    amount: z
      .string()
      .refine((value) => /^\d+([.,]\d{1,2})?$/.test(value), 'Enter an amount like 1250.00')
      .refine(
        (value) => toMinor(value) >= minimumMinor,
        `The minimum bid is ${toMajor(minimumMinor)}`,
      ),
  });
