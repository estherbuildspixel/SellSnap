import React from 'react';
import Link from 'next/link';
import { MdShoppingBag } from 'react-icons/md';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ProductCard } from '@/components/product/ProductCard';
import { deleteProductAction } from './actions';
import type { ProductDto } from '@/lib/types';
import styles from './products.module.css';

export default async function ProductsPage() {
  const session = await getSession();
  if (!session) return null;

  let products: ProductDto[] = [];
  try {
    const raw = await db.product.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
    });
    products = raw as unknown as ProductDto[];
  } catch {
    // fallback
  }

  return (
    <div className={styles.container}>
      <PageHeader
        title="Products & Payment Links"
        description="Share these links anywhere to collect direct payments from your customers."
      >
        <Link href="/products/new">
          <Button variant="primary" size="md">
            + Create Product
          </Button>
        </Link>
      </PageHeader>

      {products.length === 0 ? (
        <EmptyState
          icon={<MdShoppingBag size={40} aria-hidden="true" />}
          title="No products yet"
          description="Create your first product to generate a shareable link you can send on WhatsApp or Instagram."
          action={
            <Link href="/products/new">
              <Button variant="primary">Create Your First Product</Button>
            </Link>
          }
        />
      ) : (
        <div className={styles.grid}>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onDelete={async (id) => {
                'use server';
                await deleteProductAction(id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
