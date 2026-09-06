import type { AvatarKey } from '../../../../shared/assistant-contract'

const avatarPresentation: Record<AvatarKey, { label: string; symbol: string }> = {
  mashiro: { label: '雪原', symbol: '雪' },
  moon: { label: '月光', symbol: '月' },
  leaf: { label: '新叶', symbol: '叶' },
  spark: { label: '星火', symbol: '光' },
  wave: { label: '海浪', symbol: '浪' },
  violet: { label: '紫藤', symbol: '藤' }
}

export function avatarLabel(avatarKey: AvatarKey): string {
  return avatarPresentation[avatarKey].label
}

export function AssistantAvatar({
  avatarKey,
  size = 'medium',
  label
}: {
  avatarKey: AvatarKey
  size?: 'small' | 'medium' | 'large'
  label?: string
}): React.JSX.Element {
  const presentation = avatarPresentation[avatarKey]
  return (
    <span
      className={`assistant-avatar assistant-avatar-${avatarKey} assistant-avatar-${size}`}
      role="img"
      aria-label={label ?? `内置形象：${presentation.label}`}
    >
      <span aria-hidden="true">{presentation.symbol}</span>
    </span>
  )
}
