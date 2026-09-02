export interface SessionData {
  readonly csrfToken: string
  readonly user: {
    readonly role: 'member' | 'owner'
    readonly username: string
  }
}

export interface LoginInput {
  readonly password: string
  readonly rememberMe: boolean
  readonly username: string
}

interface ApiErrorBody {
  readonly error?: {
    readonly message?: string
  }
}

export async function getSession(): Promise<SessionData | null> {
  const response = await fetch('/api/auth/session', {
    credentials: 'include',
  })
  if (response.status === 401) {
    return null
  }
  return readJsonResponse<SessionData>(response)
}

export async function login(input: LoginInput): Promise<SessionData> {
  const response = await fetch('/api/auth/login', {
    body: JSON.stringify(input),
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  return readJsonResponse<SessionData>(response)
}

export async function logout(csrfToken: string): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    credentials: 'include',
    headers: { 'x-csrf-token': csrfToken },
    method: 'POST',
  })
  if (!response.ok) {
    await readJsonResponse(response)
  }
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & ApiErrorBody
  if (!response.ok) {
    throw new Error(body.error?.message ?? 'ไม่สามารถดำเนินการได้')
  }
  return body
}
