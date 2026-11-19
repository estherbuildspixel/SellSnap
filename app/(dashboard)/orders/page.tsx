import React from 'react';
import Link from 'next/link';
import { MdCheck, MdClose, MdHourglassTop, MdPayment } from 'react-icons/md';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { OrdersTable } from '@/components/dashboard/OrdersTable';
import type { OrderDto } from '@/lib/types';
import { firstQueryValue } from '@/lib/utils';
import styles from './orders.module.css';

type Props = {
  searchParams: Promise<{ status?: string | string[] }>;
};

export default async function OrdersPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) return null;

  const { status } = await searchParams;
  const statusFilter = firstQueryValue(status);

  let orders: OrderDto[] = [];
  try {
    const whereClause: Record<string, unknown> = {
      product: { userId: session.userId },
    };

    if (
      statusFilter &&
      ['pending', 'paid', 'failed'].includes(statusFilter)
    ) {
      whereClause.status = statusFilter;
    }

    const raw = await db.order.findMany({
      where: whereClause,
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });

    orders = raw as unknown as OrderDto[];
  } catch {
    // fallback
  }

  const activeFilter = statusFilter || 'all';

  return (
    <div className={styles.container}>
      <PageHeader
        title="Customer Orders"
        description="Monitor every buyer checkout and instant settlement from Flutterwave."
      />

      {/* Filter Tabs */}
      <div className={styles.filterTabs}>
        <Link
          href="/orders"
          className={styles.filterTab}
          data-active={activeFilter === 'all'}
        >
          All Orders
        </Link>
        <Link
          href="/orders?status=paid"
          className={styles.filterTab}
          data-active={activeFilter === 'paid'}
        >
          Paid <MdCheck size={16} aria-hidden="true" />
        </Link>
        <Link
          href="/orders?status=pending"
          className={styles.filterTab}
          data-active={activeFilter === 'pending'}
        >
          Pending <MdHourglassTop size={16} aria-hidden="true" />
        </Link>
        <Link
          href="/orders?status=failed"
          className={styles.filterTab}
          data-active={activeFilter === 'failed'}
        >
          Failed <MdClose size={16} aria-hidden="true" />
        </Link>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={<MdPayment size={40} aria-hidden="true" />}
          title="No orders found"
          description={
            activeFilter !== 'all'
              ? `There are no ${activeFilter} orders for your products right now.`
              : 'When customers buy through your shareable payment links, their orders will appear here.'
          }
        />
      ) : (
        <OrdersTable orders={orders} />
      )}
    </div>
  );
}
