/** The Family Wishes mark: a diya, the lamp lit for every festival in the seed list. */
export function Mark({ size = 26, color = 'var(--accent)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3c3.2 4 4.6 6.9 4.6 9.4a4.6 4.6 0 0 1-9.2 0C11.4 9.9 12.8 7 16 3z" fill={color} />
      <path d="M3 18h26c-.6 6.2-5.9 10-13 10S3.6 24.2 3 18z" fill={color} />
    </svg>
  )
}
