export function QueryError({
  message,
  onRetry,
}: {
  readonly message: string
  readonly onRetry: () => void
}) {
  return (
    <div className="inline-error query-error" role="alert">
      <p>{message}</p>
      <button className="small-button" onClick={onRetry} type="button">
        ลองอีกครั้ง
      </button>
    </div>
  )
}
