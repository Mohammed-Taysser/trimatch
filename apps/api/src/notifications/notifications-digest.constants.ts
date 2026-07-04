// The digest runs as a repeatable BullMQ job on its own queue.
export const NOTIFICATIONS_DIGEST_QUEUE = 'notifications-digest';

// Business cadence (not env config): batch each recipient's unread notifications
// once a day at 08:00. The job is only scheduled when a channel is configured.
export const DIGEST_CRON = '0 8 * * *';
