import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  describeNotification,
  useMarkNotificationsRead,
  useNotifications,
} from '@/entities/notification';
import { cn, formatDateTime } from '@/shared/lib';
import { PageHeader } from '@/shared/ui/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';

export function NotificationsPage() {
  const notifications = useNotifications(true);
  const { mutate: markRead } = useMarkNotificationsRead();
  const [highlighted, setHighlighted] = useState<Set<string> | null>(null);

  if (highlighted === null && notifications.data) {
    const unread = notifications.data.filter((notification) => !notification.readAt);
    setHighlighted(new Set(unread.map((notification) => notification.id)));
  }

  useEffect(() => {
    if (highlighted && highlighted.size > 0) markRead();
  }, [highlighted, markRead]);

  return (
    <div className="space-y-4">
      <PageHeader title="Notifications" />
      {notifications.isPending ? (
        <LoadingState rows={4} label="Loading notifications" />
      ) : notifications.isError ? (
        <ErrorState error={notifications.error} onRetry={() => void notifications.refetch()} />
      ) : notifications.data.length === 0 ? (
        <EmptyState title="Nothing here yet" />
      ) : (
        <ul className="divide-y rounded-xl border">
          {notifications.data.map((notification) => {
            const { text, link } = describeNotification(notification);
            return (
              <li
                key={notification.id}
                className={cn(
                  'flex items-start justify-between gap-4 p-4 text-sm',
                  highlighted?.has(notification.id) && 'bg-muted/40',
                )}
              >
                {link ? (
                  <Link to={link} className="hover:underline">
                    {text}
                  </Link>
                ) : (
                  <span>{text}</span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(notification.createdAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
