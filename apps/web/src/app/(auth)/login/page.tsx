'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthShell, Field, inputCls } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import { api } from '@/features/boards/api';
import { authStore } from '@/lib/auth-store';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const res = await api.login(values.email, values.password);
      authStore.setSession(res.user, res.accessToken, res.refreshToken);
      router.replace('/boards');
    } catch (e) {
      setServerError((e as Error).message || 'Invalid email or password');
    }
  };

  return (
    <AuthShell
      title="Sign in"
      footer={
        <>
          No account?{' '}
          <Link href="/register" className="font-medium text-accent hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Email" error={errors.email?.message}>
          <input
            type="email"
            autoComplete="email"
            className={inputCls}
            {...register('email')}
          />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <input
            type="password"
            autoComplete="current-password"
            className={inputCls}
            {...register('password')}
          />
        </Field>
        {serverError && <p className="text-[13px] text-spine-urgent">{serverError}</p>}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-4 rounded-card border border-rule bg-canvas px-3 py-2 text-[12px] text-ink-muted">
        Seeded accounts: <code>ada@example.com</code> / <code>grace@example.com</code> —
        password <code>password123</code>
      </p>
    </AuthShell>
  );
}
