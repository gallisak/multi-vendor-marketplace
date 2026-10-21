import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { useAuth } from '@/entities/viewer';
import { errorMessage } from '@/shared/ui/states';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { GoogleButton } from './GoogleButton';

const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name').max(100),
    email: z.email('Enter a valid email'),
    password: z.string().min(8, 'At least 8 characters').max(128),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

type RegisterForm = z.infer<typeof registerSchema>;

const FIELDS: { name: keyof RegisterForm; label: string; type: string; autoComplete: string }[] = [
  { name: 'name', label: 'Name', type: 'text', autoComplete: 'name' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
  { name: 'confirm', label: 'Repeat password', type: 'password', autoComplete: 'new-password' },
];

export function RegisterForm() {
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirm: '' },
  });
  const submit = form.handleSubmit(async ({ name, email, password }) => {
    try {
      await signUp(name, email, password);
      void navigate('/', { replace: true });
    } catch (error) {
      form.setError('root', { message: errorMessage(error) });
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {form.formState.errors.root && (
        <Alert variant="destructive">
          <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
        </Alert>
      )}
      {FIELDS.map((field) => (
        <div key={field.name} className="space-y-1.5">
          <Label htmlFor={field.name}>{field.label}</Label>
          <Input
            id={field.name}
            type={field.type}
            autoComplete={field.autoComplete}
            {...form.register(field.name)}
          />
          {form.formState.errors[field.name] && (
            <p className="text-sm text-destructive">{form.formState.errors[field.name]?.message}</p>
          )}
        </div>
      ))}
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        Create account
      </Button>
      <GoogleButton />
      <p className="text-center text-sm text-muted-foreground">
        Already registered?{' '}
        <Link to="/login" className="underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
