import { useOutletContext } from 'react-router-dom'

import type { SessionData } from './api'

interface AuthenticatedContext {
  readonly session: SessionData
}

export function useAuthenticatedContext(): AuthenticatedContext {
  return useOutletContext<AuthenticatedContext>()
}
