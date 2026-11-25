const LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  partial: 'Partial',
  received: 'Received',
  cancelled: 'Cancelled',
  receipt: 'Receipt',
  issue: 'Issue',
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
};

export function Pill({ value }) {
  return <span className={`pill pill-${value}`}>{LABELS[value] || value}</span>;
}
