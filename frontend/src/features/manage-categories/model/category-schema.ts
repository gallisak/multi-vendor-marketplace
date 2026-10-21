import { z } from 'zod';

export const NO_PARENT = 'none';

export const categorySchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(80, 'At most 80 characters'),
  slug: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
      'Lowercase latin words separated by dashes',
    )
    .refine((value) => value === '' || value.length >= 2, 'At least 2 characters')
    .refine((value) => value.length <= 80, 'At most 80 characters'),
  parentId: z.string(),
});

export type CategoryValues = z.infer<typeof categorySchema>;
