'use server';

import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/auth';
import { isWholeNaira } from '@/lib/utils';
import { validateProductImageDataUrl } from '@/lib/product-image';
import { generateProductSlug } from '@/lib/product-slug';
import type { ActionResult } from '@/lib/types';

const productSchema = z.object({
  name: z.string().min(2, 'Product name must be at least 2 characters').max(100),
  description: z.string().min(5, 'Description must be at least 5 characters').max(1000),
  priceNaira: z.coerce.number().positive('Price must be greater than 0'),
  imageUrl: z
    .string()
    .min(1, 'Please provide a product image')
    .max(3_000_000, 'Image is too large.'),
});

const MAX_SLUG_ATTEMPTS = 5;

export async function createProductAction(formData: FormData): Promise<ActionResult> {
  try {
    // 1. Authenticate
    const session = await getSession();
    if (!session) {
      return { ok: false, error: { code: 'unauthorized', message: 'Please sign in to create products.' } };
    }

    // 2. Validate
    const rawData = {
      name: formData.get('name'),
      description: formData.get('description'),
      priceNaira: formData.get('priceNaira'),
      imageUrl: formData.get('imageUrl'),
    };

    const parsed = productSchema.safeParse(rawData);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Please check your inputs.';
      return { ok: false, error: { code: 'invalid_input', message } };
    }

    const { name, description, priceNaira, imageUrl } = parsed.data;

    // Price must be whole naira (multiple of 100 kobo)
    const priceKobo = Math.round(priceNaira * 100);
    if (!isWholeNaira(priceKobo)) {
      return {
        ok: false,
        error: { code: 'invalid_price', message: 'Price must be a whole Naira amount (e.g., ₦5,000).' },
      };
    }

    const image = validateProductImageDataUrl(imageUrl);
    if (!image.ok) {
      return {
        ok: false,
        error: { code: 'invalid_image', message: image.message },
      };
    }

    // 3. Create the product. The database's unique constraint is the source of
    // truth for slug collisions, so retry with a fresh suffix on P2002.
    let created: { id: string; uniqueSlug: string } | null = null;

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const uniqueSlug = generateProductSlug(name);

      try {
        created = await db.product.create({
          data: {
            userId: session.userId,
            name,
            description,
            price: priceKobo,
            imageUrl,
            uniqueSlug,
          },
          select: { id: true, uniqueSlug: true },
        });
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          logger.warn('product.slug_collision', {
            userId: session.userId,
            attempt: attempt + 1,
          });
          continue;
        }

        throw error;
      }
    }

    if (!created) {
      logger.error('product.slug_exhausted', { userId: session.userId });
      return {
        ok: false,
        error: { code: 'server_error', message: 'Could not create product. Please try again.' },
      };
    }

    revalidatePath('/products');
    revalidatePath('/dashboard');
    logger.info('product.created', {
      productId: created.id,
      userId: session.userId,
      slug: created.uniqueSlug,
    });

    return { ok: true, data: created };
  } catch (error) {
    logger.error('action.create_product.failed', { error });
    return { ok: false, error: { code: 'server_error', message: 'Could not create product. Please try again.' } };
  }
}

export async function updateProductAction(
  productId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    // 1. Authenticate
    const session = await getSession();
    if (!session) {
      return { ok: false, error: { code: 'unauthorized', message: 'Please sign in to update products.' } };
    }

    // 2. Validate
    const rawData = {
      name: formData.get('name'),
      description: formData.get('description'),
      priceNaira: formData.get('priceNaira'),
      imageUrl: formData.get('imageUrl'),
    };

    const parsed = productSchema.safeParse(rawData);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Please check your inputs.';
      return { ok: false, error: { code: 'invalid_input', message } };
    }

    const { name, description, priceNaira, imageUrl } = parsed.data;

    const priceKobo = Math.round(priceNaira * 100);
    if (!isWholeNaira(priceKobo)) {
      return {
        ok: false,
        error: { code: 'invalid_price', message: 'Price must be a whole Naira amount (e.g., ₦5,000).' },
      };
    }

    // 3. Authorize: load the row and confirm ownership before touching it.
    const existing = await db.product.findUnique({ where: { id: productId } });
    if (!existing) {
      return { ok: false, error: { code: 'not_found', message: 'Product not found.' } };
    }

    if (existing.userId !== session.userId) {
      return { ok: false, error: { code: 'forbidden', message: 'You do not have permission to edit this product.' } };
    }

    // 4. Validate a replacement image. Existing products may predate upload
    // validation (for example, remote image URLs), so keep the current image
    // unless the seller actually replaces it.
    if (imageUrl !== existing.imageUrl) {
      const image = validateProductImageDataUrl(imageUrl);
      if (!image.ok) {
        return {
          ok: false,
          error: { code: 'invalid_image', message: image.message },
        };
      }
    }

    // 5. Update. The slug is intentionally preserved so the public link never changes.
    const updated = await db.product.update({
      where: { id: productId },
      data: { name, description, price: priceKobo, imageUrl },
      select: { id: true, uniqueSlug: true },
    });

    revalidatePath('/products');
    revalidatePath('/dashboard');
    revalidatePath(`/p/${existing.uniqueSlug}`);
    logger.info('product.updated', { productId, userId: session.userId });

    return { ok: true, data: updated };
  } catch (error) {
    logger.error('action.update_product.failed', { productId, error });
    return { ok: false, error: { code: 'server_error', message: 'Could not update product. Please try again.' } };
  }
}

export async function deleteProductAction(productId: string): Promise<ActionResult> {
  try {
    // 1. Authenticate
    const session = await getSession();
    if (!session) {
      return { ok: false, error: { code: 'unauthorized', message: 'Please sign in.' } };
    }

    // 2. Authorize
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) {
      return { ok: false, error: { code: 'not_found', message: 'Product not found.' } };
    }

    if (product.userId !== session.userId) {
      return { ok: false, error: { code: 'forbidden', message: 'You do not have permission to delete this product.' } };
    }

    // 3. Delete
    await db.product.delete({ where: { id: productId } });

    revalidatePath('/products');
    revalidatePath('/dashboard');
    logger.info('product.deleted', { productId, userId: session.userId });

    return { ok: true, data: { deleted: true } };
  } catch (error) {
    logger.error('action.delete_product.failed', { productId, error });
    return { ok: false, error: { code: 'server_error', message: 'Failed to delete product.' } };
  }
}
