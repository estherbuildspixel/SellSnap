import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { PriceTag } from '@/components/product/PriceTag';
import type { OrderDto } from '@/lib/types';
import styles from './OrdersTable.module.css';

export type OrdersTableProps = {
  orders: OrderDto[];
};

export function OrdersTable({ orders }: OrdersTableProps) {
  if (orders.length === 0) {
    return null;
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr className={styles.headerRow}>
            <th className={styles.th}>Product</th>
            <th className={styles.th}>Customer</th>
            <th className={styles.th}>Amount</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Reference</th>
            <th className={styles.th}>Date</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className={styles.row}>
              <td className={styles.td}>
                <span className={styles.productName}>
                  {order.product?.name ?? 'Unknown Product'}
                </span>
              </td>
              <td className={styles.td}>
                <span className={styles.buyerEmail}>
                  {order.buyerEmail ?? 'Anonymous'}
                </span>
              </td>
              <td className={styles.td}>
                <PriceTag priceInKobo={order.amount} size="sm" />
              </td>
              <td className={styles.td}>
                <Badge variant={order.status}>{order.status}</Badge>
              </td>
              <td className={styles.td}>
                <code className={styles.refCode}>
                  {order.transactionReference.slice(0, 16)}...
                </code>
              </td>
              <td className={styles.td}>
                <span className={styles.date}>
                  {new Date(order.createdAt).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
