import { Package } from 'lucide-react';
import { cn } from '@/shared/lib';

export function ProductImage({
  src,
  alt,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div
        className={cn(
          'flex aspect-square items-center justify-center rounded-lg bg-muted text-muted-foreground',
          className,
        )}
      >
        <Package className="size-10" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={cn('aspect-square rounded-lg object-cover', className)}
    />
  );
}
