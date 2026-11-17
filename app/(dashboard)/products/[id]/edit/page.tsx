import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { ProductForm } from '../../_components/ProductForm';
import type { ProductDto } from '@/lib/types';

type EditProductPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditProductPage({ params }: EditProductPageProps) {
  const session = await getSession();
  if (!session) return null;

  const { id } = await params;
  const product = await db.product.findFirst({
    where: { id, userId: session.userId },
  });

  if (!product) notFound();

  return <ProductForm product={product as unknown as ProductDto} />;
}
