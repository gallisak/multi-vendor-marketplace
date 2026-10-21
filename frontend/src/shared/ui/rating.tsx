import { Star } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export function Rating({ value, count }: { value: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm" aria-label={`Rated ${value} of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          className={cn(
            'size-3.5',
            index < Math.round(value)
              ? 'fill-amber-400 text-amber-400'
              : 'text-muted-foreground/40',
          )}
        />
      ))}
      {count !== undefined && <span className="text-muted-foreground">({count})</span>}
    </span>
  );
}

export function RatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          type="button"
          role="radio"
          aria-checked={value === score}
          aria-label={`${score} stars`}
          onClick={() => onChange(score)}
        >
          <Star
            className={cn(
              'size-6',
              score <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
            )}
          />
        </button>
      ))}
    </div>
  );
}
