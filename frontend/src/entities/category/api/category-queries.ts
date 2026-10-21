import { useQuery } from '@tanstack/react-query';
import { api, type Category } from '@/shared/api';

export const useCategories = () =>
  useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories'),
    staleTime: 5 * 60_000,
  });
