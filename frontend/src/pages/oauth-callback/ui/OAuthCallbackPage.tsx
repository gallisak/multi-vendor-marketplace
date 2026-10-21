import { useEffect, useRef } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/entities/viewer';
import { LoadingState } from '@/shared/ui/states';

export function OAuthCallbackPage() {
  const { completeOAuth } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const started = useRef(false);
  const error = params.get('error');

  useEffect(() => {
    if (started.current || error) return;
    started.current = true;
    void completeOAuth().then((user) => {
      if (!user) {
        void navigate('/login?error=oauth_failed', { replace: true });
        return;
      }
      if (params.get('linked') === 'google') {
        toast.info(
          'Google sign-in is now linked to your account. Use Google to sign in next time.',
        );
      }
      void navigate('/', { replace: true });
    });
  }, [completeOAuth, navigate, params, error]);

  if (error) {
    return <Navigate to={`/login?error=${error}`} replace />;
  }
  return <LoadingState rows={1} label="Signing you in" />;
}
