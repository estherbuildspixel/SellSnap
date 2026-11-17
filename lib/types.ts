export type ApiResponseSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiResponseFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export type ApiResponse<T> = ApiResponseSuccess<T> | ApiResponseFailure;

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export type OrderStatus = 'pending' | 'paid' | 'failed';

export type ProductDto = {
  id: string;
  userId: string;
  name: string;
  description: string;
  price: number; // in kobo
  imageUrl: string;
  uniqueSlug: string;
  createdAt: Date;
};

export type OrderDto = {
  id: string;
  productId: string;
  buyerEmail: string | null;
  amount: number; // in kobo
  status: OrderStatus;
  transactionReference: string;
  createdAt: Date;
  product?: ProductDto;
};
