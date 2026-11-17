import React from 'react';
import Link from 'next/link';
import { MdArrowForward, MdPayment, MdShoppingBag } from 'react-icons/md';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ProductCard } from '@/components/product/ProductCard';
import { OrdersTable } from '@/components/dashboard/OrdersTable';
import { MetricCard } from './_components/MetricCard';
import type { MetricTrendDirection } from './_components/MetricCard';
import { formatNaira } from '@/lib/utils';
import type { ProductDto, OrderDto } from '@/lib/types';
import styles from './dashboard.module.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_PERIOD_DAYS = 30;
const SPARKLINE_WEEKS = 6;
const COMPARISON_LABEL = 'vs previous 30 days';

type Trend = {
  direction: MetricTrendDirection;
  changePercent: number;
};

function buildTrend(current: number, previous: number): Trend {
  if (previous === 0) {
    return current > 0
      ? { direction: 'up', changePercent: 100 }
      : { direction: 'flat', changePercent: 0 };
  }

  const change = ((current - previous) / previous) * 100;

  if (change > 0) return { direction: 'up', changePercent: change };
  if (change < 0) return { direction: 'down', changePercent: Math.abs(change) };
  return { direction: 'flat', changePercent: 0 };
}

function buildWeeklySeries<T>(
  items: T[],
  getDate: (item: T) => Date,
  getValue: (item: T) => number,
  now: Date,
): number[] {
  const weekMs = DAY_MS * 7;
  const buckets = Array<number>(SPARKLINE_WEEKS).fill(0);

  for (const item of items) {
    const elapsed = now.getTime() - getDate(item).getTime();
    if (elapsed < 0) continue;
    const weeksAgo = Math.floor(elapsed / weekMs);
    if (weeksAgo >= SPARKLINE_WEEKS) continue;
    buckets[SPARKLINE_WEEKS - 1 - weeksAgo] += getValue(item);
  }

  return buckets;
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  let products: ProductDto[] = [];
  let orders: OrderDto[] = [];
  let totalRevenueKobo = 0;
  let totalOrdersCount = 0;
  let paidOrdersCount = 0;
  let revenueTrend: Trend = { direction: 'flat', changePercent: 0 };
  let productsTrend: Trend = { direction: 'flat', changePercent: 0 };
  let ordersTrend: Trend = { direction: 'flat', changePercent: 0 };
  let revenueSeries: number[] = Array<number>(SPARKLINE_WEEKS).fill(0);
  let productsSeries: number[] = Array<number>(SPARKLINE_WEEKS).fill(0);
  let ordersSeries: number[] = Array<number>(SPARKLINE_WEEKS).fill(0);

  try {
    const now = new Date();
    const currentPeriodStart = new Date(now.getTime() - TREND_PERIOD_DAYS * DAY_MS);
    const previousPeriodStart = new Date(now.getTime() - TREND_PERIOD_DAYS * 2 * DAY_MS);

    const [rawProducts, rawOrders, periodOrders, paidSummary, orderCount, paidCount] =
      await Promise.all([
        db.product.findMany({
          where: { userId: session.userId },
          orderBy: { createdAt: 'desc' },
        }),
        db.order.findMany({
          where: { product: { userId: session.userId } },
          include: { product: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        db.order.findMany({
          where: {
            product: { userId: session.userId },
            createdAt: { gte: previousPeriodStart },
          },
          select: { amount: true, status: true, createdAt: true },
        }),
        db.order.aggregate({
          where: { product: { userId: session.userId }, status: 'paid' },
          _sum: { amount: true },
        }),
        db.order.count({ where: { product: { userId: session.userId } } }),
        db.order.count({
          where: { product: { userId: session.userId }, status: 'paid' },
        }),
      ]);

    products = rawProducts as unknown as ProductDto[];
    orders = rawOrders as unknown as OrderDto[];
    totalRevenueKobo = paidSummary._sum.amount ?? 0;
    totalOrdersCount = orderCount;
    paidOrdersCount = paidCount;

    const currentOrders = periodOrders.filter(
      (order) => order.createdAt >= currentPeriodStart,
    );
    const previousOrders = periodOrders.filter(
      (order) => order.createdAt < currentPeriodStart,
    );
    const paidOrders = periodOrders.filter((order) => order.status === 'paid');
    const currentPaidOrders = currentOrders.filter((order) => order.status === 'paid');
    const previousPaidOrders = previousOrders.filter((order) => order.status === 'paid');

    const currentRevenue = currentPaidOrders.reduce((sum, order) => sum + order.amount, 0);
    const previousRevenue = previousPaidOrders.reduce((sum, order) => sum + order.amount, 0);

    revenueTrend = buildTrend(currentRevenue, previousRevenue);
    ordersTrend = buildTrend(currentOrders.length, previousOrders.length);

    const currentProducts = products.filter(
      (product) => product.createdAt >= currentPeriodStart,
    );
    const previousProducts = products.filter(
      (product) =>
        product.createdAt >= previousPeriodStart &&
        product.createdAt < currentPeriodStart,
    );
    productsTrend = buildTrend(currentProducts.length, previousProducts.length);

    revenueSeries = buildWeeklySeries(
      paidOrders,
      (order) => order.createdAt,
      (order) => order.amount,
      now,
    );
    ordersSeries = buildWeeklySeries(
      periodOrders,
      (order) => order.createdAt,
      () => 1,
      now,
    );
    productsSeries = buildWeeklySeries(
      products,
      (product) => product.createdAt,
      () => 1,
      now,
    );
  } catch {
    // Graceful fallback for initial schema state
  }

  const featuredProducts = products.slice(0, 6);

  return (
    <div className={styles.container}>
      <PageHeader
        title={`Hello, ${session.user.name}`}
        description="Here is what is happening with your payment links today."
      >
        <Link href="/products/new">
          <Button variant="primary" size="md">
            + Create New Product
          </Button>
        </Link>
      </PageHeader>

      {/* Metrics Grid */}
      <div className={styles.metricsGrid}>
        <MetricCard
          label="Total Revenue"
          value={formatNaira(totalRevenueKobo)}
          caption={`${paidOrdersCount} successful ${
            paidOrdersCount === 1 ? 'payment' : 'payments'
          }`}
          direction={revenueTrend.direction}
          changePercent={revenueTrend.changePercent}
          comparisonLabel={COMPARISON_LABEL}
          series={revenueSeries}
        />

        <MetricCard
          label="Active Products"
          value={products.length.toString()}
          caption="Live shareable links"
          direction={productsTrend.direction}
          changePercent={productsTrend.changePercent}
          comparisonLabel={COMPARISON_LABEL}
          series={productsSeries}
        />

        <MetricCard
          label="Total Orders"
          value={totalOrdersCount.toString()}
          caption="All customer checkouts"
          direction={ordersTrend.direction}
          changePercent={ordersTrend.changePercent}
          comparisonLabel={COMPARISON_LABEL}
          series={ordersSeries}
        />
      </div>

      {/* Active Product Links Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Your Active Products</h2>
          {products.length > 0 && (
            <Link href="/products" className={styles.viewAllLink}>
              View all products <MdArrowForward size={16} aria-hidden="true" />
            </Link>
          )}
        </div>

        {featuredProducts.length === 0 ? (
          <EmptyState
            icon={<MdShoppingBag size={40} aria-hidden="true" />}
            title="No products created yet"
            description="Create your first product and generate an instant payment link to start selling on WhatsApp or Instagram."
            action={
              <Link href="/products/new">
                <Button variant="primary">Create Your First Product</Button>
              </Link>
            }
          />
        ) : (
          <div className={styles.productsGrid}>
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* Recent Orders Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent Orders</h2>
          {orders.length > 0 && (
            <Link href="/orders" className={styles.viewAllLink}>
              View all orders <MdArrowForward size={16} aria-hidden="true" />
            </Link>
          )}
        </div>

        {orders.length === 0 ? (
          <EmptyState
            icon={<MdPayment size={40} aria-hidden="true" />}
            title="No orders yet"
            description="When buyers click your payment links and pay via Flutterwave, their transactions will appear here in real-time."
          />
        ) : (
          <OrdersTable orders={orders} />
        )}
      </section>
    </div>
  );
}
