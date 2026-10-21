import { z } from 'zod';
import { MONEY_PATTERN, toMajor, toMinor } from '@/shared/lib';

export const bidSchema = (minimumMinor: number) =>
  z.object({
    amount: z
      .string()
      .refine((value) => MONEY_PATTERN.test(value), 'Enter an amount like 1250.00')
      .refine(
        (value) => toMinor(value) >= minimumMinor,
        `The minimum bid is ${toMajor(minimumMinor)}`,
      ),
  });
