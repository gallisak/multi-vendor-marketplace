import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Category } from '@/shared/api';

export interface CategoryInput {
  name: string;
  slug?: string;
  parentId?: string | null;
}

function useCategoryMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export const useCreateCategory = () =>
  useCategoryMutation((body: CategoryInput) =>
    api<Category>('/admin/categories', { method: 'POST', body }),
  );

export const useUpdateCategory = () =>
  useCategoryMutation(({ id, ...body }: CategoryInput & { id: string }) =>
    api<Category>(`/admin/categories/${id}`, { method: 'PATCH', body }),
  );

export const useDeleteCategory = () =>
  useCategoryMutation((id: string) => api(`/admin/categories/${id}`, { method: 'DELETE' }));
