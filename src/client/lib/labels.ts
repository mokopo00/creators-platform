export const STATUS_LABELS: Record<string, string> = {
  pending_payment: '支払い待ち',
  paid: '制作中（支払い済み）',
  delivered: '納品済み・承認待ち',
  completed: '完了・送金済み',
  cancelled_refunded: 'キャンセル（全額返金）',
  cancelled: 'キャンセル',
};

export const PAYOUT_LABELS: Record<string, string> = {
  none: '未送金',
  transferred: '送金済み',
  not_applicable: '送金なし',
};

export const PAUSE_REASON_LABELS: Record<string, string> = {
  creator_force_majeure: 'クリエイターの病気・事故・災害など（運営確認が必要）',
  client_material_delay: '依頼者の素材提供・指示の遅れ',
  client_approval_wait: '依頼者の承認待ち',
  platform_outage: '運営側の障害',
};

export const PAUSE_STATUS_LABELS: Record<string, string> = {
  pending: '確認待ち',
  approved: '承認済み（減額停止）',
  rejected: '却下',
};
