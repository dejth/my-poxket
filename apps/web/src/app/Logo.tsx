import { Icon } from './Icon'

export function Logo() {
  return (
    <>
      <span className="brand-mark" aria-hidden="true">
        <Icon name="wallet2" />
      </span>
      <span className="brand-wordmark">My Poxket</span>
    </>
  )
}
