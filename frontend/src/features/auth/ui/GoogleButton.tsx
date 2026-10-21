import { useQuery } from '@tanstack/react-query';
import { Button } from '@/shared/ui/button';
import { api } from '@/shared/api';

export function GoogleButton() {
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: () => api<{ password: boolean; google: boolean }>('/auth/providers'),
    staleTime: Infinity,
  });
  if (!providers.data?.google) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={() => window.location.assign('/api/auth/google')}
    >
      Continue with Google
    </Button>
  );
}
