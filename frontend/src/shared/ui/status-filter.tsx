import { humanize } from '@/shared/lib/format';
import { Tabs, TabsList, TabsTrigger } from './tabs';

const ALL = 'ALL';

export function StatusFilter<T extends string>({
  statuses,
  value,
  onChange,
}: {
  statuses: readonly T[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}) {
  return (
    <Tabs
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? undefined : (next as T))}
    >
      <TabsList className="max-w-full overflow-x-auto">
        <TabsTrigger value={ALL}>All</TabsTrigger>
        {statuses.map((status) => (
          <TabsTrigger key={status} value={status}>
            {humanize(status)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
