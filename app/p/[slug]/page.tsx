import React, { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MdCheck,
  MdErrorOutline,
  MdInventory2,
  MdLock,
} from 'react-icons/md';
import { db } from '@/lib/db';
import { formatNaira } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { PriceTag } from '@/components/product/PriceTag';
import { CheckoutForm } from './_components/CheckoutForm';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
};

// generateMetadata and the page render in the same request, so cache() keeps
// this to one database round trip per product view.
const getProductBySlug = cache(async (slug: string) =>
  db.product.findUnique({
    where: { uniqueSlug: slug },
    include: { user: true },
  })
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const product = await getProductBySlug(slug);

    if (!product) {
      return {
        title: 'Product Not Available — SellSnap',
        description: 'This product is no longer available.',
      };
    }

    const priceFormatted = formatNaira(product.price);
    const seller = product.user?.businessName || 'Verified Vendor';

    return {
      title: `${product.name} — ${priceFormatted} | Buy on SellSnap`,
      description: `${product.description.slice(0, 160)} — Sold by ${seller}`,
      openGraph: {
        title: `${product.name} — ${priceFormatted}`,
        description: product.description.slice(0, 160),
        images: product.imageUrl ? [{ url: product.imageUrl }] : [],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: `${product.name} — ${priceFormatted}`,
        description: product.description.slice(0, 160),
        images: product.imageUrl ? [product.imageUrl] : [],
      },
    };
  } catch {
    return {
      title: 'Product Checkout — SellSnap',
    };
  }
}

export default async function PublicProductPage({ params }: Props) {
  const { slug } = await params;

  let product = null;
  try {
    product = await getProductBySlug(slug);
  } catch {
    // DB offline or error
  }

  // Business Rule: If a product is deleted or doesn't exist, return "Product not available" page, NOT a 404
  if (!product) {
    return (
      <main className={styles.unavailableWrapper}>
        <Card className={styles.unavailableCard} variant="elevated">
          <div className={styles.unavailableIcon}>
            <MdErrorOutline size={40} aria-hidden="true" />
          </div>
          <h1 className={styles.unavailableTitle}>Product not available</h1>
          <p className={styles.unavailableDesc}>
            This product is no longer available or the payment link has expired. Please contact the seller directly for an updated link.
          </p>
          <Link href="/" className={styles.homeLink}>
            Return to SellSnap
          </Link>
        </Card>
      </main>
    );
  }

  const priceFormatted = formatNaira(product.price);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        {/* Seller Info Header */}
        <header className={styles.sellerHeader}>
          <div className={styles.sellerBadge}>
            <span className={styles.checkIcon}>
              <MdCheck size={12} aria-hidden="true" />
            </span>
            <span className={styles.sellerName}>
              Sold by {product.user?.businessName || product.user?.name || 'Verified Vendor'}
            </span>
          </div>
          <span className={styles.secureBadge}>
            <MdLock size={14} aria-hidden="true" />
            Secure Link
          </span>
        </header>

        {/* Product Card Container */}
        <Card className={styles.productCard} variant="elevated">
          <div className={styles.mediaContainer}>
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={product.name}
                className={styles.productImage}
              />
            ) : (
              <div className={styles.imageFallback}>
                <MdInventory2 size={64} aria-hidden="true" />
              </div>
            )}
          </div>

          <div className={styles.details}>
            <div className={styles.headerInfo}>
              <h1 className={styles.productTitle}>{product.name}</h1>
              <div className={styles.priceRow}>
                <PriceTag priceInKobo={product.price} size="lg" />
              </div>
            </div>

            <div className={styles.descriptionBox}>
              <p className={styles.description}>{product.description}</p>
            </div>

            <hr className={styles.divider} />

            {/* Instant Checkout Section */}
            <section className={styles.checkoutSection}>
              <h2 className={styles.checkoutTitle}>Express Checkout</h2>
              <CheckoutForm
                slug={product.uniqueSlug}
                priceInNairaFormatted={priceFormatted}
              />
            </section>
          </div>
        </Card>

        {/* Brand Footer */}
        <footer className={styles.brandFooter}>
          <Link href="/" className={styles.poweredBy}>
            Powered by <strong>SellSnap</strong>
          </Link>
        </footer>
      </div>
    </main>
  );
}
