import { Search } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/shared/ui/input';

export function SearchBar({
  value,
  onSearch,
}: {
  value: string;
  onSearch: (q: string | undefined) => void;
}) {
  const [query, setQuery] = useState(value);
  return (
    <form
      className="relative flex-1"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(query.trim() || undefined);
      }}
    >
      <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
      <Input
        aria-label="Search products"
        placeholder="Search products"
        className="pl-8"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
    </form>
  );
}
