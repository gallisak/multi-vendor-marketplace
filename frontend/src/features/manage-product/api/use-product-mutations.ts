import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type SellerProduct } from '@/shared/api';
import type { ProductPayload, ProductPatch } from '../model/product-schema';

function useProductMutation<T>(mutationFn: (input: T) => Promise<SellerProduct | undefined>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (product) => {
      if (product) queryClient.setQueryData(['seller-products', 'detail', product.id], product);
      void queryClient.invalidateQueries({ queryKey: ['seller-products'] });
      void queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] });
    },
  });
}

export const useCreateProduct = () =>
  useProductMutation((body: ProductPayload) =>
    api<SellerProduct>('/seller/products', { method: 'POST', body }),
  );

export const useUpdateProduct = (id: string) =>
  useProductMutation((body: ProductPatch) =>
    api<SellerProduct>(`/seller/products/${id}`, { method: 'PATCH', body }),
  );

export const useAdjustStock = (id: string) =>
  useProductMutation((delta: number) =>
    api<SellerProduct>(`/seller/products/${id}/stock-adjustments`, {
      method: 'POST',
      body: { delta },
    }),
  );

export const useArchiveProduct = (id: string) =>
  useProductMutation(() => api<undefined>(`/seller/products/${id}`, { method: 'DELETE' }));
