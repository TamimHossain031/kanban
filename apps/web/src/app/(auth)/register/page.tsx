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
  name: z.string().min(1, 'Name is required').max(80),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});
type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
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
      const res = await api.register(values.email, values.name, values.password);
      authStore.setSession(res.user, res.accessToken, res.refreshToken);
      router.replace('/boards');
    } catch (e) {
      setServerError((e as Error).message || 'Could not create the account');
    }
  };

  return (
    <AuthShell
      title="Create your account"
      footer={
        <>
          Already have one?{' '}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Name" error={errors.name?.message}>
          <input autoComplete="name" className={inputCls} {...register('name')} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <input type="email" autoComplete="email" className={inputCls} {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <input
            type="password"
            autoComplete="new-password"
            className={inputCls}
            {...register('password')}
          />
        </Field>
        {serverError && <p className="text-[13px] text-spine-urgent">{serverError}</p>}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}
