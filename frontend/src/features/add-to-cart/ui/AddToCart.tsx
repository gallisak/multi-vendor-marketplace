import { ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { quantityInCart, useCart, useSetCartItem } from '@/entities/cart';
import { useAuth } from '@/entities/viewer';
import type { Product } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Price } from '@/shared/ui/price';
import { QuantityStepper } from '@/shared/ui/quantity-stepper';
import { errorMessage } from '@/shared/ui/states';

export function AddToCart({ product }: { product: Product }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const cart = useCart(user !== null);
  const setItem = useSetCartItem();
  const inCart = quantityInCart(cart.data, product.id);
  const [quantity, setQuantity] = useState(1);
  const available = product.status === 'ACTIVE' && product.stock > 0;
  const max = Math.max(1, product.stock - inCart);

  const add = () => {
    if (!user) {
      void navigate('/login', { state: { from: `/products/${product.id}` } });
      return;
    }
    setItem.mutate(
      { productId: product.id, quantity: inCart + Math.min(quantity, max) },
      {
        onSuccess: () => {
          toast.success('Added to cart');
          setQuantity(1);
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <Price minor={product.priceMinor} className="text-3xl font-semibold" />
      <p className="text-sm" aria-live="polite">
        {available ? (
          product.stock <= 5 ? (
            <span className="font-medium text-amber-700">Only {product.stock} left</span>
          ) : (
            <span className="text-emerald-700">In stock: {product.stock}</span>
          )
        ) : (
          <span className="text-rose-700">Out of stock</span>
        )}
      </p>
      {available && (
        <div className="flex items-center gap-3">
          <QuantityStepper value={Math.min(quantity, max)} max={max} onChange={setQuantity} />
          <Button
            className="flex-1"
            onClick={add}
            disabled={setItem.isPending || inCart >= product.stock}
          >
            <ShoppingCart /> {inCart > 0 ? `Add more (${inCart} in cart)` : 'Add to cart'}
          </Button>
        </div>
      )}
    </div>
  );
}
