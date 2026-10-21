import { LoginForm } from '@/features/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';

export function LoginPage() {
  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  );
}
