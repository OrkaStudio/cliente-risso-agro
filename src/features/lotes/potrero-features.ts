import {
  LagunaIcon,
  MolinoIcon,
  TranqueraIcon,
} from '@/features/lotes/potrero-feature-icons'

// Infraestructura del campo: marcadores que el usuario coloca donde están.
export type FeatureId = 'molino' | 'laguna' | 'tranquera'

type IconCmp = (props: { className?: string }) => React.ReactElement

export const FEATURES: { id: FeatureId; label: string; Icon: IconCmp }[] = [
  { id: 'molino', label: 'Molino', Icon: MolinoIcon },
  { id: 'laguna', label: 'Laguna', Icon: LagunaIcon },
  { id: 'tranquera', label: 'Tranquera', Icon: TranqueraIcon },
]

export const FEATURE_MAP = Object.fromEntries(
  FEATURES.map((f) => [f.id, f]),
) as unknown as Record<FeatureId, { label: string; Icon: IconCmp }>
