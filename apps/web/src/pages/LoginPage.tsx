import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import type { LoginInput } from '../app/api'
import { Logo } from '../app/Logo'

const loginFormSchema = z.object({
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
  rememberMe: z.boolean(),
  username: z.string().trim().min(3, 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร'),
})

interface LoginPageProps {
  readonly errorMessage: string | undefined
  readonly isSubmitting: boolean
  readonly onSubmit: (input: LoginInput) => void
}

export function LoginPage({
  errorMessage,
  isSubmitting,
  onSubmit,
}: LoginPageProps) {
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<LoginInput>({
    defaultValues: { password: '', rememberMe: false, username: '' },
    resolver: zodResolver(loginFormSchema),
  })

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="brand-lockup" aria-label="My Poxket">
          <Logo />
        </div>

        <header className="auth-heading">
          <h1 id="login-title">เข้าสู่ระบบ</h1>
          <p>พื้นที่การเงินส่วนตัวของคุณ</p>
        </header>

        <form
          aria-busy={isSubmitting}
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          noValidate
        >
          <label className="field">
            <span>ชื่อผู้ใช้</span>
            <input
              autoComplete="username"
              inputMode="text"
              {...register('username')}
              aria-describedby={errors.username ? 'username-error' : undefined}
              aria-invalid={Boolean(errors.username)}
            />
            {errors.username ? (
              <small id="username-error" role="alert">
                {errors.username.message}
              </small>
            ) : null}
          </label>

          <label className="field">
            <span>รหัสผ่าน</span>
            <input
              autoComplete="current-password"
              type="password"
              {...register('password')}
              aria-describedby={errors.password ? 'password-error' : undefined}
              aria-invalid={Boolean(errors.password)}
            />
            {errors.password ? (
              <small id="password-error" role="alert">
                {errors.password.message}
              </small>
            ) : null}
          </label>

          <label className="remember-row">
            <input type="checkbox" {...register('rememberMe')} />
            <span>จดจำการเข้าสู่ระบบ 7 วัน</span>
          </label>

          {errorMessage ? (
            <p className="form-error" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <button
            className="primary-button"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </section>
    </main>
  )
}
