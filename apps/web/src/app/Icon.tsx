export type IconName =
  | 'arrow-repeat'
  | 'box-arrow-right'
  | 'credit-card'
  | 'display'
  | 'sun'
  | 'moon-stars'
  | 'house-door'
  | 'list-ul'
  | 'people'
  | 'plus-lg'
  | 'tags'
  | 'three-dots'
  | 'wallet2'
  | 'x-lg'

export function Icon({ name }: { readonly name: IconName }) {
  return <i aria-hidden="true" className={`bi bi-${name}`} />
}
