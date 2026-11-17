'use client';

import React, { useSyncExternalStore, useState } from 'react';
import Link from 'next/link';
import {
  MdCheck,
  MdContentCopy,
  MdDelete,
  MdEdit,
  MdShare,
  MdShoppingBag,
} from 'react-icons/md';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PriceTag } from './PriceTag';
import type { ProductDto } from '@/lib/types';
import styles from './ProductCard.module.css';

export type ProductCardProps = {
  product: ProductDto;
  onDelete?: (id: string) => Promise<void>;
};

const subscribeToWindow = () => () => {};
const getWindowOrigin = () => window.location.origin;
const getServerOrigin = () => '';

export function ProductCard({ product, onDelete }: ProductCardProps) {
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const origin = useSyncExternalStore(
    subscribeToWindow,
    getWindowOrigin,
    getServerOrigin,
  );
  const productUrl = `${origin}/p/${product.uniqueSlug}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(productUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const shareMessage = encodeURIComponent(`Buy ${product.name} here: ${productUrl}`);
  const shareUrl = `https://wa.me/?text=${shareMessage}`;

  return (
    <Card className={styles.card} variant="elevated">
      <div className={styles.imageContainer}>
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt={product.name} className={styles.image} />
        ) : (
          <div className={styles.placeholderImage}>
            <MdShoppingBag size={40} aria-hidden="true" />
          </div>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.info}>
          <h3 className={styles.name}>{product.name}</h3>
          <p className={styles.description}>{product.description}</p>
          <PriceTag priceInKobo={product.price} size="lg" />
        </div>

        <div className={styles.linkBanner}>
          <span className={styles.slug}>/p/{product.uniqueSlug}</span>
          <button
            type="button"
            onClick={handleCopyLink}
            className={styles.copyBtn}
            aria-label="Copy payment link"
          >
            {copied ? (
              <MdCheck size={16} aria-hidden="true" />
            ) : (
              <MdContentCopy size={16} aria-hidden="true" />
            )}
            <span>{copied ? 'Copied' : 'Copy Link'}</span>
          </button>
        </div>

        <div className={styles.actions}>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.shareLink}
          >
            <Button variant="primary" size="md" className={styles.shareBtn}>
              <MdShare size={18} aria-hidden="true" />
              Share
            </Button>
          </a>

          <Link href={`/products/${product.id}/edit`}>
            <Button variant="secondary" size="sm">
              <MdEdit size={16} aria-hidden="true" />
              Edit
            </Button>
          </Link>

          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              className={styles.deleteBtn}
              disabled={isDeleting}
              onClick={async () => {
                if (confirm('Are you sure you want to delete this product?')) {
                  setIsDeleting(true);
                  await onDelete(product.id);
                  setIsDeleting(false);
                }
              }}
            >
              <MdDelete size={16} aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
