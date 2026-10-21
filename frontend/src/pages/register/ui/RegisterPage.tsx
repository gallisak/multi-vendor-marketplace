import { RegisterForm } from '@/features/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';

export function RegisterPage() {
  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>Create account</CardTitle>
      </CardHeader>
      <CardContent>
        <RegisterForm />
      </CardContent>
    </Card>
  );
}
