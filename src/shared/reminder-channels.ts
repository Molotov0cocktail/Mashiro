export const reminderChannels = {
  preview: 'reminders:preview',
  confirm: 'reminders:confirm',
  query: 'reminders:query',
  mutate: 'reminders:mutate',
  operation: 'reminders:operation',
  runtime: 'reminders:runtime',
  configure: 'reminders:configure'
} as const
export const reminderChangedChannel = 'reminders:changed'
export const reminderNavigationChannels = {
  pending: 'reminders:navigation:pending',
  ack: 'reminders:navigation:ack'
} as const
