'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MdArrowBack, MdPhotoCamera } from 'react-icons/md';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { createProductAction, updateProductAction } from '../actions';
import { generateSlug } from '@/lib/utils';
import type { ProductDto } from '@/lib/types';
import styles from './ProductForm.module.css';

export type ProductFormProps = {
  product?: ProductDto;
};

export function ProductForm({ product }: ProductFormProps) {
  const router = useRouter();
  const isEditing = Boolean(product);
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [priceNaira, setPriceNaira] = useState(product ? String(product.price / 100) : '');
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('priceNaira', priceNaira);
    formData.append('imageUrl', imageUrl);

    const result = product
      ? await updateProductAction(product.id, formData)
      : await createProductAction(formData);

    if (!result.ok) {
      setError(result.error.message);
      setIsSubmitting(false);
      return;
    }

    router.push('/products');
    router.refresh();
  };

  const predictedSlug = product?.uniqueSlug ?? (name ? generateSlug(name) : 'your-product-xxxx');

  return (
    <div className={styles.container}>
      <div className={styles.topNav}>
        <Link href="/products" className={styles.backLink}>
          <MdArrowBack size={18} aria-hidden="true" />
          Back to Products
        </Link>
      </div>

      <div className={styles.header}>
        <h1 className={styles.title}>{isEditing ? 'Edit Product' : 'Create New Product'}</h1>
        <p className={styles.subtitle}>
          {isEditing
            ? 'Update your product details. Your payment link stays the same.'
            : 'Fill in product details to generate your instant payment link.'}
        </p>
      </div>

      {error && (
        <div className={styles.errorAlert} role="alert">
          {error}
        </div>
      )}

      <div className={styles.layout}>
        <Card className={styles.formCard} variant="elevated">
          <form onSubmit={handleSubmit} className={styles.form}>
            <Input
              label="Product Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vintage Leather Jacket"
              required
            />

            <div className={styles.fieldGroup}>
              <label htmlFor="description" className={styles.label}>
                Product Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your item, sizing, or delivery terms..."
                className={styles.textarea}
                rows={4}
                required
              />
            </div>

            <Input
              label="Price (in Naira ₦)"
              type="number"
              step="1"
              min="100"
              value={priceNaira}
              onChange={(e) => setPriceNaira(e.target.value)}
              placeholder="15000"
              hint="Whole Naira amount only (e.g. ₦15,000)"
              required
            />

            <div className={styles.fieldGroup}>
              <label htmlFor="product-image" className={styles.label}>
                Product Image
              </label>
              <input
                id="product-image"
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleFileUpload}
                className={styles.fileInput}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={isSubmitting}
              className={styles.submitBtn}
            >
              {isSubmitting
                ? isEditing
                  ? 'Saving Changes...'
                  : 'Creating Product...'
                : isEditing
                  ? 'Save Changes'
                  : 'Create & Generate Payment Link'}
            </Button>
          </form>
        </Card>

        <div className={styles.previewPane}>
          <span className={styles.previewHeading}>Live Link Preview</span>
          <Card className={styles.previewCard} variant="outlined">
            <div className={styles.previewImage}>
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="Preview" className={styles.img} />
              ) : (
                <span className={styles.imgPlaceholder}>
                  <MdPhotoCamera size={24} aria-hidden="true" />
                  Image Preview
                </span>
              )}
            </div>

            <div className={styles.previewInfo}>
              <h4 className={styles.previewTitle}>{name || 'Product Title'}</h4>
              <p className={styles.previewDesc}>{description || 'Product description will appear here...'}</p>
              <span className={styles.previewPrice}>
                {priceNaira ? `₦${Number(priceNaira).toLocaleString('en-NG')}` : '₦0'}
              </span>
            </div>

            <div className={styles.previewLinkBox}>
              <span className={styles.previewLinkLabel}>Shareable Link:</span>
              <code className={styles.previewLinkUrl}>/p/{predictedSlug}</code>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
