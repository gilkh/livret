type Props = { label: string; on: boolean; onToggle: () => void; variant?: 'en'|'fr'|'ar' }

export default function ToggleIndicator({ label, on, onToggle, variant }: Props) {
  return (
    <div className={`pill ${on ? 'on' : ''} ${variant ?? ''}`} onClick={onToggle} aria-pressed={on}>
      {label}
    </div>
  )
}
